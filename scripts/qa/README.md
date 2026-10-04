# Browser QA

This is the only active browser-QA entry for Email Transfer Station. It keeps the
test surface small: one CLI, one configuration file, one schema, and one manifest
per run.

## Setup and commands

```powershell
npm ci
npm run qa -- smoke --base-url http://127.0.0.1:4173 --fixtures
npm run qa -- smoke --base-url http://127.0.0.1:4173 --fixtures --viewports all
npm run qa -- inventory
```

The default target is the loopback fixture `http://127.0.0.1:4173`; the canonical admin route is
`/admin`, and admin APIs use `/api/admin/*`. A smoke run defaults to the `desktop`
and `narrow` viewports. Use a comma-separated subset or `all` when the change
requires the full matrix.

`--fixtures` is restricted to loopback targets and blocks external requests. The
authenticated fixture path also requires temporary test credentials:

```powershell
$env:ETS_QA_ADMIN_USERNAME = 'qa-user'
$env:ETS_QA_ADMIN_PASSWORD = 'temporary-test-value'
npm run qa -- smoke --base-url http://127.0.0.1:4173 --fixtures --authenticate --routes admin
```

Alternatively set `ETS_QA_AUTH_FILE` to a JSON file containing `username` and
`password`. A repository-local file must live under an ignored `.auth/` directory.
The CLI never records credential values, headers, or request bodies. Authenticated
smoke is fixture-only; it cannot submit a production login or any other production
write request.

The authenticated admin smoke also exercises view/query state, mail selection,
refresh, back/forward navigation, filtering, one-current-navigation semantics,
readable address-table sizing, and one confirmed fixture-only delete on every
selected viewport. It then checks the real create-address and read-only
access-package forms, including modal viewport fit, without submitting them. It also
confirms that the session is tab-scoped and exercises a confirmed, version-bound
credential reveal in the one-time result surface. The delete and credential reveal
are intercepted on loopback before either can reach a server; the runner verifies
the session header, CSPRNG request ID, explicit confirmation and displayed
credential version without recording their values. Its manifest records only method
and path; credentials, headers, and request bodies remain excluded.

Each run writes `output/qa/<timestamp>/manifest.json` plus relative screenshot
paths. The manifest records the product commit, target, selected viewports, checks,
failures, blocked writes, and privacy state.

On a live Cloudflare target, the runner also blocks same-origin
`POST /cdn-cgi/rum` Browser Insights telemetry and records it separately as platform
telemetry. Every other non-fixture write request still fails the smoke run.

## Output retention

`npm run qa -- inventory` classifies every output unit using active-document
references, age, and recency. It retains anything referenced by an active review,
anything from the last 14 days, and at least the five newest units. Run `prune` only
after `scripts/qa/output-inventory.json` has been reviewed and committed:

```powershell
npm run qa -- prune
```

The prune command refuses an untracked or modified inventory, rechecks every
candidate before deletion, and preserves the deletion ledger in the inventory.

## Migrated capabilities

| Old capability | Current disposition |
| --- | --- |
| Repeated viewport screenshots and overflow probes | One configurable smoke runner |
| Admin login and route probes | Loopback-only fixture authentication with write guard |
| Ad hoc screenshot metadata in logs | Per-run machine-readable manifest |
| Separate release/remediation scripts | Declarative routes and viewport selection |
| Persona script that read a local secret and changed live data | Deleted; production writes are outside QA scope |
| Unbounded `output/` accumulation | Committed inventory plus 5-run/14-day retention |
