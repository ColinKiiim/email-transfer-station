# ETS Mail UI 规范（以 Apple HIG 为准）

> 更新：2026-11-08。设计依据是 Apple Human Interface Guidelines（Layout、Typography、Color、Dark Mode、Buttons、Toolbars、Sidebars、Lists and tables、Sheets、Alerts、Feedback、Loading、Accessibility、Writing）。本文件只记录本产品落地后的约定；与 HIG 冲突时以 HIG 为准并同步修改本文件。

## 1. 一套外壳，四个入口

所有登录后的界面都用同一个外壳 `frontend/src/components/AppShell.vue`（样式 `frontend/src/styles/app-shell.css`）：

| 入口 | 用法 |
| --- | --- |
| 管理后台 `/admin` | `AdminConsoleShell.vue` 包一层 AppShell，搜索框放在顶栏 |
| 用户工作台 `/user` | 侧边栏分组「邮件 / 账户」，当前账户放在侧边栏底部 |
| 地址邮箱（首页登录地址后）`/` | 侧边栏分组「邮件 / 设置」，地址切换器放在顶栏 |
| 共享收件箱 `/i/:token` | 无侧边栏，标题旁显示「只读」 |

- 顶栏 52px：左侧为侧边栏开关 + 品牌；中间为可选搜索；右侧依次是产品入口、设置齿轮、分隔线、主操作（带边框的「同步」）、「退出」（悬停才显危险色）。
- 侧边栏最多两级（分组标题 → 项目）。选中项用浅蓝底 + 蓝色图标，不用描边卡片。有指针时可折叠为图标栏；≤900px 变成抽屉，带遮罩，Esc 或点选后关闭。≤640px 时搜索框移到顶栏第二行。
- 内容放在工作区卡片里。非收件箱页面用 `.shell-toolbar`（48px 标题栏）+ `.shell-page`（内容区，表单类页面加 `.shell-page-narrow` 限宽）。
- 不要再为某个入口单独写一套顶栏或侧边栏；要改外壳，改 AppShell。

## 2. 设计令牌

全部在 `frontend/src/styles/tokens.css`，Naive UI 通过 `styles/naive-theme.js` 同步同一组值。组件里不写死颜色和字号。

- **颜色**：强调色是 systemBlue（浅色 `#007aff`、深色 `#0a84ff`），背景和文字用中性系统灰。语义色用可读变体，正文对比度 ≥ 4.5:1，粗体 ≥ 3:1。同一种颜色只表达一种含义。
- **字体**：系统字体优先（`-apple-system` / SF Pro，再到 PingFang、Segoe UI、雅黑）。只用 Regular / Medium / Semibold / Bold，不用细体。
- **字号**：用 `--text-*` 阶梯（Large Title、Title 1–3、Headline、Body、Callout、Subheadline、Footnote、Caption）。有指针时参照 macOS 内置样式（正文 14px），触控时切换到 iOS Dynamic Type 默认值（正文 16px，避免 iOS 输入框放大）。任何文字不小于 11px。
- **控件**：`--ets-control-sm/--ets-control/--ets-control-lg` 有指针时为 28/32/40px，触控时为 36/44/48px。触控点击区域不小于 44×44。
- **间距与圆角**：4pt 网格（`--ets-space-*`），控件圆角 8px，卡片 12px。
- **焦点**：全站统一的 `:focus-visible` 蓝色描边，不要去掉。

## 3. 收件箱（三个入口共用一套模式）

管理后台用 `AdminMailWorkspace.vue`；用户工作台、地址邮箱、共享收件箱用 `AccessMailWorkbench.vue`。两者外观和交互一致：

- **一行工具栏（48px）**：多选、刷新、范围筛选（地址/域名）、未读、搜索；右侧是自动同步和分页（「第 1-20 封，共 N 封」+ 上一页/下一页）。多选时整行换成批量操作。
- **先看列表**：进入时不自动打开邮件。点开后变成「列表 + 阅读器」分栏，阅读器工具栏有返回、标为未读、删除、位置（第 n 封）和上一封/下一封；Esc 返回列表。手机上列表和阅读器是两个页面。
- **行样式**（Apple Mail）：未读是蓝点 + 半粗体（600），已读恢复常规字重；不对已读行做淡化，也不给未读行加底色。悬停时右侧时间换成快捷操作。分栏时行变成三行（发件人+时间 / 主题 / 摘要）。↑/↓ 在行间移动，Enter/空格打开。
- **发件人卡片**：圆形首字母头像、发件人、完整地址、时间（含相对时间）、「发送至 …」+ 复制。

## 4. 邮件正文

发件人写的 HTML 始终画在独立的浅色「信纸」上（`--ets-mail-canvas`，带内边距和 10px 圆角），保证发件人自带的文字颜色可读。深色模式只把信纸调柔（`#ececee`），不反转邮件颜色。纯文本邮件和 iframe 模式用同一张信纸。

## 5. 加载、空状态与反馈

- 首次加载完成前不显示空状态（`isLoaded`）；加载中用和最终形状一致的骨架，不用全屏遮罩。
- 空状态说明下一步能做什么（HIG Writing: "Provide clear next steps on any blank screens"）。
- 删除等破坏性操作用确认；常规、可撤销的操作不弹确认。

## 6. 文案

- 界面上不出现后端实现词汇（D1、KV、Worker、JWT、HS256、哈希、写入数据库等），改用产品用语：JWT/Token → 登录凭证、访问凭证或登录链接；写入 D1 → 保存地址、创建地址。
- 不用开发或调试口吻；提示直接说结果和下一步；确认弹窗简短（「确认创建 {address}？」）。
- 文案与系统真实能力一致：凭证可以随时查看，不能写「只显示一次」。
- 所有用户可见文本都在 `frontend/src/i18n/message-registry.ts` 注册中英文，不渲染原始 key。

## 7. 交付前自检

- [ ] 改的是共用组件（AppShell / tokens / 收件箱），没有为单个入口另写一套。
- [ ] 浅色、深色都截图看过；手机宽度（390px）看过抽屉和列表→阅读器流程。
- [ ] 没有写死颜色、字号；触控点击区域 ≥ 44px；文字 ≥ 11px。
- [ ] 首次加载不闪空状态；深色模式下没有刺眼的纯白块。
- [ ] 文案没有内部技术词，没有未翻译 key。
- [ ] 按 `AGENTS.md` 只运行受影响的最小检查；`corepack pnpm run build:pages` 通过。
