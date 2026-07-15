# Email Transfer Station

[中文](README.md)

Email Transfer Station is a self-hosted mail-receiving and delegated-access system
for Cloudflare. Mail delivered by Cloudflare Email Routing or an external
forwarder reaches a Worker, mailbox and message data is stored in D1, and a
same-origin Pages frontend provides inbox, sharing, and administration surfaces.

> The current version is `0.0.0-test` (development label `v0.0.0(test)`). It is
> not a stable release and provides no production SLA, zero-downtime upgrade
> guarantee, or managed service. Operators are responsible for data protection,
> domains, cost, and Cloudflare configuration.

## Current product contract

| Surface | Path or location | Authentication boundary |
| --- | --- | --- |
| Public site and address inbox | `/`, `/api/*` | Address bearer credential or instance-level site authentication |
| Admin console | `/admin` | Short-lived session obtained with the admin account/password; API uses `x-admin-auth` |
| Admin API | `/api/admin/*` | Admin session |
| User center | `/user`, `/user_api/*` | User session; availability is instance-configured |
| Address sharing | `/i/:token` | Short-lived, read-only address session exchanged from a share token |
| Public settings and login | `/open_api/*` | Only settings and authentication endpoints intentionally designed as public |

`/admin` and `/api/admin/*` are the only promised admin interfaces.

A successful admin login returns a signed session valid for at most one hour; the
frontend keeps it only in the current tab's `sessionStorage`. Values configured in
`ADMIN_PASSWORDS` are login verifiers, not `x-admin-auth` API credentials, and
the Worker rejects a raw configured password as admin authentication. Admin
responses use `Cache-Control: no-store`; writes carry `x-admin-request-id`, and
every `DELETE` plus designated high-impact `POST` requests must also send
`{"confirm":true}`. Address deletion, inbox clearing, and credential operations
compare the version or counts observed by the caller and return `409` when state
has changed, requiring a refresh and renewed confirmation.

`DISABLE_ADMIN_PASSWORD_CHECK` is effective only when `E2E_TEST_MODE=true` too.
Both flags are for disposable local E2E environments, not production.

## Core capabilities

- Receive mail through Cloudflare Email Routing, store raw MIME and ingress
  metadata, and expose parsed views on demand.
- Receive non-Cloudflare-domain mail forwarded by services such as ImprovMX through
  collector addresses and recover the original recipient.
- Let administrators manage domains, addresses, mail flow, access packages, and
  runtime status.
- Create expiring and revocable read-only share links for one address.
- Rotate address credentials so old fixed auto-login links stop working.
- Track read state separately for admin, address credential, share-link, and user
  sessions.
- Let an Agent read a mailbox under holder authorization through
  `skills/email-transfer-station-agent-mail/`. The Skill does not persist or echo an
  Address JWT by default, and sending or deleting still requires explicit caller
  authorization.

Inherited Webhook, Telegram, SMTP/IMAP proxy, OAuth, outbound mail, S3 attachment,
and AI extraction capabilities remain optional compatibility surfaces. They are not
part of the minimum deployment gate and require separate review of bindings,
secrets, cost, and data flow before use.

## Architecture

```text
Cloudflare Email Routing ─┐
External forwarder ───────┴─> Worker (mail handler + Hono API)
                              ├─> D1: address, message, session, and audit data
                              ├─> KV: optional Webhook/code/Telegram state
                              └─> optional S3, AI, outbound-mail, and notification integrations

Browser ─> Cloudflare Pages (Vue SPA)
             └─> Pages Function ─BACKEND service binding─> Worker
```

The Pages Function proxies only `/api/`, `/open_api/`, `/user_api/`, `/telegram/`,
and `/external/`. The production frontend must be built and deployed from `pages/`
so Functions are included; publishing directly from `frontend/` bypasses that
contract.

## Repository layout

```text
worker/                         Worker, email handler, API, and Cloudflare bindings
frontend/                       Vue 3 SPA
pages/                          Pages build entry and same-origin Worker proxy
db/                             D1 schema and migration SQL
e2e/                            Docker + Playwright + Mailpit integration tests
mail-parser-wasm/               inherited Rust/WASM parser compatibility source
smtp_proxy_server/              optional SMTP/IMAP proxy
skills/email-transfer-station-agent-mail/
                                Agent mailbox-access contract
```

## Secret-free local validation

Use Node.js 22, Corepack, and pnpm 10.10.0. These commands only install, test,
and build; they do not require Cloudflare credentials:

```bash
cd worker
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run test
corepack pnpm run build

cd ../frontend
corepack pnpm install --frozen-lockfile
corepack pnpm run test
corepack pnpm run build
corepack pnpm run build:pages

cd ../pages
corepack pnpm install --frozen-lockfile
corepack pnpm run check
corepack pnpm run build

cd ..
git diff --check
```

Full E2E requires Docker:

```bash
cd e2e
npm ci
npm test
npm run test:down
```

## Self-hosting boundary

Deployment writes remote Cloudflare resources; review every command and target
account first. A minimum deployment needs:

1. A Cloudflare-managed domain with Email Routing enabled.
2. A D1 database plus only the KV, R2/S3, AI, send-email, or service bindings needed
   by enabled features.
3. An untracked `worker/wrangler.toml` created from
   `worker/wrangler.toml.template`, with every placeholder domain, database ID, and
   resource name replaced.
4. Admin credentials, JWT signing material, and third-party tokens stored with
   `wrangler secret put`; never put real values in TOML, README files, issues, or
   Git history.
5. D1 initialized from the schema/migrations under `db/` after a backup, followed by
   Worker deployment from `worker/`.
6. The Pages project name and `BACKEND` service binding checked in
   `pages/wrangler.toml`, followed by the canonical build/deploy command from
   `pages/` only.

For the address-password compatibility migration, deploy the Worker before an
updated Pages frontend or SMTP/IMAP proxy. Keep `ENABLE_ADDRESS_PASSWORD_V2=false`
until old and new callers have been verified and a restorable D1 backup exists,
then enable it explicitly. After enablement, retain the new reader; a full rollback
to the old Worker requires restoring the pre-enable backup.

The canonical Pages deployment calls the Worker same-origin through the `BACKEND`
binding and needs no CORS exception. Only a separate browser origin that calls the
Worker directly belongs in `CORS_ALLOWED_ORIGINS`; list its exact scheme, host, and
port and do not use a wildcard. Agent, SMTP/IMAP, and other no-`Origin` clients keep
their existing authentication contract.

```bash
cd worker
corepack pnpm run deploy

cd ../pages
corepack pnpm run deploy
```

Active CI has read-only validation permissions and does not deploy.
`.github/workflows-disabled/` is a non-executable historical workflow archive, not
a supported release path. There is currently no staging environment isolated from
production resources.

## Security and privacy

Message bodies, attachments, address credentials, share tokens, and admin sessions
are sensitive data. At minimum, a production operator should:

- use separate, least-privilege Cloudflare resources and API tokens;
- keep admin authentication enabled and rotate admin/address credentials;
- put Cloudflare Access or equivalent MFA/network access control in front of the
  production admin surface; the built-in admin session currently has no MFA,
  session denylist, or fine-grained admin roles;
- restrict public creation, deletion, sending, and Webhook features;
- back up D1 before migrations and define retention for message and audit data;
- keep mail HTML sanitization and automatic remote-media blocking enabled; and
- keep real mailbox contents, browser storage state, and Wrangler configuration out
  of Git.

See [SECURITY.md](SECURITY.md) for support and reporting. There is no private
vulnerability intake at present; do not paste exploit details, credentials, or
personal mail into a public issue.

## Provenance and license

This project continues from a pinned source snapshot of
`dreamhunter2333/cloudflare_temp_email`. See [NOTICE](NOTICE) for the source commit,
preserved copyright, and the third-party license for the Telegraf patch. The root
[LICENSE](LICENSE) preserves the upstream MIT license; dependencies remain subject
to their own licenses.

Project home: <https://github.com/ColinKiiim/email-transfer-station>
