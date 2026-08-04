-- Up Migration

CREATE SCHEMA IF NOT EXISTS client;
CREATE SCHEMA IF NOT EXISTS server;
CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE client.org (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE client.account (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id),
  provider text NOT NULL,
  email_address text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  CONSTRAINT index_account_org_email UNIQUE (org_id, email_address)
);

CREATE TABLE client.billing_address (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id),
  address text NOT NULL,
  CONSTRAINT index_billing_address_org_address UNIQUE (org_id, address)
);

CREATE TABLE server.service (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  sender_address text NOT NULL,
  CONSTRAINT index_service_name_sender UNIQUE (name, sender_address)
);

COMMENT ON TABLE server.service IS 'Subscribed services that send invoices';

CREATE TABLE billing.email (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id bigint NOT NULL REFERENCES client.billing_address (id),
  server_id bigint NOT NULL REFERENCES server.service (id),
  message_id text NOT NULL,
  subject text,
  delivered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT index_email_dedupe UNIQUE (server_id, message_id)
);

COMMENT ON COLUMN billing.email.message_id IS 'provider message id, used for idempotency';

CREATE TABLE billing.invoices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id),
  email_id bigint NOT NULL UNIQUE REFERENCES billing.email (id),
  invoice_number text,
  value bigint NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  invoice_date date,
  due_date date,
  period_start date,
  period_end date,
  pdf_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'classified', 'pdf_fetched', 'parsed', 'failed')),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN billing.invoices.value IS 'total amount in minor units (cents)';
COMMENT ON COLUMN billing.invoices.pdf_id IS 'GridFS file id in MongoDB; null until fetched';

CREATE TABLE billing.invoice_line_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id bigint NOT NULL REFERENCES billing.invoices (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric,
  unit text,
  rate bigint,
  amount bigint NOT NULL,
  period_start date,
  period_end date
);

COMMENT ON COLUMN billing.invoice_line_items.rate IS 'unit rate in minor units (cents); null for flat/zero-rate lines';
COMMENT ON COLUMN billing.invoice_line_items.amount IS 'line amount in minor units (cents)';

CREATE INDEX index_line_items_invoice ON billing.invoice_line_items (invoice_id);

-- Down Migration

DROP SCHEMA billing CASCADE;
DROP SCHEMA server CASCADE;
DROP SCHEMA client CASCADE;
