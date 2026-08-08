-- Up Migration

-- De-duplication for manually uploaded invoices.
--
-- The upload path had none. `billing.email` carries `UNIQUE (server_id,
-- message_id)`, which makes a Gmail resync idempotent, but
-- `createUploadedInvoice` mints a fresh `upload-<uuid>` message id on every
-- call — so that constraint is structurally incapable of firing for an upload.
-- Re-uploading one file produced a second, fully independent invoice, and the
-- vendor's monthly total doubled with nothing in the UI marking the pair.
--
-- The digest of the PDF bytes is the cheapest true answer to "have I seen this
-- file before": it is known before the row is written and before any LLM call
-- is spent, unlike the invoice number, which only exists after extraction.
ALTER TABLE billing.invoices
  ADD COLUMN pdf_sha256 text;

COMMENT ON COLUMN billing.invoices.pdf_sha256 IS 'sha256 hex of the uploaded PDF bytes; null for mailbox-ingested invoices';

-- Partial, and that is the whole design.
--
-- Only uploads populate the column. Mail-ingested invoices leave it NULL and so
-- can never collide — two different messages carrying byte-identical PDFs is
-- not impossible (a vendor re-sending the same statement to two addresses), and
-- a unique violation there would break ingestion for a case the invoice-number
-- check in extract-invoice.ts already covers more precisely.
--
-- NULLs are distinct in a Postgres unique index anyway; the WHERE clause makes
-- that explicit and keeps the index to the rows that can actually conflict.
-- Existing rows are all NULL, so this is a no-op on the current table — which
-- matters given the drift documented in 0005_restore_constraints.sql.
CREATE UNIQUE INDEX index_invoices_pdf_sha256
  ON billing.invoices (org_id, pdf_sha256)
  WHERE pdf_sha256 IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS billing.index_invoices_pdf_sha256;

ALTER TABLE billing.invoices
  DROP COLUMN pdf_sha256;
