import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The one-by-one batch loop, driven against an in-memory ledger.
 *
 * What is under test is the safety property, not the call sequence: every email
 * is sent while the run holds the org's single 'sending' row, no invoice is sent
 * twice, and a failure stops the run with the remainder still outstanding. So the
 * queries layer is replaced by a small fake that enforces the same rules the
 * database does (one 'sending' slot per org, closing only a 'sending' row), and
 * assertions are made on the resulting ledger rather than on call counts.
 */

const h = vi.hoisted(() => {
  class AlreadySendingError extends Error {}

  interface Inv {
    invoice_id: number;
    service: string;
    invoice_number: string | null;
    currency: string;
    value: number;
    effective_date: string;
    pdf_id: string | null;
  }
  interface Closed {
    invoiceCount: number;
    error: string | null | undefined;
  }

  const RECIPIENT = 'accountant@example.com';

  const state = {
    nextId: 1,
    /** Stands in for the partial unique index: at most one 'sending' row. */
    sendingId: null as number | null,
    stale: false,
    items: new Map<number, number[]>(),
    closed: new Map<number, Closed>(),
    discarded: [] as number[],
    invoices: [] as Inv[],
    tracked: new Set<number>(),
    settingsEmail: RECIPIENT as string | null,
    sendMode: 'individual' as 'bulk' | 'individual',
    sent: [] as { invoiceId: number; to: string }[],
  };

  const byId = (id: number) => state.invoices.find((i) => i.invoice_id === id) as Inv;

  const reset = (count: number) => {
    state.nextId = 1;
    state.sendingId = null;
    state.stale = false;
    state.items = new Map();
    state.closed = new Map();
    state.discarded = [];
    state.tracked = new Set();
    state.settingsEmail = RECIPIENT;
    state.sendMode = 'individual';
    state.sent = [];
    state.invoices = Array.from({ length: count }, (_, k) => ({
      invoice_id: k + 1,
      service: 'Acme',
      invoice_number: `INV-${k + 1}`,
      currency: 'GBP',
      value: 1000,
      effective_date: '2026-01-01',
      pdf_id: null,
    }));
  };

  const q = {
    sendingAccount: vi.fn(async () => ({
      id: 1,
      email_address: 'me@example.com',
      status: 'active',
      scopes: ['send'],
    })),
    getAccountantSettings: vi.fn(async () => ({
      email: state.settingsEmail,
      sendMode: state.sendMode,
    })),
    untrackedInvoices: vi.fn(async () =>
      state.invoices.filter((i) => !state.tracked.has(i.invoice_id)),
    ),
    deliveryInvoices: vi.fn(async (_org: number, id: number) =>
      (state.items.get(id) ?? []).map(byId),
    ),
    sendingDelivery: vi.fn(async () =>
      state.sendingId === null
        ? undefined
        : { id: state.sendingId, recipient: RECIPIENT, currency: 'GBP', stale: state.stale },
    ),
    startDelivery: vi.fn(async () => {
      if (state.sendingId !== null) throw new AlreadySendingError('already sending');
      const id = state.nextId++;
      state.sendingId = id;
      state.items.set(id, []);
      return id;
    }),
    recordDeliveredItem: vi.fn(async (id: number, invoiceId: number) => {
      state.items.get(id)?.push(invoiceId);
      state.tracked.add(invoiceId);
    }),
    finishDelivery: vi.fn(
      async (id: number, totals: { invoiceCount: number; error?: string | null }) => {
        // First writer wins, as in the real query.
        if (state.sendingId !== id) return;
        state.sendingId = null;
        state.closed.set(id, { invoiceCount: totals.invoiceCount, error: totals.error });
      },
    ),
    discardEmptyDelivery: vi.fn(async (_org: number, id: number) => {
      if (state.sendingId === id && (state.items.get(id) ?? []).length === 0) {
        state.sendingId = null;
        state.items.delete(id);
        state.discarded.push(id);
      }
    }),
    recordDelivery: vi.fn(),
    recordFailedDelivery: vi.fn(),
  };

  const record = (mail: { to: string; subject: string }) => {
    state.sent.push({ invoiceId: Number(/INV-(\d+)/.exec(mail.subject)?.[1]), to: mail.to });
  };
  const defaultSend = async (_account: number, mail: { to: string; subject: string }) => {
    record(mail);
  };
  const gmail = { sendAsAccount: vi.fn(defaultSend), record, defaultSend };

  const enqueue = vi.fn(async (..._args: unknown[]) => {});

  return { AlreadySendingError, RECIPIENT, state, reset, q, gmail, enqueue };
});

vi.mock('../../src/db/client.js', () => ({ db: {}, pool: {} }));

vi.mock('../../src/queries/accountant.js', () => ({
  AlreadySendingError: h.AlreadySendingError,
  ...h.q,
}));

vi.mock('../../src/gmail/send.js', () => ({
  MAX_ATTACHMENT_BYTES: 20_000_000,
  GmailSendScopeMissingError: class extends Error {},
  grantCanSend: () => true,
  sendAsAccount: h.gmail.sendAsAccount,
}));

vi.mock('../../src/mongo/pdfs.js', () => ({ getPdf: vi.fn(async () => Buffer.from('pdf')) }));

vi.mock('../../src/queries/converted.js', () => ({
  converterFor: vi.fn(async () => (value: number) => ({
    minor: value,
    rate: { rateDate: '2026-01-01', source: 'identity' },
  })),
  ConversionTracker: class {
    note() {}
    meta() {
      return { source_currencies: [] };
    }
  },
}));

vi.mock('../../src/queries/meta.js', () => ({ getOrg: vi.fn(async () => ({ name: 'Org' })) }));
vi.mock('../../src/queue/queues.js', () => ({ enqueue: h.enqueue }));

const { runIndividualSend, sendOutstanding, sweepStaleRun } = await import(
  '../../src/accountant/deliver.js'
);

const { state } = h;
const ORG = 1;
const job = (deliveryId: number) => ({
  orgId: ORG,
  currency: 'GBP',
  recipient: h.RECIPIENT,
  deliveryId,
});

/** Opens row 1 the way the API does before enqueueing. */
async function openFirstRow() {
  return h.q.startDelivery();
}

function deps() {
  return { hold: vi.fn(async () => {}), sleep: vi.fn(async () => {}) };
}

function sentIds() {
  return state.sent.map((s) => s.invoiceId);
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations; a test that overrode the send must not
  // leak its failure into the next one.
  h.gmail.sendAsAccount.mockImplementation(h.gmail.defaultSend);
});

describe('runIndividualSend', () => {
  it('delivers every outstanding invoice in rows of at most 25', async () => {
    h.reset(60);
    const id = await openFirstRow();
    const d = deps();

    const result = await runIndividualSend(job(id), d);

    expect(typeof result).toBe('string');
    expect([...state.items.values()].map((v) => v.length)).toEqual([25, 25, 10]);
    expect(state.closed.size).toBe(3);
    expect(state.sendingId).toBeNull();
    expect(d.hold.mock.calls.map((c) => c[0])).toEqual([2, 3]);
    expect(h.gmail.sendAsAccount).toHaveBeenCalledTimes(60);
    expect(new Set(sentIds()).size).toBe(60);
    // Spaced between sends, never before the run's very first.
    expect(d.sleep).toHaveBeenCalledTimes(59);
    expect(d.sleep.mock.calls.every((c) => c[0] === 500)).toBe(true);
  });

  it('delivers a 337-invoice backlog as 14 rows', async () => {
    h.reset(337);
    const id = await openFirstRow();

    await runIndividualSend(job(id), deps());

    const sizes = [...state.items.values()].map((v) => v.length);
    expect(sizes).toHaveLength(14);
    expect(sizes.slice(0, 13).every((n) => n === 25)).toBe(true);
    expect(sizes[13]).toBe(12);
    expect(new Set(sentIds()).size).toBe(337);
    expect(state.sendingId).toBeNull();
  });

  it('stops on a failed send: keeps what went, closes the row with the error, starts nothing new', async () => {
    h.reset(60);
    const id = await openFirstRow();
    let calls = 0;
    h.gmail.sendAsAccount.mockImplementation(async (_a, mail) => {
      calls += 1;
      if (calls === 30) throw new Error('boom');
      state.sent.push({ invoiceId: Number(/INV-(\d+)/.exec(mail.subject)?.[1]), to: mail.to });
    });

    const result = await runIndividualSend(job(id), deps());

    expect(typeof result).toBe('string');
    expect(state.closed.get(2)).toEqual({ invoiceCount: 4, error: 'boom' });
    expect(state.nextId).toBe(3); // no row 3 was ever opened
    expect(state.sendingId).toBeNull();
    expect(state.invoices.filter((i) => !state.tracked.has(i.invoice_id))).toHaveLength(31);
  });

  it('resumes a held row after a stall without resending what it already recorded', async () => {
    h.reset(60);
    const id = await openFirstRow();
    for (let n = 1; n <= 10; n++) await h.q.recordDeliveredItem(id, n);
    const d = deps();

    await runIndividualSend(job(id), d);

    expect(state.items.get(1)).toHaveLength(25);
    expect(state.items.get(1)?.slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(sentIds().filter((n) => n <= 10)).toEqual([]);
    expect(sentIds()).toHaveLength(50);
    expect(d.hold.mock.calls.map((c) => c[0])).toEqual([2, 3]);
  });

  it('does nothing when another row holds the slot', async () => {
    h.reset(10);
    state.sendingId = 7;

    const result = await runIndividualSend(job(1), deps());

    expect(typeof result).toBe('string');
    expect(h.gmail.sendAsAccount).not.toHaveBeenCalled();
    expect(state.sendingId).toBe(7);
    expect(state.closed.size).toBe(0);
  });

  it('stops before the next send once the hold is lost mid-batch', async () => {
    h.reset(30);
    const id = await openFirstRow();
    let calls = 0;
    h.gmail.sendAsAccount.mockImplementation(async (_a, mail) => {
      calls += 1;
      state.sent.push({ invoiceId: Number(/INV-(\d+)/.exec(mail.subject)?.[1]), to: mail.to });
      if (calls === 5) state.sendingId = null; // swept as stale by a request
    });

    await runIndividualSend(job(id), deps());

    expect(sentIds()).toHaveLength(5);
  });

  it('never mails a new address after the recipient changed', async () => {
    h.reset(60);
    const id = await openFirstRow();
    let calls = 0;
    h.gmail.sendAsAccount.mockImplementation(async (_a, mail) => {
      calls += 1;
      state.sent.push({ invoiceId: Number(/INV-(\d+)/.exec(mail.subject)?.[1]), to: mail.to });
      if (calls === 25) state.settingsEmail = 'new@example.com';
    });

    await runIndividualSend(job(id), deps());

    expect(sentIds()).toHaveLength(25);
    expect(state.sent.every((s) => s.to === h.RECIPIENT)).toBe(true);
    expect(state.closed.get(1)).toEqual({ invoiceCount: 25, error: null });
    expect(state.nextId).toBe(2);
  });

  it('discards a freshly opened row that finds nothing to send', async () => {
    h.reset(0);
    const id = await openFirstRow();

    await runIndividualSend(job(id), deps());

    expect(state.discarded).toEqual([id]);
    expect(state.closed.size).toBe(0);
    expect(state.sendingId).toBeNull();
  });
});

describe('sweepStaleRun', () => {
  it('closes a stale row from its recorded invoices, naming the interruption', async () => {
    h.reset(10);
    const id = await openFirstRow();
    for (const n of [1, 2, 3]) await h.q.recordDeliveredItem(id, n);
    state.stale = true;

    const live = await sweepStaleRun(ORG);

    expect(live).toBeUndefined();
    const closed = state.closed.get(id);
    expect(closed?.invoiceCount).toBe(3);
    expect(closed?.error).toMatch(/interrupted/);
    expect(state.sendingId).toBeNull();
  });

  it('returns a live row untouched', async () => {
    h.reset(10);
    const id = await openFirstRow();

    const live = await sweepStaleRun(ORG);

    expect(live?.id).toBe(id);
    expect(state.closed.size).toBe(0);
    expect(state.sendingId).toBe(id);
  });
});

describe('sendOutstanding', () => {
  it('opens a row and enqueues the run in individual mode', async () => {
    h.reset(5);

    const result = await sendOutstanding(ORG, 'GBP');

    expect(result).toMatchObject({ mode: 'individual', status: 'sending', outstanding_count: 5 });
    expect(h.enqueue).toHaveBeenCalledWith(
      'accountant-send',
      { orgId: ORG, currency: 'GBP', recipient: h.RECIPIENT, deliveryId: 1 },
      { jobId: 'accountant-send-1-1', attempts: 1 },
    );
    expect(state.sendingId).toBe(1);
  });

  it('refuses both modes while a run is live', async () => {
    h.reset(5);
    state.sendingId = 3;

    state.sendMode = 'individual';
    await expect(sendOutstanding(ORG, 'GBP')).rejects.toBeInstanceOf(h.AlreadySendingError);
    state.sendMode = 'bulk';
    await expect(sendOutstanding(ORG, 'GBP')).rejects.toBeInstanceOf(h.AlreadySendingError);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it('closes the opened row as failed when enqueueing fails', async () => {
    h.reset(5);
    h.enqueue.mockRejectedValueOnce(new Error('redis down'));

    await expect(sendOutstanding(ORG, 'GBP')).rejects.toThrow('redis down');

    expect(state.sendingId).toBeNull();
    expect(state.closed.get(1)?.error).toBe('could not start sending: redis down');
  });
});
