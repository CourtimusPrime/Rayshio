-- Up Migration

-- How this workspace's accountant wants invoices to arrive.
--
-- 'bulk' is one message carrying a zip of everything outstanding. 'individual'
-- is one message per invoice, with that invoice's PDF attached directly.
--
-- A stored preference rather than a choice made at send time, because it is a
-- property of the *recipient*: a bookkeeping inbox that files by attachment
-- (Hubdoc, Dext, Xero) wants one document per message and cannot see inside a
-- zip at all, while a human accountant would rather have one email a month than
-- three hundred. Asking again on every send would be asking a question whose
-- answer never changes.
--
-- Defaulted to 'bulk' so existing workspaces keep the behaviour they have.
ALTER TABLE client.accountant
  ADD COLUMN send_mode text NOT NULL DEFAULT 'bulk'
    CHECK (send_mode IN ('bulk', 'individual'));

COMMENT ON COLUMN client.accountant.send_mode IS 'bulk: one zip of everything outstanding. individual: one email per invoice, PDF attached directly';

-- Down Migration

ALTER TABLE client.accountant
  DROP COLUMN send_mode;
