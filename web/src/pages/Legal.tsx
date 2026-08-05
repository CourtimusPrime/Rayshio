import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import { PRODUCT_NAME } from '../marketing/copy';
import type { ReactNode } from 'react';

/**
 * Privacy and Terms.
 *
 * These routes are a *launch* blocker, not a merge one. `gmail.readonly` is a
 * Google restricted scope, and OAuth verification requires a privacy policy and
 * terms of service reachable on the app's own domain — so the pages have to
 * exist and be indexable before verification can be requested.
 *
 * The scaffolding is here and the routing works. The prose below is a factual
 * description of what the system does, which is the part that has to be true;
 * it has NOT been reviewed by anyone qualified to write a privacy policy, and
 * it must be before verification is submitted.
 */

function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full w-full flex-col bg-canvas">
      <header className="border-b border-line px-5 py-3.5 md:px-8">
        <Link to="/" aria-label={`${PRODUCT_NAME} home`} className="inline-flex">
          <Wordmark />
        </Link>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 md:px-8">
        <h1 className="text-display font-semibold text-ink-900">{title}</h1>
        <p className="mt-2 text-caption text-ink-400">Last updated {updated}</p>
        <div className="mt-8 space-y-6">{children}</div>
      </main>

      <footer className="border-t border-line px-5 py-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <Link to="/" className="text-footnote text-ink-500 hover:text-ink-900">
            ← Back to {PRODUCT_NAME}
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-title3 font-semibold text-ink-900">{heading}</h2>
      <div className="mt-2 space-y-3 text-body text-ink-500">{children}</div>
    </section>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="5 August 2026">
      <Section heading="What we access">
        <p>
          {PRODUCT_NAME} requests read-only access to your Gmail mailbox
          (<code className="font-mono text-code">gmail.readonly</code>). We use it to find
          messages from vendors that contain invoices, and to read those messages and their PDF
          attachments. We never send, modify, or delete mail.
        </p>
      </Section>

      <Section heading="What we store">
        <p>
          For each invoice we identify, we store the sending vendor, the invoice number, amount,
          currency, dates, and its line items, along with the subject and delivery time of the
          message it came from. Invoice PDFs are stored so you can open the original. We store an
          encrypted OAuth refresh token so syncing can continue without asking you to sign in
          again.
        </p>
        <p>
          Signing in stores your Google account's name, email address and profile image. We do not
          store your Google password.
        </p>
      </Section>

      <Section heading="What we do not do">
        <p>
          We do not sell your data, and we do not use it for advertising. Vendor logos are fetched
          through our own server rather than linked directly, so your vendor list is never disclosed
          to a third-party icon service. Google Workspace API data is not used to develop, improve,
          or train generalised artificial intelligence or machine learning models.
        </p>
      </Section>

      <Section heading="Deletion">
        <p>
          Disconnecting your mailbox revokes our access immediately. Ask the owner of your workspace
          to delete it, or contact us, and we will remove your stored invoices, attachments and
          account within 30 days.
        </p>
      </Section>

      <Section heading="Contact">
        <p>Questions about this policy can be sent to the address on the workspace's account.</p>
      </Section>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="5 August 2026">
      <Section heading="The service">
        <p>
          {PRODUCT_NAME} reads invoices from a mailbox you connect and presents them as a spend
          history. Access is currently by invitation.
        </p>
      </Section>

      <Section heading="Your responsibilities">
        <p>
          You must have the right to connect the mailbox you connect, and to have its contents
          processed as described in the Privacy Policy. You are responsible for activity under your
          account and for keeping any API keys you create secret.
        </p>
      </Section>

      <Section heading="Accuracy">
        <p>
          Invoice figures are extracted automatically and currency conversion uses published ECB
          reference rates. Neither is a substitute for your accounting records, and {PRODUCT_NAME}
          is not an accounting, tax or financial advice service. Verify figures against the original
          invoice before relying on them.
        </p>
      </Section>

      <Section heading="Availability and termination">
        <p>
          The service is provided as-is, without warranty. We may suspend or end access to a
          workspace that is used unlawfully or in a way that harms the service. You may stop using
          it and disconnect your mailbox at any time.
        </p>
      </Section>
    </LegalPage>
  );
}
