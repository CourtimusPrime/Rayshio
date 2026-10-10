-- Up Migration

-- A delivery that is still in flight, and a lock so only one can be.
--
-- 'sending' exists because one-by-one rows are opened before any mail goes and
-- closed afterwards. They used to be inserted as 'sent' with zero totals and
-- filled in at the end, so for the whole run the history read "0 invoices ·
-- 0 services £0.00" and the user took it for a failure (delivery row 8).
--
-- The partial unique index exists because duplicate emails are the failure that
-- matters. `index_delivery_item_invoice_recipient` only stops duplicate *ledger
-- rows*; it cannot stop two runs both mailing the same invoice before either
-- records it. With at most one 'sending' row per org, and every email sent while
-- holding that row, two runs cannot both be mailing.

-- Dropped by definition rather than by name: production drifted from
-- migrations/ once already (see 0005_restore_constraints), so the check may not
-- carry the name 0015 gave it.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'billing.accountant_delivery'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE billing.accountant_delivery DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE billing.accountant_delivery
  ADD CONSTRAINT accountant_delivery_status_check CHECK (status IN ('sending', 'sent', 'failed'));

CREATE UNIQUE INDEX index_accountant_delivery_one_sending
  ON billing.accountant_delivery (org_id)
  WHERE status = 'sending';

-- Down Migration

-- A rolled-back schema cannot hold 'sending', and a run that was mid-flight is
-- not one that finished — so it becomes a failure with the reason on it.
UPDATE billing.accountant_delivery
SET status = 'failed',
    error = coalesce(error, 'Stopped: the sending status was rolled back (migration 0019).')
WHERE status = 'sending';

DROP INDEX billing.index_accountant_delivery_one_sending;

ALTER TABLE billing.accountant_delivery DROP CONSTRAINT accountant_delivery_status_check;
ALTER TABLE billing.accountant_delivery
  ADD CONSTRAINT accountant_delivery_status_check CHECK (status IN ('sent', 'failed'));
