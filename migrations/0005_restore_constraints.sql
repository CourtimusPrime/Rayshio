-- Up Migration

-- Restores the primary keys, unique constraints, foreign keys and one index
-- that migration 0001 declares but which are absent from the production
-- database. `pgmigrations` records 0001-0004 as applied, yet production had
-- *zero* primary, unique and foreign key constraints across `client`, `server`
-- and `billing` — the schema was evidently loaded from a constraint-stripped
-- dump, with 0002-0004 then applied on top (their CHECK constraints, columns
-- and `index_line_items_category` are all present, 0001's keys are not).
--
-- The drift only surfaced when 0007 tried to reference `client.org (id)` and
-- Postgres reported 42830: no unique constraint matching the referenced key.
--
-- Every statement is conditional, which is what makes this safe to run twice
-- and safe on a *fresh* database: a DB built from 0001 already has all of
-- these, and this migration is then a no-op. Adding a constraint neither reads
-- nor writes a data row, and each was verified against production first —
-- no duplicate ids, no nulls, no orphans, no unique-key collisions.
--
-- Names match what 0001 produces on a fresh database, so a repaired production
-- and a freshly migrated database end up constraint-for-constraint identical.

DO $$
BEGIN
  -- Primary keys. Postgres' default naming (`<table>_pkey`) is what the inline
  -- PRIMARY KEY in 0001 produces.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'client.org'::regclass AND contype = 'p') THEN
    ALTER TABLE client.org ADD CONSTRAINT org_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'client.account'::regclass AND contype = 'p') THEN
    ALTER TABLE client.account ADD CONSTRAINT account_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'client.billing_address'::regclass AND contype = 'p') THEN
    ALTER TABLE client.billing_address ADD CONSTRAINT billing_address_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'server.service'::regclass AND contype = 'p') THEN
    ALTER TABLE server.service ADD CONSTRAINT service_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'billing.email'::regclass AND contype = 'p') THEN
    ALTER TABLE billing.email ADD CONSTRAINT email_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'billing.invoices'::regclass AND contype = 'p') THEN
    ALTER TABLE billing.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'billing.invoice_line_items'::regclass AND contype = 'p') THEN
    ALTER TABLE billing.invoice_line_items ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);
  END IF;

  -- Unique constraints. These are the idempotency keys the ingestion pipeline
  -- relies on: without `index_email_dedupe`, re-running a sync inserts a second
  -- copy of every email rather than conflicting.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'index_account_org_email') THEN
    ALTER TABLE client.account ADD CONSTRAINT index_account_org_email UNIQUE (org_id, email_address);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'index_billing_address_org_address') THEN
    ALTER TABLE client.billing_address
      ADD CONSTRAINT index_billing_address_org_address UNIQUE (org_id, address);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'index_service_name_sender') THEN
    ALTER TABLE server.service ADD CONSTRAINT index_service_name_sender UNIQUE (name, sender_address);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'index_email_dedupe') THEN
    ALTER TABLE billing.email ADD CONSTRAINT index_email_dedupe UNIQUE (server_id, message_id);
  END IF;

  -- one invoice per email, per 0001's `email_id bigint NOT NULL UNIQUE`
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_email_id_key') THEN
    ALTER TABLE billing.invoices ADD CONSTRAINT invoices_email_id_key UNIQUE (email_id);
  END IF;

  -- Foreign keys. Declared after the keys above, since each needs a unique
  -- constraint on the column it points at.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_org_id_fkey') THEN
    ALTER TABLE client.account
      ADD CONSTRAINT account_org_id_fkey FOREIGN KEY (org_id) REFERENCES client.org (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_address_org_id_fkey') THEN
    ALTER TABLE client.billing_address
      ADD CONSTRAINT billing_address_org_id_fkey FOREIGN KEY (org_id) REFERENCES client.org (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_recipient_id_fkey') THEN
    ALTER TABLE billing.email
      ADD CONSTRAINT email_recipient_id_fkey
      FOREIGN KEY (recipient_id) REFERENCES client.billing_address (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_server_id_fkey') THEN
    ALTER TABLE billing.email
      ADD CONSTRAINT email_server_id_fkey FOREIGN KEY (server_id) REFERENCES server.service (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_org_id_fkey') THEN
    ALTER TABLE billing.invoices
      ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES client.org (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_email_id_fkey') THEN
    ALTER TABLE billing.invoices
      ADD CONSTRAINT invoices_email_id_fkey FOREIGN KEY (email_id) REFERENCES billing.email (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_items_invoice_id_fkey') THEN
    ALTER TABLE billing.invoice_line_items
      ADD CONSTRAINT invoice_line_items_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES billing.invoices (id) ON DELETE CASCADE;
  END IF;
END $$;

-- 0001's index. `index_line_items_category` from 0002 is present in production;
-- this one is not, and every invoice detail view joins on it.
CREATE INDEX IF NOT EXISTS index_line_items_invoice
  ON billing.invoice_line_items (invoice_id);

-- Down Migration

-- Returns the database to the constraint-stripped state this migration found it
-- in. Dropping a primary key also drops the foreign keys that depend on it,
-- hence the explicit ordering.

DROP INDEX IF EXISTS billing.index_line_items_invoice;

ALTER TABLE billing.invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_invoice_id_fkey;
ALTER TABLE billing.invoices DROP CONSTRAINT IF EXISTS invoices_email_id_fkey;
ALTER TABLE billing.invoices DROP CONSTRAINT IF EXISTS invoices_org_id_fkey;
ALTER TABLE billing.email DROP CONSTRAINT IF EXISTS email_server_id_fkey;
ALTER TABLE billing.email DROP CONSTRAINT IF EXISTS email_recipient_id_fkey;
ALTER TABLE client.billing_address DROP CONSTRAINT IF EXISTS billing_address_org_id_fkey;
ALTER TABLE client.account DROP CONSTRAINT IF EXISTS account_org_id_fkey;

ALTER TABLE billing.invoices DROP CONSTRAINT IF EXISTS invoices_email_id_key;
ALTER TABLE billing.email DROP CONSTRAINT IF EXISTS index_email_dedupe;
ALTER TABLE server.service DROP CONSTRAINT IF EXISTS index_service_name_sender;
ALTER TABLE client.billing_address DROP CONSTRAINT IF EXISTS index_billing_address_org_address;
ALTER TABLE client.account DROP CONSTRAINT IF EXISTS index_account_org_email;

ALTER TABLE billing.invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_pkey;
ALTER TABLE billing.invoices DROP CONSTRAINT IF EXISTS invoices_pkey;
ALTER TABLE billing.email DROP CONSTRAINT IF EXISTS email_pkey;
ALTER TABLE server.service DROP CONSTRAINT IF EXISTS service_pkey;
ALTER TABLE client.billing_address DROP CONSTRAINT IF EXISTS billing_address_pkey;
ALTER TABLE client.account DROP CONSTRAINT IF EXISTS account_pkey;
ALTER TABLE client.org DROP CONSTRAINT IF EXISTS org_pkey;
