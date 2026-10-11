# Shared admin toolbar controls

Date: 2026-10-12 (Asia/Singapore). Status: complete locally.

Implement Gemini's option B: extract the repeated refresh button and domain
dropdown into shared Vue components. Preserve the working tree's visible copy
and parent-owned business actions; use the existing mail Ghost refresh style
for all three workspaces. Delivery is a local commit, with no push or deployment.

- `AdminRefreshButton.vue`: supplied label, disabled state, and refresh event;
  used by mail, resource, and authenticator workspaces with one CSS rule set.
- `AdminDomainDropdown.vue`: supplied labels/counts/domain options and selection
  event; owns menu state, outside-click/Escape handling, and listener cleanup.
  Mail retains `formatNumber`; address counts retain their existing display.
- Existing pending resource/authenticator toolbar placement changes needed by
  these call sites and their existing toolbar translation definitions are
  included without rewriting copy. Pending mail selection/filter-order changes,
  authenticator polling changes, table-header styling, other translation edits,
  and other page work remain uncommitted and untouched.
- Validation: 3 focused component tests passed, covering refresh disabling,
  parent-provided labels/counts, domain callbacks, menu dismissal, and cleanup.
  All five component sources in the commit passed Vue script/template compilation.
  No full suite, browser matrix, screenshot review, or production build was run.
