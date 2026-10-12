# Frontend polish review and local delivery

Status: completed locally; no push, release, or deployment
Updated: 2026-10-13 (Asia/Singapore)

## Scope

Review and commit the inherited frontend changes after the shared admin toolbar
refactor. Preserve existing visible copy, API boundaries, and mail rendering.
The original draft and critique reports are preserved under ignored
`output/ui-audits/impeccable-pending-20261013/`; their historical screenshot and
review claims are not validation evidence for this delivery.

## Accepted changes

- Admin authenticator codes refresh at expiry, pause while hidden, retain rows
  on request failure, and retry with bounded backoff. All code reads share the
  in-flight request; unmounting cannot restart the timer.
- Authenticator share pages update their clock on foreground return, coalesce
  refresh requests, and dispose listeners and timers even during initial load.
- Inbox and sent-mail rows support Enter/Space activation, arrow-key focus,
  visible focus rings, and button-compatible pressed state. Child controls
  retain their own keyboard handling.
- Admin mail selection uses a native checkbox and keeps checked/indeterminate
  state synchronized, including clearing selections from other pages.
- Mail preview cleanup removes leftover invisible entities before choosing a
  text/HTML/raw fallback, without consuming ordinary entity-like text.
- Retain toolbar sizing/alignment, theme-aware hover/loading styling, preview
  contrast, background selection cues, and resource table density changes.
  The unread filter remains available and action headings remain accessible.

## Changes rejected during review

- Extra health-status caching and Worker configuration reads: existing snapshots
  already retain state across unrelated views.
- Dark backgrounds for arbitrary mail HTML: authored black text can become
  unreadable; keep the existing mail paper and sanitization contract.
- Translation and range-label edits: preserve existing copy and the distinction
  between loaded matches and the database total.

## Validation and delivery

All 8 focused regression tests passed, covering refresh expiry/backoff, concurrent requests,
unmount cleanup, preview fallbacks, keyboard handling, and native selection.
The frontend production build and Git whitespace checks also passed.
No full suite, browser acceptance, Worker tests, or remote write is included.
Delivery is one local follow-up commit; `docs/CURRENT.md` records its outcome.
