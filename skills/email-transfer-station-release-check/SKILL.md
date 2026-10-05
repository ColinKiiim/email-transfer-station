---
name: email-transfer-station-release-check
description: Prepare, verify, preflight, and run Immediate or Deferred Cloudflare Pages releases for Email Transfer Station. Use for the default product release path, Pages readiness, exact prepared-artifact verification, or Cloudflare Pages preflight; ordinary Worker, frontend, E2E, and documentation development does not trigger it. This skill never grants authority for protected remote writes.
---

# Email Transfer Station release check

## Scope and route

- Complete ordinary implementation, the smallest required validation, and the
  local candidate commit under `AGENTS.md` before invoking this release Skill.
  Never reopen development inside a release action.
- **IMMEDIATE RELEASE:** default when the same development task just finished
  proportionate required checks, committed clean product `main`, prepared
  `frontend/dist`, and made no later source or dist change. Use the canonical
  product root directly; do not create a worktree or readiness manifest.
- **DEFERRED RELEASE:** use across tasks, days, or handoffs. Require the retained
  candidate and readiness manifest under `output/release/readiness/`. Read
  this Skill and the manifest only; a mismatch is `RELEASE_NOT_READY`, never an
  invitation to reopen development inside the release turn.

## Authorization

The repository default authorizes push and the ordinary production release for
every ordinary commit. An explicit local-only, no-push, or no-deploy
instruction overrides it. D1 migrations, DNS/domain changes, secret or
credential rotation, destructive remote actions, rollback, force-push, and
non-production writes still require explicit authorization. Check current
platform documentation only when changing this workflow, after a CLI/API
incompatibility, or when the user asks—not for a routine release.

## Secrets

Never print, log, commit, or copy credential values, runtime env files, mailbox contents, plaintext backups, or private keys. Report only key names, counts, or sanitized present/missing status. Keep `.env*`, real Wrangler config, `.wrangler/`, local browser auth state, and private runtime files untracked.

## Deferred readiness

After the smallest required development check passes, finish the local
candidate commit. For a later deferred release, retain its prepared
`frontend/dist` and installed Pages Wrangler, then stamp exact-tree readiness:

```powershell
pwsh -NoProfile -File skills/email-transfer-station-release-check/scripts/pages-release.ps1 `
  -Action Prepare `
  -ProductRoot <isolated-candidate> `
  -ManifestPath output/release/readiness/<head>.json `
  -ValidationEvidence 'focused tests pass','build:pages pass','browser QA pass'
```

Add `-EnvironmentSmokeRequired -EnvironmentSmokeEvidence '<concise evidence>'`
only when hash equivalence cannot cover an environment-sensitive behavior. The
script binds the clean Git HEAD/tree/base, Pages config, Functions, complete
prepared dist fingerprint, entry asset hash, and concise evidence. Keep the
candidate and ignored manifest until the deployment decision.

## Immediate release

Use one command; do not prepare or verify a manifest, create/copy a worktree,
copy dist, create a dependency junction, or handwrite evidence:

```powershell
pwsh -NoProfile -File skills/email-transfer-station-release-check/scripts/pages-release.ps1 `
  -Action Immediate -ConfirmDevelopmentValidated -AuthorizeDeploy
```

The confirmation asserts that this same task completed proportionate validation
and the prepared dist still belongs to the current clean canonical `main`. The
script snapshots HEAD/tree, complete dist, Pages config/Functions and prepared
Wrangler; performs the one live auth/project/authoritative production branch/
BACKEND/rollback preflight; rechecks the snapshot; attempts one upload; and
runs bounded GET/hash acceptance against the deployment, canonical, and custom
domains. It always writes a sanitized acceptance receipt under
  `output/release/receipts/` after a successful upload. Dry-run only accepts
a sanitized private fixture and reports upload attempts `0`.

## Deferred release

Do not install, test, build, rebuild, run browser matrices, create/clean a
worktree, rewrite credentials, or repair the workflow. If local verification
or live preflight needs broad investigation, stop before upload.

1. Verify without installing, testing, or building:

   ```powershell
   pwsh -NoProfile -File skills/email-transfer-station-release-check/scripts/pages-release.ps1 -Action Verify -ManifestPath <manifest>
   ```

2. With the repository's ordinary release authorization, run `Deploy -AuthorizeDeploy`.
   The action re-verifies locally, performs one secure live auth/project/
   metadata-authoritative `production_branch`/`BACKEND`/rollback preflight, then
   runs exactly one `wrangler pages deploy ../frontend/dist` from `pages/`,
   followed by the same bounded acceptance and receipt used by Immediate.
   Never run standalone `Preflight` first when proceeding to `Deploy`, because
   `Deploy` already performs the one live preflight. Never retry an upload.
3. For workflow validation only, use `Deploy -DryRun` with a sanitized
   `-PreflightFixturePath`; it performs no upload. Use standalone `Preflight`
   only for a read-only diagnosis that will not deploy in the same turn.
4. The release succeeds only after the script confirms `/`, `/admin`,
   `/open_api/settings`, unauthenticated `/api/admin/overview` (`401
   text/plain`), and the exact prepared entry asset on every discovered target.
   Only add one recorded environment-sensitive smoke when the deferred manifest
   requires it or exact asset equivalence cannot cover the change.

The script reads the private credential source only in its own process and
passes credentials only to its direct Wrangler child. It emits no secret values
or account inventories, never hard-codes the production branch, never builds,
never cleans candidates, and never falls back to development.

## Handoff

Update the active plan and `docs/CURRENT.md` once at delivery when material
work needs a durable record. A routine immediate release needs no governance
edit or commit; retain its receipt and Cloudflare/Git history. Record only
exceptions or workflow changes. Report actual commands, failures/skips, exact
commit/artifact, upload count, and authorization boundary. Never describe
unpushed or undeployed work as released.
