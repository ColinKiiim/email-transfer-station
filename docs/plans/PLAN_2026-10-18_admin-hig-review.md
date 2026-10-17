# Admin HIG / Material 3 review

Date: 2026-10-18 (Asia/Singapore). Status: first pass released to Pages
(source `ff1ee97`, deployment https://4aebc8f1.email-transfer-station.pages.dev).

Basis: the live admin console (`/admin`, logged in) measured in the built-in
browser at 1366, 1024 and 375 px, dark and light. Checks covered target size
(Apple HIG 44 pt on touch / 28 pt pointer; M3 48 dp touch; WCAG 2.5.8 24 px),
text size, WCAG AA contrast, spacing/alignment, button hierarchy, empty states,
focus, theming, copy, and narrow screens. Builds on the 2026-10-07 to 10-13
split view, 48 px toolbar, and shared toolbar controls; nothing was rebuilt.

`Done` = changed in this pass. `Open` = recorded for a later pass.

## Global (shell, sidebar, tables, theme)

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| Light-theme hover/selected rows had a pink cast: `color-mix(in oklch, …, white)` resolves to a hueless colour that Chromium paints with hue 0 | HIG/M3 colour consistency; `--accent-soft` is blue | All 35 admin `color-mix(in oklch…)` → `in srgb` | Done |
| Sidebar group titles 11 px at 0.65 opacity measured 3.89:1 | WCAG 1.4.3 (4.5:1) | 12 px, full `--muted` | Done |
| Table headers 11 px CJK | HIG minimum legible size; M3 label-small is for Latin | 12 px for all `th` | Done |
| Row action pills 11.5 px | same | 12 px | Done |
| Sidebar footer showed `Worker / D1 …` and `DB_VERSION …` on every page | UI spec §5 (no backend terms) | `服务{状态}` / `版本 {v}` with new `admin.shell` keys | Done |
| Desktop controls are 28–36 px; fine for pointer, too small on touch | HIG 44 pt, M3 48 dp | `@media (pointer: coarse)` raises buttons, chips, nav, refresh, pager to 44 px; hides the `Ctrl+K` keycap | Done |
| `.empty-state-title` used undefined `var(--text)` | token consistency | `var(--fg)` | Done |
| Footer reads `未知` on views that do not load health data | honest status | needs the health value cached across views (data flow) | Open |
| Nav item `aria-label` hides the unread badge's label from assistive tech | WCAG 4.1.2 | move count into the accessible name | Open |

## Overview

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| Section titles `最近处理与审计流水`, `运行环境与系统规格`, `Cloudflare Workers, D1 & 边缘配置` | spec §5, plain language | `最近邮件`, `运行状态`, `服务、数据库与域名概况`; badge drops `DB_VERSION` | Done |
| `地址身份 0 个地址` while there are 34 addresses; `25 封邮件` is the loaded page, not the 485 total | data honesty | overview needs its own counts (data flow, out of scope) | Open |
| At 800 px the recipient column collapses to one character per line | readable tables | follow-up: nowrap/ellipsis for the overview table | Open |

## Inbox

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| Detail toolbar `删除` was a filled red button, the loudest control on the page | HIG: destructive toolbar actions are plain until confirmed; M3 uses a text/icon button with confirmation | Plain trash icon + label, red only on hover; existing confirm dialog kept | Done |
| Row checkbox 16×16 | WCAG 2.5.8, HIG | 40 px invisible hit area, visual unchanged | Done |
| Recipient copy button 18×18 | same | 32 px hit area, 18 px visual kept (spec §4.2) | Done |
| ≤900 px rows: subject squeezed to ~10 px, fixed 42 px height overflowed | M3 list item, Gmail mobile | two-line row: sender + time, then subject/preview; subject wins space | Done |
| Touch: sticky `:hover` swapped time for invisible row actions | HIG touch | `@media (hover: none)` keeps the time | Done |
| Back button uses a text `←` | icon consistency | chevron icon | Open |

## Addresses

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| ≤900 px: fixed 48 px toolbar wrapped and clipped `新增地址` | primary action must stay reachable | toolbar height auto on narrow screens | Done |
| Three different action styles per row (tinted, plain, menu) | M3 one emphasis per row | keep primary + overflow only | Open |

## Domains

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| Column widths summed to 120%; verification date truncated to `2026-06-…` while the one-button action column took 19% | alignment/readability | rebalanced to 100%, dates nowrap | Done |
| Header `Collector / 规则` mixes languages | copy consistency | needs a product term decision | Open |

## Channels

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| Toolbar had both the refresh icon and a `刷新通道` button for the same action | HIG: one control per action | removed the duplicate button | Done |
| Empty sender/sendbox tables scrolled sideways and clipped their empty message | M3 empty state | empty tables drop their min width | Done |
| `暂未执行生产写入` badge, long empty-state sentences | spec §5 | `未启用`, `暂无地址级发送权限`, `暂无发出的邮件` | Done |
| `TELEGRAM_BOT_TOKEN`, `Endpoint:` and API paths as row text | spec §5 | come from view-model data; rewrite with ops copy | Open |

## Users

No blocking issue. Role `-` placeholder could read `无角色` (Open).

## Access packages

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| Seven equal columns; addresses broke mid-word (`…colin.cmd.` / `gd`) | readability | proportional widths; addresses and dates one line with ellipsis | Done |
| `访问链接只显示一次` contradicts the table's copy button | spec §5.2 | `持有链接的人可查看此地址的邮件。` | Done |

## Authenticators

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| Empty state used the inbox icon, a bare `还没有验证器。`, no next step | HIG/M3 empty states explain and offer the action | lock icon, description, `创建` action | Done |

## System maintenance

| Issue | Basis | Change | State |
| --- | --- | --- | --- |
| `打开配置` / `检查迁移` look like actions but are plain text | affordance | make them links/buttons or drop the column | Open |
| Roadmap-style row notes (`需要在详情页暴露恢复动作`, `合并到策略中心`) | plain language | shortened to what the row covers | Done |
| Worker/D1/KV/bindings names | spec §5 vs. an ops page | decide whether ops may name infrastructure | Open |

## Copy review (redundant / AI-sounding text)

Rewrote 62 admin strings (zh + en) in `message-registry.ts`. Patterns removed:

- implementation terms: `生产` (production) in 16 toasts/confirmations,
  `raw_mails`, `管理员会话`, `写入合同`, `token`, `数据库总数`;
- dev-log / roadmap tone: `保存成功门禁未接入前仅显示配置状态`,
  `需要在详情页暴露恢复动作`, `暂未执行生产写入`, `运行总控入口`;
- explanatory filler: `邮件正文会在详情页通过安全渲染策略呈现`,
  `常规邮件、未知收件人和渲染风险归在同一条收件链路里`;
- contradictions: `只显示一次` for links that can be copied again;
- confirmations now state the result only: `删除 {count} 封{scope}？删除后无法恢复。`

Still open for a later copy pass (needs product decisions or touches the mail
filter work): range labels (`当前已载匹配`, `数据库总数`), `Collector / 规则`,
ops row details and infrastructure names, `signInBeforeAction` receiving the
English `mark read` label, and the rest of the product outside `/admin`.

## Validation

- `corepack pnpm run build:pages` passed after the final edit; `git diff --check` passed.
- Live page with the new CSS injected (no deployment): dark/light row hover
  is sRGB blue; 375 px nav band 236 → 60 px, workspace starts at 236 px
  instead of 360 px, mail subject 10 → 289 px, `新增地址` visible and
  hit-testable at 44 px; domain dates and all 20 access-package addresses fit
  at 1024 px; empty channel tables no longer scroll; checkbox and copy hit
  areas confirmed with `elementFromPoint`. Of the template changes only the
  delete button was simulated in the live DOM; the removed duplicate refresh,
  authenticator empty state and footer copy are covered by the build only.
- The browser pane was hidden during the session, so pane screenshots were
  stale and are not used as evidence; the measurements above are.
- Local dev server renders the admin login with the edited sources. Signed-in
  local preview is not possible without entering the production admin
  credential, which was not done.
- Five test expectations follow the new copy and the delete button selector
  follows its new class (`ff1ee97`). Before release,
  `admin-console-actions.test.js` and `AdminNext.test.js` passed (38 tests);
  the e2e spec was not run.
