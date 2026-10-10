-- Up Migration

-- The email domain a workspace has claimed for auto-join: anyone who signs in
-- with a verified address on it, and belongs to no workspace yet, joins as a
-- member. Null means auto-join is off, which is every existing workspace.
--
-- The unique index exists so two tenants can never claim the same domain.
-- Without it a second org could claim a company's domain and siphon that
-- company's users into the wrong workspace. lower() makes the claim
-- case-insensitive; the index is partial so null (off) never collides with
-- another null.
ALTER TABLE client.org
  ADD COLUMN auto_join_domain text;

COMMENT ON COLUMN client.org.auto_join_domain IS 'email domain whose verified users auto-join this org as members; null = off';

CREATE UNIQUE INDEX index_org_auto_join_domain
  ON client.org (lower(auto_join_domain))
  WHERE auto_join_domain IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS client.index_org_auto_join_domain;

ALTER TABLE client.org
  DROP COLUMN auto_join_domain;
