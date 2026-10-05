# Email Transfer Station

This repository is the single product Git root. Keep the existing package
boundaries: `worker/` for Hono/Workers/D1, `frontend/` for Vue, `pages/` for the
same-origin proxy, `db/` for schema and migrations, `e2e/` for Docker/Playwright,
`mail-parser-wasm/` for Rust/WASM, `smtp_proxy_server/` for SMTP/IMAP, and
`skills/` for reusable mailbox contracts and maintenance tools.

The canonical mailbox Skill is `skills/email-transfer-station-agent-mail/`.
Validate its credential contract with:

```powershell
node --test scripts/validate-agent-mail-skill.test.mjs
node scripts/validate-agent-mail-skill.mjs
```

For explicitly delegated AgyCLI work, read
[`docs/agy-cli-operation-guide.md`](docs/agy-cli-operation-guide.md).
Independent local Codex/Antigravity sessions follow this file and
`docs/CURRENT.md`; do not automatically launch or delegate to the other tool.

## Contracts and authorization

- Admin UI is `/admin`; the canonical admin API is `/api/admin/*`.
- Admin API requests use the short-lived `x-admin-auth` session returned by
  `/open_api/admin_login`; configured `ADMIN_PASSWORDS` values are never API
  credentials.
- Admin writes carry `x-admin-request-id`; every `DELETE` and designated
  high-impact `POST` also requires `{"confirm":true}`.
- Public, user, address-credential, and share-token routes retain their existing
  authentication and resource-level authorization boundaries.
- Change requests authorize local edits and proportionate local validation.
  Push, deployment, D1 migration, DNS/domain, GitHub, and Cloudflare writes
  require explicit authorization for the current task. Never print, log, or
  commit secrets, runtime configuration, mailbox contents, or browser state.
- Preserve unrelated dirty work. Do not reset, clean, stash, delete, or broaden
  cleanup without explicit authorization.

## Source and configuration rules

- `db/schema.sql` and dated files under `db/` are the SQL sources. Do not create
  a second hand-maintained schema copy or put table definitions in a route.
- Use `worker/wrangler.toml.template` for local configuration; real Wrangler
  configuration and `.env*` files remain ignored. Pages builds and deploys run
  from `pages/`, including its `BACKEND` binding.
- `references/`, local output, release readiness, receipts, and governance
  archives are not product source and stay outside the tracked tree.
- Follow the ponytail principle: reuse existing helpers and dependencies, choose
  the smallest working change, delete before adding abstractions, and leave one
  meaningful runnable check for non-trivial logic. Do not introduce generic
  resource engines, ORMs, event buses, microservices, or a whole-repo language
  migration for this refactor.

## Validation

Run only checks relevant to the changed package. The normal menu is:

```powershell
cd worker
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build

cd ../frontend
corepack pnpm run lint
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
corepack pnpm run build:pages

cd ../pages
corepack pnpm install --frozen-lockfile
node --check functions/_middleware.js

cd ..
git diff --check
```

Run E2E, SMTP, Rust/WASM, browser, documentation, or security checks only when
the changed surface requires them. Browser matrices and screenshot sweeps need
explicit user direction, except for one local reproduction of a defect that
source, tests, and build cannot validate.

Use `docs/CURRENT.md`, `docs/INDEX.md`, and the active plan as the current
maintenance record. Update them once at delivery for material work. Work in
stages when the user requests staged review and pause after the authorized stage.
