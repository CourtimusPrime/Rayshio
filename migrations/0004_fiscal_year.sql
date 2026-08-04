-- Up Migration

-- Calendar month the org's fiscal year starts in (1-12). Defaults to January,
-- which makes fiscal periods identical to calendar ones until it is changed.
ALTER TABLE client.org
  ADD COLUMN fiscal_year_start_month smallint NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12);

COMMENT ON COLUMN client.org.fiscal_year_start_month IS 'first calendar month of the fiscal year; fiscal years are named for the year they end in';

-- Down Migration

ALTER TABLE client.org
  DROP COLUMN fiscal_year_start_month;
