# Changelog

[中文](CHANGELOG.md)

## 0.0.0-test (unreleased)

### Added

- Added an admin console with `/admin` as its sole canonical entry and a same-origin
  `/api/admin/*` API.
- Added a managed-domain registry, Cloudflare Email Routing activation flow, and
  original-recipient recovery for external forwarding collectors.
- Added per-address share tokens, short-lived read-only sessions, expiry, individual
  and bulk revocation, and address-credential rotation.
- Added read state isolated by admin, address credential, share link, and user
  session.
- Added domain/address mail flow, access audits, Webhook configuration, and runtime
  diagnostics.
- Added the `email-transfer-station-agent-mail` Skill with no default credential
  persistence and explicit authorization boundaries for send, delete, and remote
  operations.

### Changed

- Changed defaults to administrator-created addresses, with anonymous creation and
  ordinary-user deletion disabled.
- Made Pages the only frontend release surface; its Function proxies Worker APIs
  through the same-origin `BACKEND` service binding.
- Moved admin APIs to `/api/admin/*`; old prefixes and admin routes remain only as
  compatibility implementations pending removal.
- Reworked branding, address-connection details, shared-inbox shell, admin mail flow,
  and responsive layouts around this product.
- Added read-only GitHub Actions CI for Worker/Frontend/Pages validation and manual
  E2E, matching local commands.
- Rewrote the Chinese and English release surface, removed the inherited docs site,
  and added verified provenance NOTICE and test-version security support boundaries.

### Fixed and security

- Fixed degraded admin previews for complex MIME, quoted-printable/base64, and HTML
  messages.
- Unified HTML rendering through DOMPurify and sandboxing; failed parsing no longer
  treats raw MIME as message body.
- Changed admin password reset to submit a hash and stopped returning stored password
  hashes from address listings.
- Made share-token writes return 403 consistently and revalidate token state for
  short-lived sessions after revocation.
- Stopped exposing internal Worker exceptions and kept E2E helper endpoints behind
  test-mode and optional-secret gates.
- Stopped accepting configured deployment passwords as admin API credentials and
  moved admin access to one-hour, tab-scoped signed sessions. Admin writes now have
  request IDs, outcome auditing, explicit dangerous-operation confirmation, and
  version/count conflict protection for address deletion, clearing, and credential
  operations.
- Fixed mail-flow filtering, unread state, whole-page scrolling, transfer decoding,
  and selected HTML body rendering.
- Explicitly prohibited leaking Agent mailbox Address JWTs through URLs, command
  arguments, terminal output, logs, or cross-origin redirects, with synthetic-canary
  and read-only CI enforcement.

## Source baseline

This project diverged from `dreamhunter2333/cloudflare_temp_email` commit
`72bbfe8fd6d329237fa2e70b17cb95031597b345`. Earlier history remains available from
that pinned commit, Git history, and the source link in [NOTICE](NOTICE); upstream
release notes are not duplicated here.
