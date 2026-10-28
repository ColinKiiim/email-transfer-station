# Current project state

Updated: 2026-10-18 (Asia/Singapore)

## Persistent credential policy correction — 2026-10-29

The sharing flow is being corrected to use persistent address and authenticator
credentials. No one-time display, automatic expiry, or automatic invalidation is
allowed in this repository; refresh and revoke remain explicit administrator
actions. Address creation again returns the durable address credential, and
share creation forces a null expiry. This correction is validated locally and
released in Pages source `4df8506` at
`https://54f34822.email-transfer-station.pages.dev`; Worker version
`52c803b5-6a8c-4f81-88d7-528f6dd848f7` is deployed to
`mail-api.20030405.xyz`. The direct Worker health check returned 200/`OK`.

## Issue backlog — 2026-10-28

Created [`ISSUES_TO_RESOLVE.md`](ISSUES_TO_RESOLVE.md). ISSUE-001 records the
analysis of the admin console sidebar showing “服务未知 / 版本未知”: the
labels are frontend fallbacks for missing or unread worker/database data, and
the green dot is currently fixed CSS rather than a live health result. ISSUE-002
through ISSUE-004 record the split authenticator/address distribution models,
the duplicate credential/share choices, and the address copy-button placement;
the current implementation now addresses those four items. ISSUE-005 through
ISSUE-007 record remaining user-center credential paths, legacy direct-authority
APIs, and historical access-package rows that were reviewed but intentionally
left for a separate migration decision. The runtime release is accepted:
Pages deployment `https://07c4ecc6.email-transfer-station.pages.dev` was
accepted for source `d32c5d1`, and Worker version
`9bed7c1d-724f-4a71-9c5e-1fedded96cfd` is deployed to
`mail-api.20030405.xyz`. Browser-level resource-flow confirmation remains a
follow-up.

## Public mailbox interaction cleanup — 2026-10-28

The public mailbox now has quiet automatic refresh in simple mode: background
refreshes do not emit success toasts, manual refreshes show a loading state, and
failed refreshes no longer report success. Empty mailbox responses also reset the
message count correctly. Login's default callback props no longer produce Vue
missing-prop warnings, and localized routes use explicit records so the router
starts without alias-parameter warnings.

Validation: focused `Login.test.js` (6 tests), frontend lint for the three
changed sources, `git diff --check`, a production frontend build, and a local
desktop/mobile browser smoke check with zero console warnings.

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

## Test surface reduction — 2026-10-06

Removed 22 redundant tests without archiving them: 14 frontend suites that
duplicated AdminNext/admin-flow/session or browser coverage, 2 Worker suites
duplicated by canonical admin route and session regressions, and 6 E2E suites
duplicated by Worker/API or browser smoke coverage. The tracked frontend test
surface is now 18 test files (from 34), Worker 24 (from 26), and E2E 25 (from
31). Security, authentication, migration, quota, mail-ingress, protocol, and
core mailbox smoke coverage remains. The standalone request-state test was
removed because `frontend/src/api/__tests__/settings.test.js` already exercises
the same concurrent loading contract.

The AgyCLI guide and UI checklist now require one smallest relevant check and
explicitly skip full-suite/repeated checks for styling, documentation, and other
low-risk changes. Existing user dirty work was not staged or modified. A final
small reduction also removed the admin view-model and ordinary mail-detail UI
tests because their behavior is exercised by the retained admin flow and
browser smoke coverage. This cleanup itself was validated with static reference
review and `git diff --check`; no full suite was run. Per the user's current
instruction, the follow-up remains local-only and is not pushed or deployed.

## Test surface reduction follow-up — 2026-10-06

A second local-only pass removed four E2E files whose checks were already owned by
Docker healthchecks or the trigger/admin browser flows. It also collapsed repeated
frontend assertions in the session, admin flow, mailbox workbench, and parser
checks; the retained tests now target credential teardown, security-sensitive
mail rendering, core admin actions, pagination, and accessibility. No push,
deployment, remote D1 migration, or full suite run was performed.

The remaining 18 frontend, 24 Worker, and 21 E2E test files are intentionally
layered by boundary. This follows mature repository practice: focused unit/API
projects are run independently, while browser and protocol checks remain separate
smoke layers. File count alone is not the optimization target.

## Admin Console UI modernization & Apple HIG split view — 2026-10-07

Eliminated the artificial 24px void gap between the sidebar and the main workspace
across all 9 admin views (`flow`, `addresses`, `domains`, `channels`, `users`,
`shares`, `authenticators`, `ops`, and `overview`). Replaced floating isolated card
panels with a seamless, edge-to-edge Apple HIG split-view architecture:
- Workspace surface seamlessly attaches to the sidebar's hairline divider (`1px solid var(--border)`).
- Topbar searchbox upgraded to a centered 44px pill (border-radius: 9999px) with
  Apple HIG focus ring, responsive width up to 660px, luminous focus-within elevation,
  and mono `⌘K` / `Ctrl+K` keycap badge.
- Standardized workspace toolbar across views to 48px height with flush bottom border,
  matching the mail flow header and aligning first/last table cells to the same 18px grid.
- Maintained local-only discipline: verified with frontend unit tests and production build;
  no push or deploy was executed.

## Shared admin toolbar controls — 2026-10-12

Extracted `AdminRefreshButton.vue` for the mail, resource, and authenticator
workspaces and `AdminDomainDropdown.vue` for the mail and address domain filters.
Refresh controls share the mail toolbar's transparent 28px Ghost style; the
duplicate refresh markup and CSS selectors are removed. Parents retain their
existing translations, count formatting, refresh handlers, and domain actions.
The dropdown owns its open state, outside-click/Escape handling, and listener
cleanup. No new dependency, API, credential, or database change is involved.

Validation: the focused toolbar component test file passed all 3 tests; all five
component sources in the commit passed Vue script/template compilation, and
repository whitespace checks passed. Delivery is a local commit only, as
explicitly requested; no push, release, deployment, or browser acceptance run.
Unrelated inherited changes remain in the working tree. Scope and exclusions
are recorded in [`plans/PLAN_2026-10-12_admin-toolbar-controls.md`](plans/PLAN_2026-10-12_admin-toolbar-controls.md).

## Inherited frontend polish review — 2026-10-13

The user authorized reviewing and committing all remaining appropriate local
changes after the shared toolbar refactor. Accepted changes finish expiry-based
admin code refresh with backoff and request coalescing, share-page visibility
and lifecycle handling, mailbox keyboard access, native selection state, mail
preview fallbacks, and the pending toolbar/table styling. Existing translations,
range semantics, unread filtering, and authored mail HTML rendering are retained.
Redundant health caching/reads and unsafe dark mail backgrounds were withdrawn.

Validation: all 8 focused pending-frontend regression tests passed, the production
frontend build succeeded, and Git whitespace checks passed. No full suite or
browser acceptance was run. The final local commit records these changes and
their regression tests.
The old draft and critique reports remain in ignored local UI-audit output,
while the reviewed scope is tracked in
[`plans/PLAN_2026-10-09_impeccable-frontend-polish.md`](plans/PLAN_2026-10-09_impeccable-frontend-polish.md).
This closes the inherited pending work noted on 2026-10-12. No push, release,
deployment, API change, database change, or secret change was performed.

## Authorized production delivery and incident handoff — 2026-10-13

The user subsequently authorized committing all appropriate pending work,
pushing main and deploying production, overriding the earlier local-only
delivery notes above. The local main backlog (18 commits at push time) was
pushed through `3a557f7`; this includes `a274ddf` shared admin controls and
`3a557f7` reviewed pending frontend reliability/keyboard work.

Canonical Immediate Pages release was run once for source
`3a557f7110afc55771c6f1beaaf687e60a1cd889`. The saved receipt status is ACCEPTED
and acceptance.passed is true. Deployment URL:
https://d96bef4c.email-transfer-station.pages.dev . Root/admin/settings/auth
acceptance and asset checks passed for all configured targets. CI run
38294511456 completed successfully for the same source. No remote database
migration, DNS change, secret rotation or second Pages deployment was performed.

The subsequent account Durable Objects quota alert was attributed by Cloudflare
namespace inventory/GraphQL to WANdrop PairRoom, not this product (which has no
DO namespace). Emergency product changes were made in D:/Develop/WANdrop and
released through 0.0.78. Their full ledger, latest still-high write counters and
explicit user pause are recorded in that workspace's
docs/evidence/2026-10-13-do-idle-write-incident.md and docs/CURRENT.md.

This final documentation correction records the already-completed release;
it does not trigger a new product release. The user requested pausing after
checks/recording and will arrange continuation in the WANdrop workspace.

## Server-side admin mail filters — 2026-10-18

The admin inbox domain, address, and unread filters only matched the 25 mails
already loaded (e.g. a domain filter showed 16 of 485 stored mails). The flow
view now sends `domain`/`address`/`unread` to `/api/admin/mails` on load, on
filter change, and for later pages, so counts and pages reflect the whole
store. The Worker accepts `unread=true`; the count query now uses the same
read-state join. The inbox unread badge keeps the last unfiltered count.
Free-text search and the attachment queue remain client-side over loaded rows
(list rows carry no attachment count).

Validation: frontend `admin-api` and `AdminNext` tests (17), Worker
`admin_api_routes` and `mail_read_state` tests (13), Worker typecheck, and
`git diff --check` passed.

Delivery: Worker version `531ba220-10f6-483f-ab64-ccb6fa1d2fc2` deployed; the
Immediate Pages release for `ff1ee97` (which also carries the `e69d3c6` HIG
review) was ACCEPTED at https://edd8eb85.email-transfer-station.pages.dev .
Live check on colin.fnrry.com: 280 matching mails (previously 16 of 485),
page 2 shows 26-50, and `status=unread` sends `unread=true` and shows 150. The
user now authorizes push plus Worker and Pages deployment by default.

## Admin HIG / Material review — 2026-10-18

Reviewed all nine admin views on the live console at desktop, 1024 px and
375 px, dark and light, against Apple HIG, Material 3 and WCAG AA. The per-page
issue list, basis, changes and open items are in
[`plans/PLAN_2026-10-18_admin-hig-review.md`](plans/PLAN_2026-10-18_admin-hig-review.md).

Changed (UI only; no API, data flow, permission or mail-filter code):

- the mail detail `删除` is a plain trash button that turns red on hover;
  checkbox and copy buttons get larger hit areas without visual change;
- `color-mix(in oklch)` → `in srgb` removes a pink cast on light-theme rows;
- 12 px minimum for sidebar group titles, table headers and row actions;
  group titles now meet 4.5:1;
- touch screens get 44 px targets; at ≤900 px the nav is one scrolling row,
  search spans the width, mail rows use two lines and the resource toolbar no
  longer clips its primary button;
- domain and access-package column widths fixed; dates and addresses stay on
  one line; empty channel tables no longer scroll sideways;
- the duplicate channel refresh button is removed; the authenticator empty
  state has an icon, description and create action;
- 62 admin strings rewritten to drop backend terms (`生产`, `raw_mails`,
  `Worker / D1`, `DB_VERSION`), dev-log tone and a false "shown once" claim;
  five test expectations follow the new copy.

Validation: Pages production build and `git diff --check` passed; CSS effects
were measured on the live page with the stylesheet injected locally in the
browser, and the edited sources render the local admin login. Before release,
the two affected frontend test files passed (38 tests) after their delete
button selector was updated (`ff1ee97`).

Delivery: the user authorized push and Pages release in this session. `main`
was pushed through `ff1ee97` (includes `7b3cd53` server-side mail filtering,
whose Worker was already deployed). One Immediate Pages release for source
`ff1ee978d2187e72063b4e73c2cf00be2f5feed6`: status ACCEPTED, acceptance
passed on all configured targets, deployment
https://4aebc8f1.email-transfer-station.pages.dev . No Worker deployment, D1
migration, DNS or secret change was part of this frontend release.

## Server-side admin search and attachment filter (D1 v0.0.20) — 2026-10-18

User-authorized D1 migration. `raw_mails` gains `subject` and
`attachment_count` (`db/2026-10-18-mail-summary.sql`), filled at ingest and
backfilled by `POST /api/admin/db_migration` (500 rows per call, repeat until
`mail_summary.remaining` is 0). `/api/admin/mails` accepts a Gmail-style `q`
(plain words match subject, envelope sender, or recipient; `from:`, `to:`,
`subject:`, `has:attachment`, `is:unread|read`, `after:`, `before:`),
`has_attachment=true`, and `unread=false`. The inbox sends search (debounced
300 ms) and read/attachment status to the server and no longer re-filters the
loaded page. `from:` matches the envelope sender, not the From display name;
body text is not searchable.

Delivery: production D1 exported first to the private archive
`D:/Develop/Email-Transfer-Station-archives/20261018-d1-before-v0.0.20/`
(33 MB, 485 mails). Worker `55d42c0d-a405-4f83-9deb-6b180aa79727` deployed, then
the migration ran through the admin API: v0.0.20, 485 summarized, 0 remaining,
3 mails with attachments. Pages `a5dcff7` released ACCEPTED at
https://bb588271.email-transfer-station.pages.dev after a fresh `pages` build
(the Immediate release uploads the existing `frontend/dist`; an earlier upload
of the stale bundle, a7a5d2b5, was superseded). Live: attachment filter 3,
`from:openai subject:登录` 2, typed `netcraft` 3 with one request.
Validation: Worker database/admin/ingest/read-state tests (30), frontend admin
tests (78), Worker typecheck and lint, frontend lint, `git diff --check`.

## Gmail-style inbox list and reader — 2026-10-18

Using the user's Gmail as the reference (layout only), the inbox counter now
reads "第 1-25 封，共 485 封" for the server-filtered view; the "已载 / 数据库总数"
wording is gone. List dates follow Gmail (time today, month-day this year,
full date before) in local time; stored UTC `created_at` values were previously
shown unconverted. The reader has an icon toolbar (back, delete, mark unread,
More with formatted/plain/original views), "第 N 封，共 M 封" with newer/older
arrows that keep the list page in step, a subject heading, a flat sender row
with address and relative time, and no status tags or "正文" heading. The
attachment chip set an unknown `attachments` status and did nothing; it now
uses `attachment`. The expanded sidebar shows the full unread count.

Delivery: `aab8fc8` released ACCEPTED at
https://69f85640.email-transfer-station.pages.dev after a fresh `pages` build.
Live at 1600 px: list counter and dates, reader toolbar, newer navigation
(8 → 7 of 485), and mark unread (returns to the list, badge 296 → 297) checked.
Validation: frontend lint and admin tests (78), `pages` build.

Follow-up `d9077df`: below 1100 px an open mail takes the whole page (the split
needed 844 px and overflowed), the split toggle is hidden, and Back scrolls the
list to the mail just read. The 1360/1120 px five-track grids, which never
applied, were removed. Released ACCEPTED at
https://9c75dd4f.email-transfer-station.pages.dev ; live at 800 px and 1000 px
the reader fills the page with no horizontal overflow and Back restores the
list with the row in view; 1400 px keeps the split view.
