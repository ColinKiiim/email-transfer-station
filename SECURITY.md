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

## Address-password migration

The Worker can read legacy address-password records and the versioned PBKDF2 format.
New-format writes are disabled unless `ENABLE_ADDRESS_PASSWORD_V2` is explicitly set
to `true`. Deploy the compatibility Worker before any frontend or SMTP/IMAP proxy
that sends `password_format`, and keep the flag disabled until compatibility has
been verified and a restorable D1 backup exists.

After the flag is enabled, successful address login and explicit password creation,
change, or reset can write PBKDF2 records. Disabling the flag stops further upgrades
but the compatibility reader must remain deployed. Once a PBKDF2 row exists, rolling
back to an older Worker requires restoring the pre-enable database backup or applying
a forward fix; the older Worker cannot read the new record. The repository does not
enable this flag or migrate production data automatically.

## Browser-origin policy

Worker browser requests allow only the request's own origin, the origin of
`FRONTEND_URL`, or an exact HTTP(S) origin in `CORS_ALLOWED_ORIGINS`. The policy
uses a fixed method/header set and rejects unknown preflight inputs. The canonical
Pages service-binding path is same-origin and needs no exception; do not add a
wildcard merely to make a separated frontend work.

Requests without `Origin`, including Agent and SMTP/IMAP clients, retain their
normal authentication behavior and receive no CORS headers. CORS is not an
authorization control: bearer credentials, admin sessions, endpoint permissions,
and write confirmations remain required for every caller.
