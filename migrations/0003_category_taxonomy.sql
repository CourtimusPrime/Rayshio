-- Up Migration

-- Replaces the first-pass category set with the taxonomy in SPEC.md. The point
-- of the change is cross-vendor comparison: 'Databases' merged storage with
-- compute, so Neon's "Storage (root branches), GB-month" and Railway's
-- "Memory (per MB / min)" landed in the same bucket and could not be compared
-- against each other. Splitting compute/storage/network makes that possible.
ALTER TABLE billing.invoice_line_items
  DROP CONSTRAINT invoice_line_items_category_check;

-- old values are remapped rather than dropped; 'Databases' cannot be resolved
-- to storage-vs-compute without re-reading the line, so it goes to NULL and the
-- classifier picks it up on the next `pnpm cli categorize` run
UPDATE billing.invoice_line_items SET category = CASE category
  WHEN 'API usage'      THEN 'api_usage'
  WHEN 'AI invocations' THEN 'ai_invocations'
  WHEN 'Subscriptions'  THEN 'subscription'
  WHEN 'Other'          THEN 'other'
  ELSE NULL
END;

ALTER TABLE billing.invoice_line_items
  ADD CONSTRAINT invoice_line_items_category_check
    CHECK (category IN (
      'compute', 'storage', 'api_usage', 'ai_invocations',
      'network', 'subscription', 'other'
    ));

-- Where the itemization came from: the invoice itself, or (later) a vendor API
-- connection. Lets the Breakdown tab avoid blending two data qualities in one
-- chart, per SPEC.md's "Itemization coverage" note.
ALTER TABLE billing.invoice_line_items
  ADD COLUMN source text NOT NULL DEFAULT 'invoice'
    CHECK (source IN ('invoice', 'vendor_connection'));

COMMENT ON COLUMN billing.invoice_line_items.source IS 'origin of the itemization: parsed invoice, or an optional vendor API connection';

-- Down Migration

ALTER TABLE billing.invoice_line_items
  DROP COLUMN source;

ALTER TABLE billing.invoice_line_items
  DROP CONSTRAINT invoice_line_items_category_check;

UPDATE billing.invoice_line_items SET category = CASE category
  WHEN 'api_usage'      THEN 'API usage'
  WHEN 'ai_invocations' THEN 'AI invocations'
  WHEN 'subscription'   THEN 'Subscriptions'
  WHEN 'storage'        THEN 'Databases'
  WHEN 'other'          THEN 'Other'
  ELSE NULL
END;

ALTER TABLE billing.invoice_line_items
  ADD CONSTRAINT invoice_line_items_category_check
    CHECK (category IN ('Databases', 'API usage', 'AI invocations', 'Subscriptions', 'Other'));
