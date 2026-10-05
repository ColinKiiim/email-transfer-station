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

Run the mailbox checks only when the mailbox Skill or its credential contract
changes; they are not a default repository test pass.

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
- Change requests authorize local edits and the smallest validation needed for
  the changed behavior. For every ordinary commit, the default delivery is:
  commit, push the current branch, and deploy production in the same task.
  An explicit local-only, no-push, or no-deploy instruction overrides that
  default. D1 migrations, DNS/domain changes, secret or credential rotation,
  destructive remote actions, rollback, force-push, and non-production writes
  remain protected actions and require explicit authorization. Never print, log,
  or commit secrets, runtime configuration, mailbox contents, or browser state.
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
- Follow the ponytail principle strictly for every change: trace the actual
  caller path first, then edit the fewest necessary files; reuse existing
  helpers and dependencies; delete or narrow before adding; and do not add an
  abstraction, dependency, config switch, schema copy, or cross-package edit
  unless the changed behavior cannot work without it. Do not introduce generic
  resource engines, ORMs, event buses, microservices, or a whole-repo language
  migration. Keep unrelated cleanup out of the diff.

## Validation and delivery

Do not run or add extra tests by default. Do not run a full suite, repeat a
check, or validate an unrelated package. Run at most the smallest relevant
check when the changed contract, security boundary, data-loss risk, build
output, or runtime behavior requires evidence; skip tests for documentation,
copy, styling, and other reversible low-risk edits unless the user asks for
them. Browser matrices, screenshots, E2E, SMTP, Rust/WASM, and security scans
also require an explicit request or a directly affected boundary. Never turn a
focused change into a repository-wide validation pass.

The normal product delivery path is:

```powershell
# Run only the one check required by the changed behavior, if any.
git diff --check
git add <task-owned-files>
git commit -m "<message>"
git push
pwsh -NoProfile -File skills/email-transfer-station-release-check/scripts/pages-release.ps1 `
  -Action Immediate -ConfirmDevelopmentValidated -AuthorizeDeploy
```

Use the Immediate release command once for a same-task product release. It
performs the required live preflight, one upload, and bounded acceptance; do
not manually chain `Prepare`, `Verify`, `Preflight`, a second build, or a
second deploy around it. Use the Deferred manifest flow only for a deliberate
handoff across tasks or days. The Pages package command remains a low-level
fallback, not a second default release path.

Use `docs/CURRENT.md`, `docs/INDEX.md`, and the active plan as the current
maintenance record. Update them once at delivery for material work. Work in
stages when the user requests staged review and pause after the authorized stage.
