-- Up Migration

-- Whether rows charging nothing are worth showing.
--
-- A real mailbox produces plenty of them: a month with no usage bills 0.00, a
-- vendor itemises a line that happens to be free, a tax line rounds to nothing.
-- None of it is wrong, and none of it tells the reader anything — it just takes
-- up rows on a page about what the company is paying for.
--
-- A setting rather than a rule, because the two readings are both legitimate.
-- Hidden is the useful default for reading a dashboard; shown is what you want
-- when reconciling against a vendor's own statement, or when checking that
-- something you just uploaded actually arrived. A genuine 0.00 invoice is a real
-- document, and this must not be the reason it looks lost.
--
-- Text with a CHECK rather than a boolean, matching `department_mode`: the
-- stored value reads as itself in a query result, and a third mode later ("hide
-- zero line items but keep zero invoices") does not need a column rename.
ALTER TABLE client.org
  ADD COLUMN zero_charge_mode text NOT NULL DEFAULT 'hide'
    CHECK (zero_charge_mode IN ('show', 'hide'));

COMMENT ON COLUMN client.org.zero_charge_mode IS 'hide: omit rows charging exactly 0 from lists and breakdowns. show: include them';

-- Down Migration

ALTER TABLE client.org
  DROP COLUMN zero_charge_mode;
