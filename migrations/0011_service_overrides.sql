-- Up Migration

-- Per-org corrections to a vendor's name and logo.
--
-- `server.service` is global: one row per (name, sender_address), shared by
-- every tenant that receives mail from that sender. That is right for what the
-- table is — the identity of a sender is not a per-org fact — but it means an
-- `UPDATE server.service SET name = ...` on behalf of one org silently renames
-- that vendor for every other org too. The first tenant to tidy "Microsoft
-- Ireland Operations Limited" down to "Microsoft" would rewrite it in a
-- stranger's dashboard.
--
-- So corrections live beside the row rather than in it, and reads coalesce.
-- The global name stays the ingestion key — vendor matching in
-- `attachUploadedInvoiceVendor` continues to compare against it, because two
-- orgs renaming the same vendor differently must not make the pipeline treat
-- them as different vendors.
CREATE TABLE client.service_override (
  org_id bigint NOT NULL REFERENCES client.org (id) ON DELETE CASCADE,
  service_id bigint NOT NULL REFERENCES server.service (id) ON DELETE CASCADE,
  -- Null means "no correction" for that field independently: an org may replace
  -- the logo while keeping the discovered name, or vice versa. A row with both
  -- null is harmless and reads exactly as no row at all.
  display_name text,
  -- GridFS filename in MongoDB, mirroring billing.invoices.pdf_id. Null falls
  -- back to the favicon lookup in src/logos/fetch.ts.
  logo_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_override_pkey PRIMARY KEY (org_id, service_id),
  -- An empty name is not a correction, it is a way to make a vendor disappear
  -- from every list that renders it. Reject it here rather than trusting the
  -- one route that writes it.
  CONSTRAINT service_override_name_not_blank CHECK (display_name IS NULL OR btrim(display_name) <> '')
);

COMMENT ON TABLE client.service_override IS 'per-org corrections to a global server.service row; reads coalesce over it';
COMMENT ON COLUMN client.service_override.display_name IS 'null = use server.service.name';
COMMENT ON COLUMN client.service_override.logo_id IS 'GridFS filename of an uploaded logo; null = use the fetched favicon';

-- The composite primary key already covers lookups by (org_id, service_id) and
-- by org_id alone. Nothing queries by service_id without an org — doing so
-- would be a cross-tenant read — so there is deliberately no index for it.

-- Down Migration

DROP TABLE client.service_override;
