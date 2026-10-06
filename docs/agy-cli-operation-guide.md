# AgyCLI 操作规范

适用：用户明确选择由 Codex 委派 AgyCLI 的开发、修复和 UI 验证任务。

Codex 与 Antigravity 独立在本地串行开发时，统一遵循 `AGENTS.md` 的
仓库规则和 `docs/CURRENT.md`，不自动建立主从关系，也不要求启动
AgyCLI。下文的 Codex/Agy 分工、模型和浏览器操作仅适用于委派流程；
命令、工具路径与可用模型在实际调用前验证，不视为永久环境事实。

## 流程

~~~text
检查状态 → 映射真实源码 → 单一 Task → 等待结束
→ 检查 diff/验证 → 通过后进入下一项 → 按阶段提交 → 按规则发布
~~~

- Agy 可以改代码、跑测试，也可以按需通过 chrome-devtools-mcp 或自身浏览器完成截图、视觉、响应式和交互验收。
- 主 Agent/Codex 负责限定范围、审查证据并引导下一步，不要求亲自完成所有浏览器操作。
- Agy 的截图、几何数据和原因说明可以作为验收证据；没有实际证据时，不要把“已完成”当作通过。

## 启动与调用

~~~powershell
$agyExe = (Get-Command agy -ErrorAction Stop).Source
& $agyExe --version
& $agyExe --help
& $agyExe models
~~~

从 agy models 选择当前可用的 Gemini Flash high 模型，使用 --effort high。模型版本不要永久写死。

### 无头权限预检（写入任务必做）

- 必须先完成上面的 `--version`、`--help` 和 `models` 预检，再启动任何无头写入回合；不要把“命令需要审批”留到实现过程中才发现。
- 用户已经明确授权本地仓库写入，且任务明确禁止生产写操作、密钥读取、Git push/deploy 时，首次 `--mode accept-edits` 调用就使用 `--dangerously-skip-permissions`，并同时传入精确 `--add-dir`、文件 allowlist、禁止项和同步验证停止条件。
- 用户未授权危险模式时，使用交互审批；如果无头回合收到 command permission 拒绝，立即把该回合标记为未开始，检查 `git status`，不要把“会话已启动”或另一轮摘要当作实现证据。
- 危险模式只跳过本地命令逐项审批，不扩大目录、文件、生产、凭据或 Git 权限；完成后仍必须审查实际 diff 和测试结果。

~~~powershell
$model = 'gemini-3.7-flash-high'
Set-Location -LiteralPath 'D:\Develop\Email-Transfer-Station'
$repo = (Resolve-Path .).Path
$prompt = @'
只执行一个原子任务：Phase X / Task Y。
先检查当前真实源码和调用链，不要按过期计划路径猜文件。
允许修改：file 1、file 2。
禁止修改：其他文件、协议/API/安全逻辑、Git 历史和受保护的未授权
push/merge/deploy；普通产品变更按 `AGENTS.md` 的默认提交、推送和发布规则执行。
契约不一致或问题已不存在时，停止并报告，不要伪造 API、Token 或行为。
保持现有协议、客户端兼容、编码和无障碍行为；完成后报告实际文件和验证结果。
'@

& $agyExe --model $model --effort high --mode accept-edits --output-format json --print-timeout 20m --add-dir $repo --print "$prompt"
~~~

- 只读审计或浏览器验收使用 --mode plan；代码修改使用 --mode accept-edits。
- --print 必须绑定 prompt，建议放在参数末尾；多行 prompt 用 here-string 后交给 --print 或 stdin。
- 用户明确授权时，Codex 可以代用户审批 Agy 的本地命令请求；审批不等于扩大 Task 范围，仍按 allowlist、非目标和停止条件执行。

## Codex 代审与危险模式

- `--dangerously-skip-permissions` 只有在用户明确授权后才能使用；授权后可用于本地只读审计、截图和验证，仍必须限制 `--add-dir`、禁止生产写操作、禁止读取或输出密码/Token。
- 只读审计仍使用 `--mode plan`。危险模式只跳过逐命令审批，不改变“只读、不修复、不提交、不推送、不部署”的任务契约。

~~~powershell
& $agyExe --model $model --effort high --mode plan --dangerously-skip-permissions `
  --add-dir $repo --print-timeout 20m --print "$prompt"
~~~

- 若用户未明确授权危险模式，使用交互模式逐项审批；遇到写文件、生产访问、凭据读取或超出 allowlist 的请求，选择拒绝并报告。

### Agy 自有 UI 规范 Skill

- Agy 的 UI 判断、视觉取舍和浏览器验收由 Agy 自己完成；Agy 工作流禁止加载或使用 Codex 侧的 UI/设计 skill。
- 当前 Agy 运行时的 Apple 参考 skill 准确名称是 `apple-hig`，路径为 `C:\Users\ColA\.gemini\config\skills\apple-hig\SKILL.md`。这是 Agy 环境文件，不要复制到仓库，也不要在输出中展开其全部内容。
- UI 任务开始时直接要求 Agy 加载 `apple-hig`；只有该路径失效时才允许检索一次准确名称和用法，并把修正后的结果记录回本文档。后续默认复用该名称，不要每次重复搜索。
- `apple-hig` 只补充 Apple 平台的触控靶心、移动端输入字号、安全区、模态焦点/ESC 和减弱动效等平台规范；产品行为、协议边界和 UI 决策仍以本仓库的 `AGENTS.md`、`docs/CURRENT.md` 和 `docs/UI_SPECIFICATION.md` 为准。

### Agy 容量或额度恢复

- Agy 返回 429、503 无容量、明确额度上限或因容量中断时，先记录 `conversation_id`、阶段和工作区状态；不要并行启动重复写作者，不要丢弃可能已落盘的计划、代码或证据。
- 只有 Agy 实际返回额度上限且带明确恢复时间时，Codex 才在该时间之后约 5 分钟创建当前线程的一次性唤醒；恢复时间未知时不要猜测，也不要创建提前探测任务。唤醒后先删除自身任务，再优先继续原 Agy 对话；原对话不可续接时才使用相同范围的新回合。
- 创建恢复唤醒前必须显式处理时区：当前自动化调度器的规则按 UTC 解释，不能把新加坡时间的小时数直接填入规则。先用带 `+08:00` 的目标时间加 5 分钟，再转换为 UTC 后创建；创建后核对返回的计划时间，唤醒时再以 `current_time_iso` 复核，避免出现“预计 02:46、实际 10:46”的偏移。
- 额度判定不能只看单一 Agy 对话的外层结果：先分开记录 Agy 的 response 正文与 CLI 外层 status/error；若正文已完成但外层返回 quota error，必须用一个新的、独立且只读的 Agy 对话做容量复核，禁止让第二个对话并行写代码。只有第二个对话也明确报额度上限/恢复时间，或有可靠的服务端状态确认后，才安排恢复唤醒；若复核可继续，则取消不必要的自动化并继续原工作流。
- 每次唤醒只处理一个阶段，仍遵守文件 allowlist、截图归档路径和只读/可写边界；重复失败时顺延下一次，不制造自动化或 Agy 会话堆积。

## 委派前

先检查 Git status/HEAD、已有脏文件、计划路径和真实调用链。计划是目标清单，不一定是当前源码地图。一个 Task 只给文件 allowlist、非目标和停止条件；保留所有既有改动，禁止 reset、clean、stash、覆盖。

## 验收

至少检查：

~~~powershell
git status --short --branch
git diff --check
git diff --stat
git diff -- <allowlist>
~~~

按风险只运行一个最小相关检查：优先受影响模块的单文件/单用例测试；没有行为变化时只做 `git diff --check`。不要默认运行全量 Vitest、全包 lint/typecheck/build 或重复检查。UI 任务可让 Agy 自己打开浏览器/MCP，并要求报告视口、截图、关键元素几何、溢出、交互结果和未验证项；无法进入目标状态就报告 BLOCKED，不要伪造 PASS。

## 异常

- 空响应、权限拒绝：不算完成，先检查工作树。
- timeout waiting for response：不直接判定成败，检查落盘 diff、文件完整性和验证结果。
- 半写入、整文件重写、BOM/换行变化：拒绝提交，发窄范围修复请求。
- 长时间无输出：先等待，不重复启动；会话结束后再检查状态。

## 阶段化 UI 修复

- 复杂 UI 修复先由 Agy 在 `docs/plans/` 下创建一个唯一的、可续接的阶段计划；计划必须区分真实功能门禁、视觉修复和浏览器证据，不把 DOM 预置状态写成真实功能通过。
- 每次只派发一个 Phase。Agy 完成实现后，使用同一或新的 Agy 对话回合自行运行最小测试、启动本地页面、交互并截图验收；Codex 主要负责发提示词、检查 allowlist、检查计划状态和修正文档小错误。
- Codex 可以修正 Agy 生成的 Markdown/计划/报告中的明显路径、链接、版本示例、状态或表述错误；这不等于 Codex 对 UI 做视觉裁决。产品 UI 代码仍由 Agy 按自己的 `apple-hig` 和仓库设计契约修改。
- 发现这类文档小错误时，修改前必须在当前进度中逐项说明具体文件、错误内容、实际目标和修正原因；不能只笼统说“发现几处小错误”。说明后直接应用最小补丁，并在修改后复核路径、链接或状态确已正确。
- 阶段完成后再进入下一阶段；若一个阶段的真实功能门禁 BLOCKED，不得用静态截图绕过，先在计划中记录阻塞原因和最小后续条件。

## 提交与发布

- 独立验证通过后按稳定阶段提交，不必每个 Task 一个 commit。
- 只 stage 明确 allowlist，禁止 git add .；提交前检查 staged diff。
- 版本号、push、GitHub Actions 部署和 Cloudflare 变更遵循本仓库 AGENTS.md；未授权不扩大到 DNS、密钥、协议或数据存储。
- 发布必须核对远端状态、部署回执和线上只读结果；失败只能如实记录。

## MCP

~~~powershell
& $agyExe mcp list
& $agyExe mcp enable chrome-devtools-mcp   # 仅在需要时
~~~

启用前记录原配置，完成后恢复临时配置。浏览器任务禁止生产写操作和读取密码/Token；无会话或 fixture 时报告阻塞原因。

### 只读 UI 截图验收

- 先让 Agy 自检可用的内置 Browser Subagent/`/browser`、`chrome-devtools-mcp` 或其他浏览器工具，选择能打开本地页面并保存截图的路径；不要让 Codex 代替 Agy 截图。选定工具后保持稳定循环：读取页面状态 → 交互 → 最新状态 → `take_screenshot`。
- 若使用 `chrome-devtools-mcp`，稳定循环是：`list_pages` → `take_snapshot` → `click`/`fill`/`press_key` → 最新 `take_snapshot` → `take_screenshot`；若使用内置浏览器，按其自身文档执行等价步骤，不要为了统一工具重复配置 MCP。
- 验收证据统一落盘到仓库内的 `output/ui-audits/<YYYY-MM-DD>/`，包括截图、快照、录像和审计报告；不要散落到 `$env:TEMP` 或其他硬盘目录。目录不存在时只创建这个证据目录，不要写入 `frontend/public/`、`frontend/src/`、`worker/src/`、`.wrangler/` 或 `.playwright-cli/`。每个稳定页面/状态只截一张，记录 `pageId`、viewport、动作链和仓库相对路径。
- 用 `emulate` 的 `viewport` 或 `resize_page` 依次覆盖默认桌面、窄桌面和移动尺寸；改尺寸或点击后必须重新 `take_snapshot`，不能复用旧 UID。
- 当前 MCP 若配置了 `--browser-url=http://127.0.0.1:9222`，它只连接已有的可调试 Chrome，不会自动启动浏览器。先 `list_pages` 复用现有页面；端口已占用时不要反复启动第二个 Chrome，无法连接就报告 BLOCKED。
- 若必须启动独立调试浏览器，使用临时 `user-data-dir`/隔离 profile，确认没有普通登录态；不要接管用户正在浏览的敏感页面。

~~~text
$evidenceDir = Join-Path $repo 'output\\ui-audits\\2026-09-16'
New-Item -ItemType Directory -Force -Path $evidenceDir
list_pages
new_page "http://127.0.0.1:4173/"
take_snapshot <pageId>
take_screenshot <pageId> --filePath "$evidenceDir\\P01.png"
~~~
