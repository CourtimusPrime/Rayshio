# Rayshio: real auth, multi-tenancy, and a public landing page

Implementation plan. Status: **not started** — no code written, no branch created.

---

## Context

The dashboard is gated by a single shared password (`src/api/session.ts`) that hashes into
a stateless HMAC cookie carrying no identity — no user id, no email, nothing. There is
**no user table anywhere in the schema**, and `client.account` is a Gmail mailbox
connection, not a login. `DEFAULT_ORG_ID` is a process-wide env constant read in exactly
two places, so every authenticated visitor sees org 1's invoices.

That password was never set on Railway, so the production dashboard has never been
reachable. Rather than set it, we are replacing it: **Better Auth with Google sign-in, real
multi-tenancy, and a public marketing page** as the product's front door.

Three decisions were made before planning:

- The product is renamed **Rayshio** on all surfaces except the repo, the `/mcp` endpoint
  and `MCP_API_KEY` — renaming those breaks published client configs.
- Sign-in is **Google OAuth only**, on a **new OAuth client** separate from the Gmail one.
- Sign-up is **allowlisted at launch**, with the full multi-tenancy machinery built behind
  the gate so opening it later is deleting one hook.

Branch off `main` (currently `1bf63d5`, deployed and healthy).

---

## Two findings that shape everything

### 1. `express.json()` currently breaks Better Auth

Better Auth's docs are explicit: *"Don't use `express.json()` before the Better Auth
handler… or the client API will get stuck on 'pending'."* `src/mcp/server.ts:14` applies it
globally, before every route. It must move below the auth mount.

Express 5 also needs `app.all('/api/auth/*splat', …)` — the bare `/api/auth/*` form is
v4-only and will not match.

### 2. Do not use Better Auth's `organization` plugin

It looks like the obvious fit for multi-tenancy and it is a trap.

`client.org.id` is `bigint GENERATED ALWAYS AS IDENTITY`, FK-referenced from
`client.account`, `client.billing_address` and `billing.invoices`. Better Auth types
`organization.id` as `string`. Mapping one onto the other puts every plugin comparison
through an implicit cast, and the plugin exposes `deleteOrganization`, which would issue
`DELETE FROM client.org` against a row referenced by 112 live invoices.

Instead: **Better Auth owns identity only** — `auth_user`, `auth_session`, `auth_account`,
`auth_verification`, all `auth_`-prefixed in the `client` schema so they cannot collide
with the existing `client.account`. **`client.org` remains the one tenant identity**, and
we own a ~200-line membership layer keyed on `bigint org_id` + `text user_id`.

Fully reversible: dropping our tables leaves `billing.*` and `server.*` untouched.

---

## Release sequencing

Three releases, so a mistake never locks anyone out of production.

| Release | Contents |
| --- | --- |
| **R1** | Additive only. Better Auth mounts, tables land, tenancy resolves, IDOR fixed. The old `imcp_session` cookie **still works** via one contained fallback branch. Landing page ships. |
| **R2** | Removals. Delete `session.ts`, `DEFAULT_ORG_ID`, the password vars, the legacy cookie branch. |
| **R3** | Delete the `MCP_API_KEY` env fallback, once keys live in the database. |

---

## Phase 0 — prerequisites (before any code)

1. **New Google OAuth client**, scopes `openid email profile` only. Redirect URIs:
   - `https://<prod-host>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:5173/api/auth/callback/google` (Vite proxy, dev)

   Keeping sign-in off the Gmail client matters: that one carries `gmail.readonly`, a
   **restricted** scope, so a shared client would show a mailbox-access consent screen for
   a plain login.

2. Set on **both** Railway services before deploying any code: `BETTER_AUTH_SECRET`,
   `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_URL`,
   `ALLOWED_SIGNUP_EMAILS`, `VITE_PUBLIC_ORIGIN`. Leave `DASHBOARD_PASSWORD` in place.

3. `pnpm add better-auth helmet` (root), `pnpm --filter web add better-auth`.

4. **Spike first, ~30 minutes.** Stand up `betterAuth()` locally against Postgres with a
   `search_path=client` pool and `modelName: 'auth_user'`, and round-trip a Google sign-in.
   This validates the single riskiest assumption — the Kysely adapter against a
   non-`public` schema with snake_case field mapping — while it is still cheap to change.

   Fallback if it fails: put the four tables in `public` and widen `scripts/codegen.sh`'s
   include-pattern.

---

## Phase 1 — schema

**`migrations/0005_better_auth.sql`** — `auth_user`, `auth_session`, `auth_account`,
`auth_verification` in the `client` schema. Text ids, snake_case columns,
`ON DELETE CASCADE` from user.

**`migrations/0006_tenancy.sql`**

| Table | Purpose |
| --- | --- |
| `client.org_member` | org_id bigint, user_id text, role `owner\|admin\|member`, unique per pair |
| `client.user_active_org` | which org a user is currently looking at |
| `client.org_invitation` | email, role, status, 7-day expiry |
| `client.api_key` | org_id, sha256 `key_hash`, `key_prefix`, `revoked_at` |

Both migrations are **purely additive** — no existing row is read, written or deleted.

- Generate the auth DDL with `npx @better-auth/cli generate` **locally**, diff it, and
  hand-transcribe into the numbered SQL migration.
- **Never run `@better-auth/cli migrate`** against any database. This repo's migrations
  must go through node-pg-migrate to be recorded in `pgmigrations` and to survive a
  Railway deploy. Record that rule in `CLAUDE.md`.
- `pnpm codegen` to refresh `src/db/types.ts`.
- **`src/main.ts` must run migrations for both roles**, not just `SERVICE_ROLE=worker`.
  Today the web service can boot before the worker has applied 0005, and every sign-in
  then 500s on a missing table. node-pg-migrate takes an advisory lock so a concurrent
  second run blocks and no-ops — **prove that against a scratch DB before relying on it.**

---

## Phase 2 — auth plumbing

New files: `src/auth/index.ts` (the instance), `src/auth/context.ts`
(`resolveAuthContext`, `requireAuth`, `requireOrgRole`), `src/auth/memberships.ts`,
`src/auth/api-keys.ts`, `src/types/express.d.ts`.

`src/mcp/server.ts` middleware order becomes:

```
app.set('trust proxy', 1)           // NEW — Railway edge; today req.ip is the proxy,
app.disable('x-powered-by')         //   so the login throttle is one global bucket
app.use(helmet({ contentSecurityPolicy: false }))   // NEW — X-Frame-Options above all
app.get('/healthz')
app.all('/api/auth/*splat', toNodeHandler(auth))    // NEW — BEFORE express.json()
app.use(express.json({ limit: '4mb' }))             // MOVED DOWN from line 14
app.use('/api', requireSameOrigin)                  // NEW — non-GET origin check
app.post('/mcp', apiKeyAuth, …)  /  405 stubs
app.use('/api', publicRouter())                     // NEW — the only ungated router
app.use('/api', apiRouter())
app.use('/api', errorHandler)  /  static  /  SPA fallback
```

The existing SPA fallback regex already excludes `/api/`, so it needs no change.

`AuthContext` is `{ userId, orgId, role }` with **`orgId` non-optional** — a handler that
has a context has an org, and there is no `orgId ?? default` anywhere in the codebase.

**CSRF posture.** `SameSite=Lax` already blocks classic CSRF. Better Auth validates
`Origin` on its own routes; our two state-changing routes (`PATCH /api/budget`,
`PATCH /api/settings/fiscal-year`) get a 15-line same-origin check rather than a token
scheme. `POST /mcp` must never accept a cookie — it reads headers only, and must stay that
way.

---

## Phase 3 — the security fixes (one commit, together)

`routes.ts:100`'s `router.use(requireSession)` means **anything declared above it is
silently public**. Fix structurally: `apiRouter()` starts with `router.use(requireAuth)` as
its first statement, and genuinely-public routes move to `src/api/public-routes.ts`.

**Two queries do not filter by org.** They are safe today only because `orgId` is a process
constant; they become real IDOR holes the moment it is session-derived. Both gain an
`innerJoin` on `billing.invoices` and a `.where('i.org_id', '=', orgId)`:

- `src/queries/invoices.ts:143` — `getLineItems(invoiceId)` → `(orgId, invoiceId)`.
  `selectAll()` must become `selectAll('li')` or the join leaks invoice columns into the
  response body.
- `src/queries/invoices.ts:100` — `dominantCategories(invoiceIds)` → `(orgId, invoiceIds)`.
  Columns must be qualified after the join or Kysely emits ambiguous SQL.

Every other query file was audited and correctly filters on `org_id`. The GridFS PDF fetch
takes its `pdf_id` from an org-checked row, so it is safe — add a comment recording *why*,
so the guard is not refactored away.

Then delete `DEFAULT_ORG_ID` from config and let the **compiler** find the two call sites
(`routes.ts:89`, `mcp/tools/index.ts:48`).

---

## Phase 4 — MCP keys, onboarding, R1 deploy

**The MCP wire format cannot change.** `McpSetupGuide.tsx` publishes
`Authorization: Bearer <MCP_API_KEY>` configs that exist on user machines today.
`src/mcp/auth.ts` gains a `sha256 → client.api_key → org_id` lookup, keeps accepting both
`Bearer` and `x-api-key`, and keeps a constant-time fallback to `config.MCP_API_KEY` mapped
to `MCP_LEGACY_KEY_ORG_ID`. That fallback exists purely so a deploy landing before the
adopt-key step does not 401 every client. Removed in R3.

Key format: `imcp_` + 32 bytes base64url. Store sha256 hex plus an 8-char prefix for
display. Show the raw key exactly once, at creation.

**Onboarding.** `databaseHooks.user.create.before` rejects any email not in
`ALLOWED_SIGNUP_EMAILS` and without a pending invitation.

Claiming org 1 is a **manual one-off**: sign in with Google, then
`pnpm cli grant-membership --org 1 --email … --role owner`. A hook that auto-claims the
first org would mean "first allowlisted person to sign in silently inherits the production
tenant", which is not a property this system should have.

**R1 keeps one legacy branch** in `resolveAuthContext`: a valid old `imcp_session` cookie
yields `{ userId: 'legacy', orgId: DEFAULT_ORG_ID, role: 'owner' }`. Confined to that one
function so R2 is a single deletion.

---

## Phase 5 — frontend

**The blocker:** `App.tsx:37` gates the entire app *above* the router, so react-router has
no unauthenticated route table at all. Fix minimally — **do not move the app under
`/app`**, which would touch every NavLink, the titles map and every bookmark for no gain.

Instead **`/` is polymorphic**: signed out → `<Landing/>`, signed in → `<Dashboard/>`. A
crawler is always signed out, so `/` is the marketing page for exactly the audience that
needs it. A second public `<Routes>` sits below the gate; `Shell` gains four lines
(`/signin` → redirect home, `/privacy`, `/terms`, and `*` → `<NotFound/>` instead of
`<Dashboard/>`).

- `web/src/routes.ts` (new) — `APP_TITLES` plus a derived `APP_PATHS`, so the path list
  cannot drift from the titles map.
- Unknown paths: a known app path redirects to `/signin?next=…`; anything else 404s. Guard
  `next` against protocol-relative URLs (`//evil.example`).
- **Sign-out must hard-navigate** (`location.assign('/')`). Without it, signing out at
  `/invoices` lands on `/signin?next=/invoices` — "you signed out, now sign back in".
- `useSession`/`useLogout` become thin adapters over `authClient`, preserving their current
  shapes so `App.tsx` and `TopBar.tsx` are untouched. `useLogin` is deleted.

### Type scale

The ramp stops at `text-display` (32px) — deliberate for a dense dashboard, wrong for a
hero. Add three tokens to `tailwind.config.js`, continuing the same two curves (tracking
tightens and leading closes as size grows):

| token | size / leading / tracking |
| --- | --- |
| `lede` | 17px / 28px / −0.014em |
| `hero` | 40px / 44px / −0.032em |
| `hero-lg` | 56px / 60px / −0.036em |

Used as `text-hero md:text-hero-lg`. `text-title2` (22px) already exists and is unused, so
section headings need nothing new.

### Assets

**No new asset is needed for Google.** `@lobehub/icons-static-svg` is already a dependency
and `serviceIcons.ts:3` already imports `google-color.svg?raw` — the official 4-colour G.
It must sit on a neutral surface, never on the accent button (brand guidelines), which is
why the header CTA stays teal and the Google button is `bg-surface`.

New `web/public/`: `robots.txt`, `sitemap.xml`, `favicon.svg` (theme-inverting),
`apple-touch-icon.png`, and `og.png` generated by a Playwright screenshot of a local
template — using the tooling `CLAUDE.md` already mandates, so no new dependency.

### Landing sections

All reuse existing recipes: padded card (×13 in the app), clipped card (×6), micro-label
(×11), and `.material-chrome` for the sticky header via the existing `useScrollEdge`.

1. **Hero** — headline, lede, Google button, plus a `HeroPreview` built from the app's own
   card vocabulary and real `ServiceLogo`s. Restrict the mock's vendors to lobe-covered
   names so a signed-out visitor never triggers a fetch to the authed `/api/logo/:service`.
2. **Five feature blocks** — Gmail ingestion including the billing-alias case; query-time
   FX at each invoice's own date; cross-vendor category comparison; MCP access for agents;
   fiscal periods.
3. **Three-step "how it works"** band on `bg-surface`.
4. **Closing CTA** card.
5. **Footer** carrying the `ThemeToggle` — which needs no changes, since `ThemeProvider`
   already sits above the router.

Copy is drawn only from what the product **actually does**. `dev/PRODUCT.md`'s "send
invoices directly to their accounting provider" is **not built** and must not appear. Every
string lives in `web/src/marketing/copy.ts`. The hero preview carries an explicit
"illustrative figures" line, matching the honesty of `ConversionNote`.

### Motion

Stays quiet. One `Reveal` component using only `SPRING.ui` / `FADE` via `useMotionPrefs`,
`y: 12` to match the app's small-displacement vocabulary, `once: true`. Feature-card hover
is CSS only, and finally justifies the `shadow-e2` and `ease-apple` tokens the ramp defined
but never used. No parallax, no scroll-scrub, no animated counters.

### SEO

`web/index.html:6`'s `noindex` **must be deleted**. When Googlebot sees it in the initial
HTML it drops the page and never runs the JS, so a runtime removal can never work.
`noindex` is instead *added* at runtime on `Shell`, `SignIn` and `NotFound`, which does
work.

Add title, description, canonical, OG and theme-color **statically** — Slack and LinkedIn
do not execute JS.

---

## Phase 6 — the Rayshio rename

Landing page, a new `Wordmark` component (extracted from the duplicate lockups in
`Sidebar.tsx:30-35` and `Login.tsx:20-25`), page titles, `README.md`.

**Not** renamed: the repo, the `/mcp` endpoint, `MCP_API_KEY`, or the `imcp` cookie prefix.
Those are published contracts.

---

## Verification

Per `CLAUDE.md`, Playwright CLI, not the Chrome extension.

**The tenancy test must not be skipped.** Create a throwaway `client.org` id 2 with one
invoice and one line item, sign in as an org-2 user, and confirm:

- `GET /api/invoices/<org-1-id>` → 404
- that invoice's PDF → 404
- an org-1 invoice's line items are unreachable
- `GET /api/summary` shows only org-2 totals
- an org-2 API key against `POST /mcp` `get_invoice` on an org-1 id returns not-found

Then delete org 2.

Also verify: an existing Claude Desktop config still works after R1 (unchanged key, now
DB-backed); signed-out `/`, `/signin`, `/invoices` → `/signin?next=/invoices`, `/nonsense`
→ 404; signed-in deep-link reload of `/invoices`; sign-out from `/invoices` lands on `/`;
`robots.txt` and `og.png` are served by `express.static` before the SPA fallback; both
themes at 1440 and 390 with a horizontal-overflow check at 375; and a screenshot-diff of
the sidebar, since the `Wordmark` extraction is the only edit to authenticated markup.

**`CLAUDE.md:20-24` breaks.** The Playwright harness signs in with `DASHBOARD_PASSWORD`,
and Google OAuth cannot be driven headlessly. Replace with
`emailAndPassword: { enabled: NODE_ENV !== 'production', disableSignUp: true }` plus a
`seed-dev-user` CLI command — structurally impossible in production rather than merely
guarded. Update `CLAUDE.md` in the same PR.

---

## Known blockers and open risks

- **`/privacy` and `/terms` are a launch blocker, not a merge blocker.** `gmail.readonly`
  is a Google *restricted* scope; verification requires publicly reachable policy and terms
  pages on the app's own domain. Routes and prose scaffolding are planned; **the content
  must be supplied.**
- Unverified, worth proving early:
  - the Kysely adapter against a non-`public` schema (Phase 0 spike)
  - node-pg-migrate's advisory lock under two simultaneous boots
  - whether `databaseHooks.user.create.before` returning `false` yields a clean OAuth error
    redirect or an unhandled 500
  - whether Better Auth's rate limiter honours Express's `trust proxy`
- The exact Better Auth column set should come from `@better-auth/cli generate`, not from
  this document's SQL.
- Invitation **email delivery** is out of scope — there is no mailer in this repo.

---

## Critical files

| File | Change |
| --- | --- |
| `src/mcp/server.ts` | middleware order, the `express.json()` move |
| `src/api/routes.ts` | `requireAuth` first, `DEFAULT_ORG_ID` deleted |
| `src/queries/invoices.ts` | the two IDOR fixes |
| `src/mcp/auth.ts` | key → org lookup |
| `src/config.ts`, `src/main.ts` | new vars; both roles migrate |
| `src/auth/*` | new |
| `migrations/0005_*.sql`, `0006_*.sql` | new |
| `web/src/App.tsx` | the public / authenticated split |
| `web/tailwind.config.js` | `lede`, `hero`, `hero-lg` |
| `web/index.html`, `web/public/*` | meta rewrite, new assets |
| `web/src/pages/Landing.tsx`, `SignIn.tsx` | new; replaces `Login.tsx` |
| `web/src/marketing/copy.ts` | all strings, one file |
