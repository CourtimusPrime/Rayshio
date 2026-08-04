-- Up Migration

-- Usage category lives on the line item, not the invoice: a single vendor bill
-- legitimately spans several categories (an AWS invoice has both RDS and API
-- Gateway lines), and cross-vendor category rollups are only correct at this grain.
ALTER TABLE billing.invoice_line_items
  ADD COLUMN category text
    CHECK (category IN ('Databases', 'API usage', 'AI invocations', 'Subscriptions', 'Other'));

COMMENT ON COLUMN billing.invoice_line_items.category IS 'usage category; null until classified';

CREATE INDEX index_line_items_category ON billing.invoice_line_items (category);

ALTER TABLE client.org
  ADD COLUMN monthly_budget_minor bigint,
  ADD COLUMN budget_currency varchar(3);

COMMENT ON COLUMN client.org.monthly_budget_minor IS 'monthly spend budget in minor units (cents); null when unset';
COMMENT ON COLUMN client.org.budget_currency IS 'currency the budget is denominated in; sums are never converted';

-- Down Migration

DROP INDEX billing.index_line_items_category;

ALTER TABLE billing.invoice_line_items
  DROP COLUMN category;

ALTER TABLE client.org
  DROP COLUMN monthly_budget_minor,
  DROP COLUMN budget_currency;
