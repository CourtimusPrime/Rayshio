-- Up Migration

-- Better Auth's four identity tables. Transcribed by hand from
-- `npx @better-auth/cli generate` and cross-checked against the resolved
-- schema of the installed better-auth (getAuthTables), so the column set is
-- the runtime's, not the CLI's.
--
-- They live in `client` alongside the tenant tables and are `auth_`-prefixed
-- so they cannot collide with the existing `client.account`, which is a Gmail
-- mailbox connection rather than a login. Ids are `text` because Better Auth
-- generates them; that is deliberately NOT how `client.org.id` works, and the
-- two are never compared — see migration 0006 for the membership layer that
-- bridges `bigint org_id` to `text user_id`.
--
-- Purely additive: no existing row is read, written or deleted.

CREATE TABLE client.auth_user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE client.auth_user IS 'Better Auth identity. Owns who signs in; owns no tenancy — see client.org_member';

CREATE TABLE client.auth_session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES client.auth_user (id) ON DELETE CASCADE
);

CREATE INDEX index_auth_session_user_id ON client.auth_session (user_id);

CREATE TABLE client.auth_account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES client.auth_user (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE client.auth_account IS 'sign-in provider links (Google), and the password hash for the non-production email/password harness';

CREATE INDEX index_auth_account_user_id ON client.auth_account (user_id);

CREATE TABLE client.auth_verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX index_auth_verification_identifier ON client.auth_verification (identifier);

-- Down Migration

DROP TABLE client.auth_verification;
DROP TABLE client.auth_account;
DROP TABLE client.auth_session;
DROP TABLE client.auth_user;
