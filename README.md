# Email Transfer Station

Email Transfer Station is a self-hosted mailbox transfer station for temporary or delegated inboxes. It is built on Cloudflare Workers, D1, KV, Email Routing, and a Vue frontend.

Current development label: `v0.0.0(test)`.

## Current MVP Scope

- Receive email through Cloudflare Email Routing.
- Receive forwarded mail from external providers such as ImprovMX by using collector addresses.
- Store mailbox metadata and raw mail in Cloudflare D1.
- Create administrator-managed mailbox addresses.
- Share a single mailbox through token links without exposing the administrator console.
- Generate fixed credential auto-login links for a mailbox address.
- Rotate address credentials so old fixed links stop working.
- Revoke existing share tokens for an address.
- View administrator mail activity grouped by domain and address.
- Optionally keep Webhook, Telegram, SMTP/IMAP proxy, and forwarding features from the inherited codebase.

## Repository Layout

```text
worker/          Cloudflare Worker API and mail ingestion logic
frontend/        Vue frontend
pages/           Cloudflare Pages Functions bridge
db/              D1 schema and migration SQL
smtp_proxy_server/
vitepress-docs/  inherited docs area, not yet release-ready
```

GitHub Actions from the inherited codebase are intentionally disabled under `.github/workflows-disabled/`. Do not enable them before reviewing project names, deployment targets, secrets, and release behavior.

## Deployment Notes

Use `worker/wrangler.toml.template` as the public configuration template. Local real deployment files such as `worker/wrangler.toml` must stay untracked because they contain deployment IDs, domains, and secrets.

The basic Cloudflare deployment needs:

- Worker route or worker.dev hostname.
- D1 database binding named `DB`.
- KV namespace binding named `KV` if Webhook or KV-backed features are enabled.
- Cloudflare Email Routing for domains hosted on Cloudflare.
- Collector addresses if external domains forward through ImprovMX or similar providers.

## Development

```bash
cd worker && pnpm run lint && pnpm run build
cd ../frontend && pnpm run build
```

Run `git diff --check` before publishing changes.

## License

This project currently preserves the inherited MIT license and copyright notice. A separate NOTICE or attribution pass should be completed before the first public release.
