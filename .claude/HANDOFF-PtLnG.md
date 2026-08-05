# HANDOFF.md

## Current Task
Auth and landing page implementation complete. Five commits on `feat/auth-and-landing` across six phases: database schema, auth plumbing, IDOR fixes, MCP API keys, frontend public/auth split, and Rayshio rename. 53 files changed. All tests, linting, and type checks pass. Production migrated cleanly; no test artifacts leaked.

## Key Decisions Made

| Decision | Rationale |
|---|---|
| Better Auth + Google OAuth | Replaces DASHBOARD_PASSWORD; enables multi-tenant sign-in |
| Separate OAuth clients (sign-in vs Gmail) | Gmail client's `gmail.readonly` scope would show mailbox-access consent on login if shared |
| Explicit org membership, no auto-inherit | First person through the door doesn't inherit a tenant; deliberate membership via CLI grant |
| MCP keys in `client.api_key`, `imcp_` prefix | Database-backed, deterministic format, legacy fallback still works for one release |
| Polymorphic `/` route | Marketing page when signed out, dashboard when signed in; avoids `/app` path proliferation |
| Migrations run at boot for both roles | No pre-deploy command needed; concurrent deploys safe via `pg_try_advisory_lock` with retry |
| Legacy `DASHBOARD_PASSWORD` cookie support | One-release bridge so a deploy doesn't sign anyone out mid-session |

## Files Changed
53 files: database migrations (0005, 0006), auth middleware (`src/auth/`, `src/context/`), API routes (IDOR fixes, requireAuth-first), CLI commands (grant-membership, seed-dev-user, create-api-key), frontend (Landing/SignIn, public/authenticated route split, Wordmark, Reveal motion component, tailwind tokens lede/hero/hero-lg), SPA build (robots.txt, sitemap.xml generation), Playwright tests (27 checks), and docs (README, CLAUDE.md).

## Next Steps — Before Deployment (In Order)

1. **Set `BETTER_AUTH_SECRET` on Railway first.** `src/auth/index.ts` requires it at import; deploying without it crash-loops the mcp service and takes down `/mcp`.
2. Create separate Google OAuth client (scopes: `openid email profile`), register redirect `https://<host>/api/auth/callback/google`.
3. Set `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_URL`, `ALLOWED_SIGNUP_EMAILS`.
4. Build SPA with `VITE_PUBLIC_ORIGIN=https://<host>` (canonical, OG, sitemap URLs must be absolute).
5. Deploy and monitor for auth-related errors.
6. Sign in once, then: `pnpm cli grant-membership --org 1 --email techteam@nczgroup.com --role owner`.

## Open Questions

**Privacy and Terms blocking `gmail.readonly` verification:** The prose is factual but not legally reviewed. Not a merge blocker, but required before requesting Google's restricted-scope verification.

**Domain ownership for restricted scope:** Google's verification prefers a domain you own. Railway's generated domain (`invoice-mcp-production-9bd0.up.railway.app`) likely won't pass. Mitigation: request verification after custom domain is live, or handle restricted scope differently at launch.

**Committed plan docs:** Untracked `dev/*.md` files (plan templates) were committed with phase 1. Drop them if they're not keeping (safe to delete post-merge).

**Scratch database artifact:** Local `invoicemcp_verify` database created during verification. Not harmful, but clean up with `dropdb invoicemcp_verify` if desired.
