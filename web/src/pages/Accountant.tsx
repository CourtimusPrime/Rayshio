import { AlertTriangleIcon, CheckIcon, Loader2Icon, SendIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAccountant, useSendToAccountant, useSetAccountantEmail } from '../api/hooks';
import { AnimatedCount, AnimatedCurrency } from '../components/AnimatedNumber';
import { ServiceLogo } from '../components/ServiceLogo';
import { EmptyNote, ErrorNote, LoadingBlock } from '../components/states';
import { useWorkspace } from '../state/workspace';
import type { AccountantDelivery, AccountantSummary, SendBlocker } from '../types';
import { formatCurrency, formatDate, formatRelativeTime } from '../utils/format';

const CARD = 'rounded-xl border border-line bg-surface shadow-card';

/**
 * Each reason sending is unavailable, and the one action that fixes it.
 *
 * Three separate sentences rather than one "sending is unavailable", because
 * the fixes are different and none of them is guessable: connect a mailbox,
 * reconnect a revoked one, or reconnect one that pre-dates sending and so was
 * only ever granted permission to read.
 */
const BLOCKER_COPY: Record<SendBlocker, (sender: string | null) => string> = {
  no_mailbox: () =>
    'No Gmail account is connected, and invoices are sent from your own mailbox. Connect one to enable sending.',
  mailbox_revoked: (sender) =>
    `${sender ?? 'The connected mailbox'} is no longer authorised. Reconnect it to send from it again.`,
  missing_send_scope: (sender) =>
    `${sender ?? 'Your mailbox'} was connected before Rayshio could send mail, so it only has permission to read. Reconnect it to grant permission to send.`,
};

/**
 * Everything outstanding, in one send.
 *
 * The tab has no invoice picker on purpose. Rayshio already knows which
 * invoices this address has been sent — that ledger is what "outstanding"
 * means — so the only decision left is *whether* to send, and a list of
 * checkboxes would exist solely for the user to re-derive an answer the app
 * already has. The cost of getting that wrong is real: an invoice deselected by
 * accident is one nobody claims for.
 */
export function Accountant() {
  const { currency } = useWorkspace();
  const { data, isPending, error } = useAccountant(currency);
  const send = useSendToAccountant();

  // `currency` is undefined until meta arrives; the query is disabled until
  // then, so this is the same wait as the data itself.
  if (!currency) return <LoadingBlock className="h-64" />;
  if (isPending) return <LoadingBlock className="h-64" />;
  if (error) return <ErrorNote message={error.message} />;
  if (!data) return <ErrorNote message="Could not load the accountant settings." />;

  const outstanding = data.summary.invoice_count;
  const canSend = Boolean(data.recipient) && data.can_send && outstanding > 0;

  return (
    <div className="space-y-6">
      <RecipientCard
        recipient={data.recipient}
        sender={data.sender}
        blocker={data.blocker}
      />

      <section aria-labelledby="outstanding-heading" className={`${CARD} p-5 md:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="outstanding-heading" className="text-body font-medium text-ink-900">
              Outstanding invoices
            </h2>
            <p className="mt-1 max-w-xl text-caption leading-relaxed text-ink-500">
              {data.recipient
                ? `Never sent to ${data.recipient}. Each invoice goes out once — sending marks these as delivered, so the next batch starts empty.`
                : 'Set an address above to see what is waiting to be sent.'}
            </p>
          </div>

          <button
            type="button"
            disabled={!canSend || send.isPending}
            onClick={() => send.mutate(currency)}
            className="press flex h-10 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-footnote font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {send.isPending ? (
              <Loader2Icon className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <SendIcon className="h-4 w-4" strokeWidth={1.75} />
            )}
            {send.isPending
              ? 'Sending…'
              : outstanding === 0
                ? 'Nothing to send'
                : `Send ${outstanding} invoice${outstanding === 1 ? '' : 's'}`}
          </button>
        </div>

        <OutstandingFigures summary={data.summary} />

        {data.without_pdf_count > 0 && (
          <p className="mt-4 flex items-start gap-2 text-caption leading-relaxed text-ink-500">
            <AlertTriangleIcon
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn"
              strokeWidth={1.75}
            />
            <span>
              {data.without_pdf_count} of these {data.without_pdf_count === 1 ? 'was' : 'were'}{' '}
              billed in the email body and {data.without_pdf_count === 1 ? 'has' : 'have'} no PDF to
              attach. {data.without_pdf_count === 1 ? 'Its' : 'Their'} figures are listed in the
              covering note instead.
            </span>
          </p>
        )}

        {send.error && (
          <div className="mt-4">
            <ErrorNote message={send.error.message} live="assertive" />
          </div>
        )}

        {send.isSuccess && send.data && (
          <div
            role="status"
            className="mt-4 flex items-start gap-2.5 rounded-lg bg-accent-soft px-3.5 py-3 text-footnote text-accent-strong"
          >
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              Sent {send.data.summary.invoice_count} invoice
              {send.data.summary.invoice_count === 1 ? '' : 's'} to {send.data.recipient} from{' '}
              {send.data.sender} — it is in your Gmail Sent folder.
              {send.data.deferred_count > 0 &&
                ` ${send.data.deferred_count} did not fit in one message and are still outstanding — send again to deliver them.`}
            </span>
          </div>
        )}

        {data.services.length > 0 && (
          <ul className="mt-5 divide-y divide-line border-t border-line">
            {data.services.map((line) => (
              <li key={line.service} className="flex items-center gap-3 py-3">
                <ServiceLogo name={line.service} size="sm" />
                <span className="min-w-0 flex-1 truncate text-body text-ink-900">
                  {line.service}
                </span>
                <span className="shrink-0 text-caption text-ink-500">
                  {line.count} invoice{line.count === 1 ? '' : 's'}
                </span>
                <span className="w-28 shrink-0 text-right text-body tabular-nums text-ink-900">
                  {formatCurrency(line.total_minor, data.summary.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {data.recipient && outstanding === 0 && (
          <div className="mt-5">
            <EmptyNote message={`${data.recipient} has every invoice Rayshio has parsed.`} />
          </div>
        )}
      </section>

      <DeliveryHistory deliveries={data.deliveries} />
    </div>
  );
}

/** The three facts the covering email leads with, shown before it is sent. */
function OutstandingFigures({ summary }: { summary: AccountantSummary }) {
  const period =
    summary.period_start && summary.period_end
      ? summary.period_start === summary.period_end
        ? formatDate(summary.period_start)
        : `${formatDate(summary.period_start)} – ${formatDate(summary.period_end)}`
      : '—';

  return (
    <dl className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
      <Figure label="Invoices">
        <AnimatedCount value={summary.invoice_count} />
      </Figure>
      <Figure label="Services">
        <AnimatedCount value={summary.service_count} />
      </Figure>
      <Figure label="Total">
        <AnimatedCurrency value={summary.total_minor} currency={summary.currency} />
      </Figure>
      <Figure label="Date range">
        <span className="text-body text-ink-900">{period}</span>
      </Figure>
    </dl>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-500">{label}</dt>
      <dd className="mt-1 text-title3 font-medium tabular-nums text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * The address, and the one setting behind it.
 *
 * Saving a *different* address is not a small edit: outstanding is measured per
 * recipient, so the new address starts with the full history. The copy says so
 * rather than letting the count jump from 0 to 300 unexplained.
 */
function RecipientCard({
  recipient,
  sender,
  blocker,
}: {
  recipient: string | null;
  sender: string | null;
  blocker: SendBlocker | null;
}) {
  const save = useSetAccountantEmail();
  const [value, setValue] = useState(recipient ?? '');

  // Re-sync when the server's value arrives or changes underneath the field —
  // without this, a save made in another tab leaves this one showing the old
  // address as if it were still current.
  useEffect(() => setValue(recipient ?? ''), [recipient]);

  const trimmed = value.trim();
  const dirty = trimmed !== (recipient ?? '');

  return (
    <section aria-labelledby="recipient-heading" className={`${CARD} p-5 md:p-6`}>
      <h2 id="recipient-heading" className="text-body font-medium text-ink-900">
        Your accountant
      </h2>
      <p className="mt-1 max-w-xl text-caption leading-relaxed text-ink-500">
        Where invoices are emailed{sender ? `, sent from ${sender}` : ''}. Rayshio tracks what each
        address has already received, so changing this hands the new address your full history
        rather than only what arrives from now on.
      </p>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty) return;
          save.mutate(trimmed === '' ? null : trimmed);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Accountant email address</span>
          <input
            type="email"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="accounts@yourfirm.com"
            className="h-10 w-full min-w-0 rounded-lg border border-line bg-canvas px-3 text-body text-ink-900 placeholder:text-ink-400 focus:border-line-strong focus:bg-surface"
          />
        </label>
        <button
          type="submit"
          disabled={!dirty || save.isPending}
          className="press h-10 shrink-0 rounded-lg bg-accent px-4 text-footnote font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>

      {save.error && (
        <div className="mt-3">
          <ErrorNote message={save.error.message} />
        </div>
      )}

      {blocker && (
        <p className="mt-3 flex items-start gap-2 text-caption leading-relaxed text-ink-500">
          <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" strokeWidth={1.75} />
          <span>{BLOCKER_COPY[blocker](sender)}</span>
        </p>
      )}
    </section>
  );
}

function DeliveryHistory({ deliveries }: { deliveries: AccountantDelivery[] }) {
  return (
    <section aria-labelledby="history-heading" className={CARD}>
      <div className="px-5 py-4 md:px-6">
        <h2 id="history-heading" className="text-body font-medium text-ink-900">
          Sent
        </h2>
        <p className="mt-1 text-caption text-ink-500">
          Every batch, and what was in it. A failed attempt sends nothing and leaves its invoices
          outstanding.
        </p>
      </div>

      {deliveries.length === 0 ? (
        <div className="px-5 pb-5 md:px-6 md:pb-6">
          <EmptyNote message="Nothing has been sent yet." />
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {deliveries.map((delivery) => (
            <li key={delivery.id} className="px-5 py-3 md:px-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body text-ink-900">{delivery.recipient}</span>
                <span className="text-caption text-ink-500">
                  {formatRelativeTime(delivery.sent_at)}
                </span>
                {delivery.status === 'failed' && (
                  <span className="rounded-md bg-danger-soft px-2 py-0.5 text-micro font-medium text-danger-text">
                    Failed
                  </span>
                )}
                <span className="ml-auto text-body tabular-nums text-ink-900">
                  {formatCurrency(delivery.total_minor, delivery.currency)}
                </span>
              </div>
              <p className="mt-0.5 text-caption text-ink-500">
                {delivery.invoice_count} invoice{delivery.invoice_count === 1 ? '' : 's'} ·{' '}
                {delivery.service_count} service{delivery.service_count === 1 ? '' : 's'}
                {delivery.period_start && delivery.period_end
                  ? ` · ${formatDate(delivery.period_start)} – ${formatDate(delivery.period_end)}`
                  : ''}
              </p>
              {delivery.error && (
                <p className="mt-1 text-caption text-danger-text">{delivery.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
