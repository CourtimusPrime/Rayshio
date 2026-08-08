-- Up Migration

-- Adopts the taxonomy in `dev/CATEGORIES.md`: four parent groups and twenty-one
-- leaves, replacing the seven-value set from 0003.
--
-- The remap is total and lossless. Every old value has a destination, so unlike
-- 0003 — which sent the unresolvable 'Databases' to NULL for the classifier to
-- pick up later — no row is emptied and no figure moves on the dashboard:
--
--   compute        -> computing     (rename only)
--   ai_invocations -> ai            (rename only)
--   api_usage      -> access        metered request/consumption billing
--   subscription   -> subscriptions (rename only)
--   storage, network, other         unchanged, deliberately
--
-- `storage`, `network` and `other` keep their slugs precisely so those rows are
-- untouched. Re-spelling a slug costs a data migration *and* invalidates every
-- stored rule that references it, so the existing spelling wins wherever it
-- already fits.
ALTER TABLE billing.invoice_line_items
  DROP CONSTRAINT invoice_line_items_category_check;

UPDATE billing.invoice_line_items SET category = CASE category
  WHEN 'compute'        THEN 'computing'
  WHEN 'ai_invocations' THEN 'ai'
  WHEN 'api_usage'      THEN 'access'
  WHEN 'subscription'   THEN 'subscriptions'
  ELSE category
END;

ALTER TABLE billing.invoice_line_items
  ADD CONSTRAINT invoice_line_items_category_check
    CHECK (category IN (
      -- Technology
      'computing', 'ai', 'web_search', 'storage', 'domains',
      'network', 'access', 'authentication', 'subscriptions',
      -- Employee Expenses
      'food', 'transportation', 'flights', 'accommodation',
      'reimbursement', 'training',
      -- Physical Goods
      'inventory', 'office_supplies', 'furniture', 'equipment',
      -- Other
      'taxes_fees', 'other'
    ));

-- Learned categorisations, applied at read time.
--
-- Recategorising a line item is a *rule*, not an edit to one row: the same
-- vendor bills the same thing every month, so filing "Storage GB-month" from
-- Neon by hand and having next month's invoice arrive misfiled again would make
-- the feature a treadmill. Rules are therefore stored separately from the line
-- items and coalesced over on read, which makes them retroactive and
-- forward-looking at once, with no backfill job and nothing destroyed — delete
-- the rule and the classifier's original category returns.
--
-- Two levels, and the narrower one wins:
--   description IS NOT NULL -> this vendor's line items with that exact text
--   description IS NULL     -> every line item from this vendor
CREATE TABLE client.category_rule (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id) ON DELETE CASCADE,
  service_id bigint NOT NULL REFERENCES server.service (id) ON DELETE CASCADE,
  description text,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE client.category_rule IS 'per-org learned categorisations; reads coalesce over them, narrower rule wins';
COMMENT ON COLUMN client.category_rule.description IS 'exact line-item text this applies to; null = every line item from the vendor';

-- Two partial indexes rather than one over (org_id, service_id, description).
-- NULLs are distinct in a plain unique index, so a single index would happily
-- accept a second vendor-wide rule for the same vendor and leave the read
-- coalesce picking between them arbitrarily. Postgres 15+ could express this as
-- NULLS NOT DISTINCT, but the deploy target's version is not something this
-- migration should have to assume.
CREATE UNIQUE INDEX index_category_rule_vendor
  ON client.category_rule (org_id, service_id)
  WHERE description IS NULL;

CREATE UNIQUE INDEX index_category_rule_description
  ON client.category_rule (org_id, service_id, description)
  WHERE description IS NOT NULL;

-- Down Migration

DROP TABLE client.category_rule;

ALTER TABLE billing.invoice_line_items
  DROP CONSTRAINT invoice_line_items_category_check;

-- The new leaves have no pre-0012 equivalent, so anything filed under one goes
-- to 'other' rather than to a guess.
UPDATE billing.invoice_line_items SET category = CASE category
  WHEN 'computing'     THEN 'compute'
  WHEN 'ai'            THEN 'ai_invocations'
  WHEN 'access'        THEN 'api_usage'
  WHEN 'subscriptions' THEN 'subscription'
  WHEN 'storage'       THEN 'storage'
  WHEN 'network'       THEN 'network'
  ELSE 'other'
END;

ALTER TABLE billing.invoice_line_items
  ADD CONSTRAINT invoice_line_items_category_check
    CHECK (category IN (
      'compute', 'storage', 'api_usage', 'ai_invocations',
      'network', 'subscription', 'other'
    ));
