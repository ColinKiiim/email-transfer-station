# Email Transfer Station repository guide

Email Transfer Station is a multi-package Cloudflare mail application. Keep changes inside the package that owns the behavior:

- `worker/`: Hono Worker, Email handler, D1/KV/binding integrations.
- `frontend/`: Vue 3 application.
- `pages/`: Pages Functions and the same-origin Worker proxy.
- `db/`: D1 schema and migrations.
- `e2e/`: Docker/Playwright integration tests.
- `mail-parser-wasm/`: Rust/WASM mail parser.
- `smtp_proxy_server/`: Python SMTP/IMAP proxy.
- `skills/email-transfer-station-agent-mail/`: canonical mailbox-agent Skill.

## API and deployment contracts

- Mailbox API: `/api/*` with an Address bearer credential.
- Admin SPA: `/admin`.
- Canonical admin API: `/api/admin/*` with `x-admin-auth`.
- Public API: `/open_api/*`; user API: `/user_api/*`.
- Build the frontend in Pages mode, then deploy from `pages/` so Pages Functions and the `BACKEND` binding are included.

These contracts describe the codebase; they do not authorize push, deploy, migration, DNS, domain, or Cloudflare/GitHub writes.

## Work rules

- Inspect callers and existing helpers before changing shared behavior.
- Preserve unrelated work and never commit runtime secrets, real Wrangler config, `.env*`, browser auth state, or mailbox contents.
- Use Conventional Commits and update both changelogs for user-visible product changes.
- Update public docs only when their behavior/config/API facts change.

## Local validation

Run scoped commands from the affected package:

```bash
(cd worker && corepack pnpm run lint && corepack pnpm run test && corepack pnpm run build)
(cd frontend && corepack pnpm run test && corepack pnpm run build && corepack pnpm run build:pages)
(cd pages && corepack pnpm install --frozen-lockfile && node --check functions/_middleware.js)
node --test scripts/validate-agent-mail-skill.test.mjs
node scripts/validate-agent-mail-skill.mjs
git diff --check
```

Run `e2e/`, SMTP proxy, Rust/WASM, browser, docs, or security checks when those surfaces change. Do not weaken tests to make a refactor pass.
