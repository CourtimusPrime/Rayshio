-- Up Migration

-- Org-level settings that until now had nowhere to live.
--
-- `default_currency` is deliberately NOT `budget_currency`. That column is the
-- denomination of the budget figure — the currency a budget was *set* in, which
-- must not move when someone changes what they are looking at. This one is the
-- display currency a workspace opens on. Conflating them would mean changing
-- your view silently rewrote your budget's meaning.
--
-- Nullable: an org that has never chosen one keeps today's behaviour, where the
-- client falls back to whichever currency most invoices were billed in.
ALTER TABLE client.org
  ADD COLUMN default_currency varchar(3);

COMMENT ON COLUMN client.org.default_currency IS 'display currency a workspace opens on; null falls back to the busiest currency in the data';

-- Single- vs Multi-Department, per SPEC.md's "Departments & teams".
--
-- Only the mode flag lands here. Teams, service assignment and the Teams tab
-- are a much larger change, and the spec is explicit that switching modes is a
-- view decision rather than a destructive one — so the flag has to be storable
-- before any of that exists, and turning the mode off later must not be able to
-- destroy assignment work.
ALTER TABLE client.org
  ADD COLUMN department_mode text NOT NULL DEFAULT 'single'
    CHECK (department_mode IN ('single', 'multi'));

COMMENT ON COLUMN client.org.department_mode IS 'single: the org is one budget unit. multi: spend is attributable to teams (SPEC.md)';

-- Down Migration

ALTER TABLE client.org
  DROP COLUMN department_mode,
  DROP COLUMN default_currency;
