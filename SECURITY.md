# Security policy

## Support status

| Version | Security support |
| --- | --- |
| Current `main` / `0.0.0-test` | Best-effort fixes during development; no production SLA |
| Older commits, forks, and modified deployments | Not supported by this repository |

There is no stable release. Operators must assess and secure their own Cloudflare
account, domains, bindings, data retention, and optional integrations.

## Reporting a suspected vulnerability

Private vulnerability reporting is not currently enabled for this repository. Do
not post exploit details, credentials, tokens, personal mail, attachment contents,
or production configuration in a public issue.

To request private coordination, open a minimal
[GitHub issue](https://github.com/ColinKiiim/email-transfer-station/issues/new) titled
`[Security contact request]`. Include only a non-sensitive affected area, the commit
or version, and a way to continue the conversation. Wait for the maintainer to
establish a private channel before sharing technical details. If that cannot be done
safely, do not submit sensitive material through this repository.

For an actively exposed deployment, first contain the incident: disable the affected
surface, rotate Cloudflare/admin/address credentials, revoke share tokens, and
preserve sanitized logs for investigation.

## Useful report context

After a private channel exists, include the affected commit, deployment shape,
reproduction prerequisites, impact, and a minimal proof of concept with all mailbox
content and secrets removed. Particularly sensitive boundaries include:

- Cloudflare account and API tokens;
- admin sessions, Address JWTs, user sessions, and share tokens;
- HTML/MIME rendering and attachment handling;
- Pages-to-Worker service bindings and CORS;
- Webhook, Telegram, OAuth, outbound-mail, S3, AI, and SMTP/IMAP integrations.
