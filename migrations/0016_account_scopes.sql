-- Up Migration

-- Which scopes a stored Gmail grant actually carries.
--
-- Sending invoices to an accountant needs `gmail.send`, which every grant
-- created before this migration lacks: they were minted asking only for
-- `gmail.readonly`. Without a record of that, the only way to discover the
-- shortfall is to attempt a send and read a 403 back from Google — after the
-- zip has been built, and with nothing on screen beforehand to explain why the
-- button was going to fail.
--
-- Nullable rather than defaulted to the readonly scope. Null means "granted
-- before we started recording", which is a different statement from "we asked
-- and this is what we got", and a backfill would blur the two by inventing
-- certainty about grants nobody inspected.
ALTER TABLE client.account
  ADD COLUMN scopes text;

COMMENT ON COLUMN client.account.scopes IS 'space-separated OAuth scopes the stored refresh token was granted; null for grants predating this column';

-- Down Migration

ALTER TABLE client.account
  DROP COLUMN scopes;
