-- Up Migration

-- Adds `communications` to the line-item category taxonomy.
--
-- The category list is enforced by a CHECK constraint, not an enum type, so
-- widening it is a constraint swap rather than an ALTER TYPE. That is the
-- reason this migration exists at all: the classifier could emit
-- 'communications' the moment the prompt names it, and every insert carrying
-- one would fail the check — a pipeline failure with no obvious connection to
-- a prompt edit.
--
-- Nothing is backfilled. Existing rows keep whatever they were classified as;
-- re-filing them is a `client.category_rule`, which is retroactive by design.

ALTER TABLE billing.invoice_line_items
  DROP CONSTRAINT invoice_line_items_category_check;

ALTER TABLE billing.invoice_line_items
  ADD CONSTRAINT invoice_line_items_category_check
    CHECK (category IN (
      -- Technology
      'computing', 'ai', 'web_search', 'storage', 'domains',
      'network', 'access', 'authentication', 'subscriptions',
      'communications',
      -- Employee Expenses
      'food', 'transportation', 'flights', 'accommodation',
      'reimbursement', 'training',
      -- Physical Goods
      'inventory', 'office_supplies', 'furniture', 'equipment',
      -- Other
      'taxes_fees', 'other'
    ));

-- Down Migration

-- Down migration: anything already filed as 'communications' has to move before
-- the narrower constraint can be re-applied, or the ALTER fails on live data.
-- 'other' is the escape hatch the taxonomy keeps for exactly this.
UPDATE billing.invoice_line_items SET category = 'other' WHERE category = 'communications';
DELETE FROM client.category_rule WHERE category = 'communications';

ALTER TABLE billing.invoice_line_items
  DROP CONSTRAINT invoice_line_items_category_check;

ALTER TABLE billing.invoice_line_items
  ADD CONSTRAINT invoice_line_items_category_check
    CHECK (category IN (
      'computing', 'ai', 'web_search', 'storage', 'domains',
      'network', 'access', 'authentication', 'subscriptions',
      'food', 'transportation', 'flights', 'accommodation',
      'reimbursement', 'training',
      'inventory', 'office_supplies', 'furniture', 'equipment',
      'taxes_fees', 'other'
    ));
