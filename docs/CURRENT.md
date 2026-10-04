# Current project state

Updated: 2026-10-05 (Asia/Singapore)

## Maintainability refactor — paused after WP2S

Decision: `LOCAL_REFACTOR_PAUSED_AFTER_WP2S`. WP1, WP2, and WP2S are complete
locally. WP3–WP7 have not started. Wait for explicit user instruction before
continuing. No push, deployment, remote D1 migration, or subagents were used.

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

The next authorized phase is WP3: independent direct-assignment and saved-link
access sources, removal of `user_id=0` and `assignment:` semantics, and the
version-scoped authenticator migration checks described in the plan. The two
WP1 relationship todo tests remain intentionally open and are not passing
behavior claims.

## Product boundaries

Admin-managed authenticators remain administrator-created resources. Admins can
assign them directly to users or issue expiring/revocable share links. Users can
use assigned or saved entries and remove their own access; they cannot create
resources or issue links.

No production resource, remote database, DNS record, deployment, or secret was
changed by WP2S.
