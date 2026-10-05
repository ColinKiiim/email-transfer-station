# Administrator browser sessions

The administrator password login now preserves the browser session across tabs
and browser restarts. The browser restores a short-lived API token automatically;
an expired API token triggers one renewal and one retry of the original request.
Concurrent requests share one renewal, and write retries retain their request ID.
Network/server failures preserve the current credentials. A private-site password
challenge remains separate from an administrator login challenge.

The API token still expires after one hour and is sent in `x-admin-auth`.
The persistent credential is an opaque random token in an HttpOnly cookie,
Secure on HTTPS, restricted to `/open_api/`. D1 stores its digest, administrator
username, configuration version, and expiry in `admin_browser_sessions`.
Every browser-session-backed API token checks the stored session, so logout
revokes already-issued tokens immediately. Existing one-hour tokens without a
browser-session claim remain valid until their normal expiry; one fresh password
login establishes persistence after rollout.

Renewal extends the cookie and server record to 90 days from the renewal. There
is no fixed deadline measured from the original login. Normal continued use keeps
the session active; 90 days without renewal, deleting cookies, logout, removal of
the session record, or a change to administrator passwords/usernames/signing key
requires a new login. Configuration-mismatched records are deleted when checked.
This is a rolling browser session, not a permanently valid bearer credential.

`POST /open_api/admin_session` restores/renews the API token.
`POST /open_api/admin_logout` revokes the cookie session. The administrator,
user-portal, and address-account sign-out paths revoke it before clearing local
credentials. A failed server logout is reported rather than claiming completion.
Session endpoints require JSON and the existing explicit origin allowlist;
credentialed CORS is enabled only for these endpoints. Cross-origin HTTPS uses
SameSite=None; third-party cookie restrictions still apply. The production Pages
same-origin proxy is the supported route for reliable persistence.

## Reference behavior

- [Google Account help](https://support.google.com/accounts/answer/54490?hl=en)
  describes staying signed in until sign-out for ordinary Google services.
- [Microsoft Entra session lifetime](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-session-lifetime)
  documents a default 90-day rolling sign-in frequency, persistent browser
  sessions, and reauthentication when security posture changes. It explicitly
  includes Exchange Online; organization policies can override the defaults.
- [Google Workspace session control](https://support.google.com/a/answer/7576830?hl=en)
  distinguishes ordinary web sessions from the stricter one-hour Google Admin
  console. The selected product behavior follows the requested inbox experience.

## Rollout and validation

`schema.sql` is the only definition of the new session table/index. The existing
migration executor creates missing canonical tables and indexes when upgrading
v0.0.18 to v0.0.19; no historical SQL or existing resource rows are rewritten.
The earlier v0.0.18 authenticator compatibility requirements still apply when
upgrading an older production database; see [database maintenance](../db/README.md).
Worker, Pages frontend, and schema must all be updated for the fix to take effect.
Production rollout and D1 writes require separate authorization.

Runnable regression coverage is in `worker/src/__tests__/admin_browser_session.test.ts`,
`worker/src/__tests__/database.test.ts`, `frontend/src/api/__tests__/settings.test.js`,
and `frontend/src/admin/__tests__/admin-session.test.js`.
