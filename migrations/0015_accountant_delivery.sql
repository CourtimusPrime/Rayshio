-- Up Migration

-- Who the invoices go to.
--
-- A table rather than a column on client.org, for two reasons. The address is
-- workspace configuration that only one feature reads, so it does not belong in
-- the row every query already joins; and `src/db/types.ts` is kysely-codegen
-- output, so a brand-new table can be typed at the call site with
-- `db.withTables(...)` while a new column on an existing table could not be.
CREATE TABLE client.accountant (
  org_id bigint PRIMARY KEY REFERENCES client.org (id),
  email text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE client.accountant IS 'address the Accountant tab sends invoices to; absent until set';

-- One row per send. Kept even when the send fails, because "we tried and the
-- provider rejected it" is the state a user needs explained — a failed attempt
-- that leaves no trace looks identical to a button that does nothing.
CREATE TABLE billing.accountant_delivery (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id),
  recipient text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  invoice_count integer NOT NULL DEFAULT 0,
  service_count integer NOT NULL DEFAULT 0,
  period_start date,
  period_end date,
  total_minor bigint NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error text
);

COMMENT ON COLUMN billing.accountant_delivery.total_minor IS 'total in `currency` minor units, converted at each invoice''s own rate';

CREATE INDEX index_accountant_delivery_org ON billing.accountant_delivery (org_id, sent_at DESC);

-- The ledger that makes "untracked" mean something.
--
-- `recipient` is denormalised from the parent row on purpose. It is what the
-- uniqueness rule below is written against, and that rule is the whole feature:
-- an invoice may be sent once to a given address and never again, so nobody has
-- to deselect last month's invoices by hand. Pointing the workspace at a new
-- accountant deliberately makes every invoice untracked *for that address*
-- while leaving the previous one's history intact.
CREATE TABLE billing.accountant_delivery_item (
  delivery_id bigint NOT NULL REFERENCES billing.accountant_delivery (id) ON DELETE CASCADE,
  invoice_id bigint NOT NULL REFERENCES billing.invoices (id) ON DELETE CASCADE,
  recipient text NOT NULL,
  PRIMARY KEY (delivery_id, invoice_id)
);

-- Only successful sends write items, so this index is the guarantee that no
-- invoice is ever emailed to the same accountant twice.
CREATE UNIQUE INDEX index_delivery_item_invoice_recipient
  ON billing.accountant_delivery_item (invoice_id, recipient);

-- Down Migration

DROP TABLE billing.accountant_delivery_item;
DROP TABLE billing.accountant_delivery;
DROP TABLE client.accountant;
