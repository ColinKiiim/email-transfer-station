# Current project state

Updated: 2026-10-05 (Asia/Singapore)

## Maintainability refactor — WP1–WP7 complete

Decision: `REFACTOR_COMPLETE`. WP1, WP2, WP2S, WP3, WP4, WP5, WP6, and WP7
are complete. The refactor milestones were validated and committed locally;
the separately authorized GitHub synchronization is recorded below.

WP1 established real SQLite relationship tests and request-count baselines.
WP2 moved SQL definitions and retryable upgrade execution into `db/` and
`worker/src/database.ts`; the Worker migration tests passed and product commit
`971ec08` is an ancestor of the current root history.

WP2S promoted the product checkout to this repository root while preserving the
product Git history and the product remote:

- root Git: `D:/Develop/Email-Transfer-Station`
- root `main`: WP2S milestone commit `196cc18` (with WP1 `b5a3597` and WP2 `971ec08` as ancestors)
- `origin`: `https://github.com/ColinKiiim/email-transfer-station`
- private recovery archive: `D:/Develop/Email-Transfer-Station-archives/20261005-WP2S`

The archive contains verified governance and product bundles plus the previous
worktree registration record. It is recovery material only. It is outside the
product repository and is not a second development route.

The active tree now has one Git boundary. Product packages remain at the same
relative paths. `docs/CURRENT.md`, `docs/INDEX.md`, and the active plan are the
current maintenance records. `skills/` is the tracked source for reusable
maintenance Skills; the local `.agents/skills` link points to it when available.
QA is under `scripts/qa/`, and release readiness/receipts belong under ignored
`output/release/`.

WP2S validation completed:

- product history contains WP1 `b5a3597` and WP2 `971ec08`;
- both Git bundles were created and verified before the cutover;
- stale missing-path product worktree registrations were pruned;
- old nested-path references in active tools and active documents are absent;
- Worker lint, typecheck, 25 test files (100 passed, 2 WP3 todo), and dry-run
  build passed;
- frontend lint, typecheck, 33 test files (233 passed), production build, and
  Pages build passed;
- Pages check and middleware syntax check passed;
- mailbox Skill validation, its five contract tests, QA help, QA inventory, and
  root `git diff --check` passed;
- local milestone commit: `196cc18` (`refactor(repo): promote product to single
  root repository`);
- Worker/frontend/package behavior remains the WP2 implementation; no business
  or schema behavior was changed by the repository cutover.

WP4 is complete in local commit `4d24737`. Admin reads now follow the active
feature boundary: the authenticator view makes no snapshot reads, identity loads
only its domains, addresses, and users, and the remaining views request only
their required data. View changes refresh the selected feature without restoring
the full 20-read snapshot. Existing admin routes, dispatch, confirmation flows,
and component contracts remain intact. The two WP1 relationship todo tests
remain intentionally open and are not passing behavior claims.

WP5–WP7 are complete in the current local milestone. Mail parsing now belongs to
the email module, shared request loading is tracked by a small request-state
helper, and the admin mail workbench fetches later pages on demand through the
existing server `limit/offset` contract. The old 500-row preload helper and its
dead constant were removed after the runtime callers were migrated.

WP3 is complete in local commit `b295fa1`. Authenticator resources no longer use
`user_id=0`; `user_authenticator_access` keeps `direct_assigned` and nullable
`share_id` separately. The v0.0.18 migration converts legacy `assignment:` rows,
preserves real links and encrypted secrets, and the admin/user/open routes retain
their existing authorization boundaries. The former two WP3 todo cases are now
executable SQLite regressions; the remaining WP1 todo cases are unrelated.

## Product boundaries

Admin-managed authenticators remain administrator-created resources. Admins can
assign them directly to users or issue expiring/revocable share links. Users can
use assigned or saved entries and remove their own access; they cannot create
resources or issue links.

No production resource, remote database, DNS record, deployment, or secret was
changed by this local refactor.

## GitHub synchronization — 2026-10-05

The user authorized deleting the obsolete governance repository and synchronizing
the product remote. `ColinKiiim/email-transfer-station-workspace` was inspected
and deleted: it contained old governance/reference records, with no product
packages, issues, pull requests, releases, or workflows. The private recovery
archive outside this repository remains available.

The canonical product repository is `ColinKiiim/email-transfer-station`.
[PR #5](https://github.com/ColinKiiim/email-transfer-station/pull/5) is the
integration record for `origin/main`, retaining the local milestone history and
the existing required `validate` check. The user subsequently authorized removing
the local `upstream` remote; only the product `origin` remains configured.

CI follow-up commits are `c87b7d9` (EOF whitespace), `15d15d9` (canonical SQL
included in the E2E Worker image), and `10d96f6` (cross-container proxy bindings
and E2E contracts aligned with the current UI/API). Passkey remains archived in
the active UI; its browser test checks that contract, while backend tests remain.
Admin selection, confirmation, locale switching, and HTML sanitization checks
remain meaningful; no test was skipped to obtain a passing run.

Validation at code commit `10d96f6`:

- local frontend: 34 files / 235 tests passed;
- local E2E discovery: 129 tests in 31 files; Docker is unavailable on this host;
- [GitHub Actions run 37265210587](https://github.com/ColinKiiim/email-transfer-station/actions/runs/37265210587):
  `validate` and Docker E2E passed, with all 129 E2E tests executed;
- repository whitespace checks passed.

GitHub synchronization does not perform a deployment or remote D1 migration.
The v0.0.18 production migration remains separately authorized work with the
backup and compatibility requirements documented in `db/README.md`.

## AgyCLI operation guide — 2026-10-05

Added `docs/agy-cli-operation-guide.md` from the current WANdrop guide, linked
from `AGENTS.md` and `docs/INDEX.md`. Only repository paths, product references,
package validation commands, and the local QA URL were adapted. Plans use
`docs/plans/`; browser evidence uses ignored `output/ui-audits/`; product UI
decisions use `docs/UI_SPECIFICATION.md`. The delegation, permission, quota
recovery, staged execution, and browser acceptance flow is preserved.

Validation: reviewed the adaptation diff and document references;
`git diff --check` passed. This task only adds documentation; no AgyCLI session,
browser run, push, deployment, or remote D1 migration was performed.

## Administrator login persistence — 2026-10-05

Fixed the one-hour administrator login interruption locally. Password login now
creates an HttpOnly browser cookie backed by a revocable D1 session. The existing
one-hour `x-admin-auth` token renews automatically; reopening the same browser
restores it. Continued use rolls the browser session forward by 90 days, with
no deadline from the original login. Logout and administrator configuration
changes invalidate session-backed API tokens immediately. All sign-out surfaces
revoke the browser session before clearing local credentials. Network/server
failures and private-site password challenges do not clear administrator login.

The canonical schema now includes `admin_browser_sessions`; the current database
version is `v0.0.19`. From v0.0.18 the upgrade is additive and retryable. Earlier
authenticator migration compatibility requirements still apply. Details and
official Google/Microsoft references are in [`admin-sessions.md`](admin-sessions.md).

Validation:

- Worker suite: 26 files / 107 tests passed; the final session/migration subset
  passed 14 tests after the credential-invalidation checks were tightened;
- frontend session/API/admin integration: 4 files / 37 tests passed, including
  renewal concurrency, request-ID preservation, logout races, and loading states;
- Worker/frontend lint and typecheck, Worker dry-run build, frontend production
  and Pages builds, Pages middleware syntax, and `git diff --check` passed;
- no browser acceptance run, commit, push, deployment, or production D1 write
  was performed. One fresh password login after rollout establishes persistence
  for users of the former one-hour-only login.

## Ponytail validation and release policy — 2026-10-05

The repository workflow now uses the smallest necessary diff and the smallest
relevant check. Full-suite, repeated, unrelated, browser, E2E, and security
checks are not default work; they require an affected boundary or an explicit
request. The normal product path is one focused check, commit, push, and the
single Pages Immediate release command. That command retains live preflight,
one upload, and bounded acceptance. Prepare/Verify/Deferred is reserved for a
cross-task handoff. Every ordinary commit follows the default push and
production release path. Protected writes such as D1, DNS, credentials, deletion,
rollback, force-push, and non-production changes still require explicit
authorization.

The release audit found no need to remove the existing safety checks or replace
the release script. The avoidable cost was treating the full CI menu and the
Deferred path as every-release steps. WANdrop's push-triggered deployment and
bounded live check informed this shorter default without copying its workflow.
