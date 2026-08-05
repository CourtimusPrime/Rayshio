-- Up Migration

-- The membership layer. `client.org` stays the one tenant identity — it is a
-- `bigint` already FK-referenced from `client.account`, `client.billing_address`
-- and `billing.invoices` — and these tables bridge it to Better Auth's `text`
-- user ids. Owning ~200 lines of this is the reason the `organization` plugin
-- is not used: that plugin types org ids as `string` and ships a
-- `deleteOrganization` endpoint, which would issue a DELETE against an org row
-- that live invoices reference.
--
-- Purely additive: no existing row is read, written or deleted. Dropping these
-- four tables leaves `billing.*` and `server.*` untouched.

CREATE TABLE client.org_member (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES client.auth_user (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT index_org_member_org_user UNIQUE (org_id, user_id)
);

COMMENT ON TABLE client.org_member IS 'which users may see which org. The authorization decision for every /api route';

CREATE INDEX index_org_member_user_id ON client.org_member (user_id);

-- Which org a user is currently looking at. A user with one membership never
-- writes a row here; the resolver falls back to their sole membership.
CREATE TABLE client.user_active_org (
  user_id text PRIMARY KEY REFERENCES client.auth_user (id) ON DELETE CASCADE,
  org_id bigint NOT NULL REFERENCES client.org (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sign-up is allowlisted at launch. An address outside ALLOWED_SIGNUP_EMAILS
-- gets in only by holding a pending, unexpired invitation.
CREATE TABLE client.org_invitation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by text REFERENCES client.auth_user (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

-- Partial: an address may hold only one live invitation, but any number of
-- historical accepted/revoked ones.
CREATE UNIQUE INDEX index_org_invitation_pending_email
  ON client.org_invitation (org_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX index_org_invitation_email ON client.org_invitation (lower(email));

-- MCP client keys. The raw key is shown once at creation and never stored:
-- `key_hash` is its sha256 hex, `key_prefix` the leading 8 characters, kept
-- only so the dashboard can name a key the user can recognise.
CREATE TABLE client.api_key (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES client.org (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'MCP key',
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  created_by text REFERENCES client.auth_user (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

COMMENT ON COLUMN client.api_key.key_hash IS 'sha256 hex of the raw key; the raw key is never stored';

CREATE INDEX index_api_key_org_id ON client.api_key (org_id);

-- Down Migration

DROP TABLE client.api_key;
DROP TABLE client.org_invitation;
DROP TABLE client.user_active_org;
DROP TABLE client.org_member;
