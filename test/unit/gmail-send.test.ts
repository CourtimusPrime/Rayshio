import { describe, expect, it } from 'vitest';
import { GMAIL_SCOPE, GMAIL_SEND_SCOPE } from '../../src/gmail/oauth.js';
import { buildMimeMessage, grantCanSend } from '../../src/gmail/send.js';

const base = { to: 'accounts@firm.example', subject: 'Invoices', text: 'Body text.' };

/** Parses the message back into headers and parts, the way a client would. */
function parse(raw: Buffer) {
  const text = raw.toString('utf8');
  const [head = '', ...rest] = text.split('\r\n\r\n');
  const headers = Object.fromEntries(
    head.split('\r\n').map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()];
    }),
  );
  return { text, headers, body: rest.join('\r\n\r\n') };
}

describe('buildMimeMessage', () => {
  it('sends from the connected mailbox, not a service address', () => {
    const { headers } = parse(buildMimeMessage('court@nczgroup.com', base));
    expect(headers.from).toBe('court@nczgroup.com');
    expect(headers.to).toBe('accounts@firm.example');
  });

  it('uses CRLF line endings throughout', () => {
    const { text } = parse(buildMimeMessage('a@b.c', { ...base, html: '<p>Body text.</p>' }));
    // A bare LF anywhere makes the multipart boundary unrecognisable to strict
    // parsers, and the whole message arrives as one lump of source.
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('RFC 2047-encodes a subject that is not plain ASCII', () => {
    const { headers } = parse(buildMimeMessage('a@b.c', { ...base, subject: 'Facturé — août' }));
    expect(headers.subject).toMatch(/^=\?UTF-8\?B\?/);
    // decodes back to the original, rather than merely being encoded
    const decoded = Buffer.from(headers.subject.slice(10, -2), 'base64').toString('utf8');
    expect(decoded).toBe('Facturé — août');
  });

  it('leaves an ASCII subject alone, so it stays readable in raw form', () => {
    const { headers } = parse(buildMimeMessage('a@b.c', base));
    expect(headers.subject).toBe('Invoices');
  });

  it('offers text and HTML as alternatives, not as two stacked parts', () => {
    const { text } = parse(buildMimeMessage('a@b.c', { ...base, html: '<p>Body text.</p>' }));
    // multipart/alternative is what makes a client pick one; mixed would show
    // the plain text and then the HTML, so the note appears twice.
    expect(text).toContain('multipart/alternative');
  });

  it('attaches a file as base64 with a filename the client will show', () => {
    const raw = buildMimeMessage('a@b.c', {
      ...base,
      attachments: [
        {
          filename: 'invoices.zip',
          content: Buffer.from('PKzipbytes'),
          mimeType: 'application/zip',
        },
      ],
    });
    const { text } = parse(raw);
    expect(text).toContain('multipart/mixed');
    expect(text).toContain('Content-Disposition: attachment; filename="invoices.zip"');
    expect(text).toContain('Content-Transfer-Encoding: base64');
    expect(text).toContain(Buffer.from('PKzipbytes').toString('base64'));
  });

  it('wraps base64 at 76 characters, as RFC 2045 requires', () => {
    const raw = buildMimeMessage('a@b.c', {
      ...base,
      attachments: [{ filename: 'big.zip', content: Buffer.alloc(500, 7) }],
    });
    const lines = raw.toString('utf8').split('\r\n');
    // One long unwrapped line is accepted by Gmail and mangled by other agents
    expect(lines.every((line) => line.length <= 998)).toBe(true);
    expect(lines.some((line) => line.length === 76)).toBe(true);
  });

  it('closes the multipart with a terminating boundary', () => {
    const raw = buildMimeMessage('a@b.c', {
      ...base,
      attachments: [{ filename: 'x.zip', content: Buffer.from('x') }],
    });
    const text = raw.toString('utf8');
    const boundary = text.match(/boundary="(rayshio_[^"]+)"/)?.[1];
    expect(boundary).toBeTruthy();
    // Without the trailing --, everything after the last part is swallowed and
    // the attachment does not appear at all.
    expect(text.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('separates headers from the body with exactly one blank line', () => {
    const { headers } = parse(buildMimeMessage('a@b.c', base));
    // If the blank line is missing the headers render as body text; if there
    // are two, the first body line is lost.
    expect(headers['mime-version']).toBe('1.0');
    expect(headers['content-type']).toContain('text/plain');
  });
});

describe('grantCanSend', () => {
  it('rejects a grant recorded before sending existed', () => {
    // null is every mailbox connected before client.account.scopes was added,
    // and all of those asked for readonly alone.
    expect(grantCanSend(null)).toBe(false);
  });

  it('rejects a read-only grant', () => {
    expect(grantCanSend(GMAIL_SCOPE)).toBe(false);
  });

  it('accepts a grant that carries the send scope', () => {
    expect(grantCanSend(`${GMAIL_SCOPE} ${GMAIL_SEND_SCOPE}`)).toBe(true);
  });

  it('is not fooled by a scope that merely contains the string', () => {
    expect(grantCanSend('https://example.com/auth/gmail.send.readonly')).toBe(false);
  });
});
