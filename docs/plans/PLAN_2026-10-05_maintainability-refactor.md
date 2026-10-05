# Email Transfer Station 可维护性重构实施规划

Status: completed
Updated: 2026-10-05 (Asia/Singapore)
Product baseline: `main@4175b2a86299e303ec31b1e0c6c501c1ac38db69`
Continuation baseline: `main@196cc18` (WP2S milestone; WP1 `b5a3597` and WP2 `971ec08` are ancestors)
Revision: 2026-10-05，按用户新决定改为根目录单仓库；参考 WANdrop 的一份源码、多部署环境方案。
Execution: WP1、WP2、WP2S、WP3、WP4、WP5、WP6、WP7 已完成并本地提交；用户随后授权删除旧 workspace 远端并同步产品仓库。部署、远程 D1 迁移与子代理仍不在授权范围内。

## 1. 目标、范围与约束

目标：让功能变更主要发生在所属模块内，减少全量加载、巨大状态对象和隐含数据约定。
完成标准是职责与依赖收敛，不以目录数量、文件行数或未经测量的提速比例验收。

- 保留 Vue、Hono、Workers、Pages、D1 及现有独立包边界。
- 保留已确定的产品逻辑：admin 管理 TOTP 条目，分配给 user 或通过链接分发；user 使用收到或保存的条目。
- 本轮不扩展为用户名/密码保险库，不增加本站登录 MFA，也不添加用户已拒绝的使用提醒。
- 保留既有 API 路径、角色管理员入口、邮箱凭证版本、分享到期/撤销、写入确认、审计和会话清理。
- 当前状态：`D:/Develop/Email-Transfer-Station/` 是唯一产品/Git 根目录；私有治理材料和旧双仓库历史已归档到仓库外的恢复目录。
- 单仓库继续沿用产品提交历史与产品远端；旧治理历史及私人材料做一次性外部归档，不把整个历史合并到公开分支。
- 最终维护说明、CURRENT、INDEX 和本规划的公开适用版本放到根目录 `docs/`；日志、邮件截图、参考 checkout、运行配置和认证状态不混入公开源码。当前 `references/` 仍只读。
- 按 ponytail：复用实际已有能力，只抽取有真实调用者的职责；不引入通用资源引擎、ORM、事件总线、微服务或全仓语言迁移。
- 每个工作包可以包含多个小提交；用户当前要求分阶段复核。完成获授权的阶段后暂停，等待下一阶段指令；阶段内部不在每次拆文件或提交前重复询问。
- 推送、部署、远程 D1 迁移等外部变更按当前任务单独授权；历史上线授权不沿用到本次重构。
- 默认单个执行对话；未获明确授权不启动子代理。并行读取和独立检查不受此限制。

## 2. 审查证据与已知限制

以下均为上述基线的静态源码审查，不代表本次运行过测试或重新验证线上。
路径在本节相对于产品目录；执行时检查调用者和实际行为，不能只按旧行号编辑。

本节保留最初审查快照。WP1/WP2 已补真实数据库测试，并将 SQL 收敛到 `db/` 与
`worker/src/database.ts`；旧 `db_api.ts` 重复 DDL 已移除。不能依据下面的旧快照重做已完成工作。
当前完成与待办以第 7 节、源码和 `db/README.md` 为准；测试结果来自执行记录，本次规划没有重跑它们。

| 位置 | 当前证据 | 重构方向 |
| --- | --- | --- |
| `frontend/src/views/AdminNext.vue:279`、`admin/admin-api.js:201` | 同一加载入口包含 20 项读取，并补取邮件至最多 500 封 | 按功能加载；概览使用统计及有限最近记录 |
| `AdminNext.vue:876`、`admin-console-actions.js:10` | 巨大 model/actions 和 1,379 行跨功能动作集合 | 功能自己持有状态、动作、表单和专属浮层 |
| `worker/src/authenticators.ts:71,130` | 保存链接覆盖访问来源；已有链接访问时直接分配会提前返回；使用 `assignment:` 假分享记录 | 显式表达直接分配与保存链接两种来源 |
| `worker/src/authenticators.ts:102` | 管理员创建资源填写 `user_id=0` | 资源独立于接收用户，不依赖哨兵所有者 |
| `db/2026-10-04-authenticators.sql:3`、`db/schema.sql:195`、`worker/src/admin_api/db_api.ts:224` | 独立 SQL 与运行时定义的外键不同 | 初始化与迁移采用同一权威 SQL 来源 |
| `worker/src/common.ts` | 965 行中包含地址创建/清理、查询、角色、邮件解析、通知 | 按实际职责迁移，保留现有专门模块 |
| `MailBox.vue`、`AccessMailWorkbench.vue`、`admin-mail-flow.js`、`SimpleIndex.vue` | 多个仍在使用的邮件状态实现 | 复用共同状态与解析能力，保留必要界面差异 |
| `frontend/src/api/index.js`、`store/index.js` | 请求、凭证、设置装载、全局加载和提示状态相连 | 请求、身份、设置、设备偏好和功能状态分责 |
| `worker/src/__tests__/totp.test.ts` | 只有一个 TOTP 算法向量测试；未找到条目分发路由/迁移测试 | 补真实关系和跨入口行为验证 |
| `UserBar.vue`、`UserMailBox.vue` | 全仓搜索仅见自身、翻译及历史文档，未找到运行时引用 | 执行时再查动态引用后作为删除候选 |

前端 35,605 行统计包含测试 8,068 行、国际化目录 4,903 行、独立 CSS 4,144 行。
这些数字只用于区分组成，不能据此删除测试、翻译或仍在使用的功能。
双邮件解析器、编辑器、Pages 代理、SMTP/IMAP 和 WASM 包目前都有实际用途或独立职责；不预先承诺删除依赖。
既往 E2E 例外只描述对应旧任务，不代表本轮检查已通过，也不授权修改或弱化测试。

## 3. 目标仓库、配置和职责

### 3.1 根目录就是产品目录

```text
Email-Transfer-Station/
  .git/                 唯一 Git 边界，沿用产品历史
  .github/              公开检查；已有生产发布方式按需保留
  AGENTS.md             一份可公开的维护与授权说明
  README.md / README_EN.md / LICENSE / NOTICE / SECURITY.md
  worker/               同一份 Worker 源码与配置入口
  frontend/             同一份前端源码
  pages/                Pages Functions 与 BACKEND 绑定
  db/                   WP2 已建立的 schema 与历史迁移
  e2e/ / scripts/       实际需要的测试与维护工具
  mail-parser-wasm/ / smtp_proxy_server/
  skills/               mailbox Skill 与需要保留的维护 Skill
  docs/
    CURRENT.md          唯一当前状态
    INDEX.md            当前维护文档入口
    SELF_HOSTING.md     自部署说明
    plans/PLAN_2026-10-05_maintainability-refactor.md
```

最终不保留嵌套产品目录、发布副本目录或仍需同步的治理仓库。
外部备份只是恢复材料，不继续承载日常开发和提交。普通 Git worktree 可以用于隔离任务，但不成为另一份产品来源。

### 3.2 一份代码，生产与自部署选择不同配置

- 参考对话“评估仓库开源准备度”中的最终方案，采用一份源码和独立部署配置入口。
- Worker 复用现有 `wrangler.toml.template`、build/test 配置；Pages 复用当前生产配置，需要时补模板。不要仅因开源增加第三套业务构建或配置生成器。
- 域名、资源名称和资源 ID 与访问凭据分开判断。可公开的生产标识不必全部动态注入；当前忽略的运行配置仍先保留原位置及绑定，不因目录切换更换生产资源。
- 自部署复制模板到忽略的本地配置，显式选该配置；Pages 的 BACKEND 指向自己的 Worker，前端 API 路由及 SQL Text rule 保持正确。
- 真正 secrets 留在忽略文件、仓库外配置或 Cloudflare/GitHub secrets；公开说明使用通用发现规则，不写维护者个人路径和真实值。
- 复用已有 `ci.yml` 的无生产凭据验证，补模板检查而非再建重复完整 CI。只有确有生产发布工作流时才调整它；不为照搬 WANdrop 新增自动部署。
- Fork/PR 检查不得获得生产凭据或触发生产写入；生产实例名称、域名、数据和账号不随仓库路径迁移。

### 3.3 功能职责

前端目标组织如下；按迁移需要建立目录，不预先生成空文件或一套固定分层模板。

```text
admin/
  shell/              登录、导航、布局、公共确认和反馈
  features/
    mail/             邮件数据、详情与批量操作
    addresses/        地址、凭证和分配
    domains/          域名、验证和路由
    users/            用户、角色和绑定
    authenticators/   验证器、分配和分享
    delivery/         发信与通知配置
    access/           分享与审计记录
    operations/       运行状态和数据库操作
```

- 外壳只选择功能、处理入口和公共界面；刷新调用当前功能的刷新入口。
- 功能持有数据、加载/失败状态、表单、操作和失效处理；不传递全后台巨大对象。
- 跨功能只复用必要摘要或具体小工具，例如用户选择器、确认框、API 请求 ID。
- 导航/页面登记保留一个简单定义来源，稳定 view ID 和 URL 查询参数不变；不建立插件框架。
- 后端保留 admin/user/address/share 不同鉴权入口，共享具体业务函数；函数内仍执行所需资源关系校验。
- 继续复用 `admin_security.ts`、`address_authority.ts`、`mail_read_state.ts`、现有安全 HTML 与会话清理模块。
- 移动实现时同步迁移调用者；临时转发仅用于跨提交兼容，在所属工作包完成前清除。
- 新边界可用现有 TS 类型或 JSDoc 明确输入输出，不为目录整理强制全仓转换 TypeScript。

## 4. 验证器目标行为与数据方案

规划默认三类数据：资源、真实分享链接、用户访问关系。资源由管理员管理。
推荐用户访问关系具有唯一 `(user_id, authenticator_id)`、直接分配标记和可空的已保存链接引用。
保留当前每个用户/条目一个已保存链接的能力上限，不扩展为多个收藏来源。
最终字段名与约束在 WP3 的真实数据库测试中确定，不在这里预先生成 DDL。

| 操作 | 目标行为 |
| --- | --- |
| admin 直接分配 | 设置直接访问来源；已有有效收藏链接也必须建立直接分配 |
| user 保存有效链接 | 设置/替换已保存链接；直接分配标记保持不变 |
| 链接到期或撤销 | 该链接和依赖它的收藏访问失效；直接分配仍有效 |
| admin 取消直接分配 | 只取消直接来源；有效收藏链接仍可授予访问 |
| user 移除条目 | 清除该用户自己的访问关系，不影响其他用户或资源 |
| admin 删除条目 | 清理相关访问与链接后删除资源 |
| admin 删除用户 | 清理该用户关系；管理员资源和其他用户关系保留 |
| 读取验证码 | 直接分配有效，或已保存链接有效；否则不返回验证码 |

以上访问来源独立性包含明确语义修正，不应当成纯文件搬移。
与邮箱保持管理员分发的操作模式，不强行统一两者不同的凭证和有效期实现。

迁移要求：

1. 原条目 ID、密文、nonce 和真实链接 token hash 保留；AES-GCM 关联数据包含条目 ID。
2. 把现有 `assignment:` 关系转成直接分配；真实分享关系转成已保存链接来源。
3. 从现有关系恢复当前有效访问；不能依据历史 `user_id` 自动新增用户权限。
4. 检查旧字段、外键变体、孤立关系与旧表实际结构；存在歧义时保留数据并记录，不能自动丢弃。
5. 来源之间的更新必须避免相互覆盖；用数据库操作原子性和有意义的并发测试验证。
6. 外键删除策略与显式清理必须一致；尤其不能删除一条分享记录时连带删除仍有直接访问的关系。
7. 旧 API 返回字段如 `owner_user_id` 先审查全部调用者；移除或适配须明确记录，不默默破坏合同。

## 5. 分步骤工作包

依赖顺序：`WP1（完成） → WP2（完成） → WP2S（单仓库切换） → WP3 → WP4 → WP5 → WP6 → WP7`。
保留原 WP 编号，避免与已完成提交和测试记录失去对应；WP2S 单独提交、单独验收，不混入数据库或权限语义变更。
某一功能需要的小工具可以随该功能迁移；不要为了等待后续目录整理保留错误行为。

### WP1 — 建立行为基线和有意义的回归验证

**步骤**

1. 读取两层 AGENTS、CURRENT、本规划；检查两个 Git 状态，复核基线漂移并保留无关工作。
2. 梳理 admin、user、地址凭证、邮箱分享和验证器分享的真实入口、身份及数据关系。
3. 用最少的行为测试覆盖验证器创建、分配、保存、读取、移除、撤销和删除。
4. 将已发现的来源覆盖等问题标为待修正行为；基线不意味着固化错误实现。
5. 建立必要的本地 SQLite/D1 关系测试能力，优先使用已安装的工具；不为测试引入复杂新框架。
6. 记录后台各 view 的请求集合与失败范围；先用调用计数/组件测试，不新增浏览器矩阵。

**验收**：有真实关系验证，而非只匹配 SQL 字符串；能区分直接分配和链接访问。
**交付**：行为清单、必要测试、源码检查结果及基线 commit；避免建立大量一次性审计文件。

### WP2 — 统一数据库定义和升级入口

**步骤**

1. 对比 `db/schema.sql`、历史 SQL 和 `db_api.ts`，梳理仍支持的版本与迁移顺序。
2. 以 `db/` 中当前 schema 和有序迁移为权威来源；历史已发布迁移保持记录，通过新迁移纠正结构。
3. 选择最小 SQL 打包/导入方式供 Worker 使用，先验证现有构建支持；若需要生成产物，禁止手工维护第二份 SQL。
4. 将初始化/升级从 admin 路由中移出；路由保留授权、确认、审计和结果返回。
5. 迁移步骤成功后才更新版本；验证失败、重复执行和中途重试，不假定多次 exec 整体原子。
6. 用空库、v0.0.16 及实际支持的代表性旧库验证初始化与升级最终结构一致。

**验收**：表、列、索引和外键一致；迁移后数据保留；重复执行和失败版本标记正确。
**交付**：唯一维护来源、轻量执行入口、schema/迁移测试。此阶段不操作远程 D1。

### WP2S — 产品提升到根目录，结束双 Git 路线（已完成）

WP2S completed locally in the root product repository. The product history and
product origin were retained; governance history, private evidence, references,
and local state were archived outside the repository. The active tree has one
Git boundary and no nested product checkout. The remaining steps below are the
recorded acceptance checklist and are complete unless explicitly marked as a
follow-up.

**步骤 A：确认切换清单和恢复点**

1. 确认执行对话停在 WP2，记录两仓 HEAD、未提交/忽略文件、分支与 worktree；保留 WP1 `b5a3597`、WP2 `971ec08` 和这次规划提交。
2. 以现有产品历史和 `ColinKiiim/email-transfer-station` 为唯一继续维护的来源；旧 workspace 远端不作为新产品远端，不自动推送、归档远端或改可见性。
3. 将旧治理 Git 历史、私有证据、references、输出和必要本地工具状态归档到当前 workspace 之外；确认可恢复后再切换。Git bundle 已验证，普通文件按 AGENTS 做轻量检查。
4. 列出根目录冲突项：`.git`、AGENTS、`.gitignore`、`.agents`、`.claude`、docs 和 HANDOFF。逐项确定归属，禁止把整个外层树直接加入产品 index。
5. 当前产品 worktree 表有两个指向已不存在位置的 prunable 发布记录；先备份并核对，再处理失效注册。不得删除有效 worktree 或靠 reset/clean 消除冲突。

**步骤 B：切换路径与文档入口**

6. 把产品 checkout 提升到 `D:/Develop/Email-Transfer-Station/`，产品 `.git` 成为根 Git；外层治理 `.git` 已外部归档。执行时先验证全部移动目标路径，使用单一 PowerShell 文件操作，不递归移动整个 workspace 到自身下级。
7. 保留产品包之间的相对布局、锁文件和 WP2 SQL 导入；保留所需忽略运行配置和本地证据，不把这些文件变成新 tracked 文件。
8. 合并一份根 AGENTS：沿用业务/API 合同、按阶段授权、轻量验证、外部变更授权和不泄露凭据的规则；删除双 Git 与旧嵌套路径要求。
9. 将 CURRENT、INDEX 和本规划整理成公开适用版本放到 `docs/`；只迁移继续维护所需说明，旧审计截图、聊天与历史日志归档。HANDOFF 若保留，只指向新的 CURRENT/INDEX。
10. 产品 `.agents/skills` 当前是指向 `../skills` 的 symlink，外层同名路径是真目录。只保留一个 Skill 来源：可复用工具归根 `skills/`，检查链接/发现方式与 Windows checkout 兼容，不能覆盖链接后留下重复实现。
11. 根 `.gitignore` 汇合必要忽略规则并消除重复；移除失效 `/dev/` 排除，明确本地配置、状态、数据库、邮箱截图和输出的归属。规则不能替代对已跟踪文件/历史的审查。

**步骤 C：修正实际依赖旧路径的工具**

12. 更新 release/UI-review Skill、QA CLI、`.claude` 启动项、脚本、README、CI 和活动文档。当前 `pages-release.ps1` 的 CanonicalProductRoot 写死旧嵌套路径，必须改成唯一 Git 根目录。
13. 发布 receipts、readiness 与认证状态写入忽略的本地工作区或仓库外；保留 Immediate/Deferred 的已验证产物复用和授权检查。不要为单仓库取消保护，也不要让 receipt 使干净 main 变成脏工作区。
14. 旧 QA 只保留真实需要的可复用能力，可归 `scripts/qa` 或现有 e2e；采用本地 fixture 默认入口，个人生产地址不是开源默认测试目标。
15. 核对参考材料的许可证和来源说明，保留产品 LICENSE/NOTICE；参考 checkout 不移入公开代码。私有历史不 merge 到产品公开分支，也不执行未经授权的历史重写/force push。

**验收与停止点**

- 根 `git rev-parse --show-toplevel` 正确，WP1/WP2 是当前分支祖先，origin 仍是产品远端；活动根只有一个 Git 边界，且 worktree 只有根 checkout。
- 原 WP2 Worker/database/authenticator 测试与前端 adapter 从新根目录对应包通过；保留 2 个 WP3 todo，不能宣称访问来源已修正。
- SQL Text 打包、Worker dry-run、前端 Pages build、Pages 代理检查、Worker/frontend 全部本地包检查和必要维护脚本离线检查通过。路径或包未改变的昂贵检查不重复叠加。
- 搜索旧绝对/嵌套路径在活动代码、工具、入口、文档和 CI 中为零；历史记录不参与当前执行。
- 只纳入已选择的公开文件；没有私人治理历史、邮箱内容、运行 secret、备份或参考 checkout 被引入提交。尚未做历史审查的内容明确留待公开发布前验证。
- 不部署、不远程迁移、不改资源名称，也不新建公开镜像目录；外层备份不能变成第二条维护路线。
- 完成后做单仓库本地里程碑，更新 `docs/CURRENT.md` 与状态表并暂停，等待用户授权 WP3。

**交付**：唯一根 checkout、沿用产品历史、可恢复的外部归档、正确文档/工具入口；业务和 schema 行为保持 WP2 状态。

### WP3 — 修正验证器资源和访问来源（已完成）

**步骤**

1. 从 WP2S 后的根目录和 WP2 当前 v0.0.17 继续，不重做 SQL 收敛。实现第 4 节的数据模型和下一版本迁移（版本号执行时确定），消除管理员资源对 `user_id=0` 的依赖。
2. 转换假分享分配记录，保留真实分享链接及现有访问，检查升级前后关系和验证码可解密性。
3. 将 admin/user/open 三种路由接到同一验证器业务模块，保持各自授权和响应边界。
4. 实现直接分配与保存来源的独立更新；覆盖先收藏后分配、先分配后收藏及来源撤销的顺序组合。
5. 三个前端入口复用最小验证码时钟/刷新能力：按服务端时间偏移计算，到期刷新，阻止重入，卸载释放。
6. 明确加载、失败和无效状态，禁止继续展示已知过期码；保留现有输入/复制/分配操作。
7. 用户与资源删除分别验证关联清理；迁移完成前不删除旧数据恢复来源。
8. 特别检查 `database.ts` 的 `reconcileAuthenticatorTables`：当前升级统一使用最新 schema 重建 v17 表。加入下一版字段时，须把 v17 纠正限定为固定版本目标，并建立 v16 → v17 → 新版本与 v17 → 新版本的真实升级测试；不能把原表新增字段当成未知列丢弃，也不能因最新定义变化拒绝正常旧库。
9. 将 WP1 留下的 2 个 todo 转为实际通过的关系测试，保留 v17 中断/重试与异常数据保护；新增版本只能在全部升级成功后写入。

**验收**：第 4 节行为表全部通过；包含到期、撤销、权限拒绝、重复分配、时间偏差及资源清理。
**交付**：本地可运行迁移、明确的验证器模块、相关界面与测试；外部迁移待当前任务授权。

WP3 本地交付：`b295fa1`。v0.0.18 将验证器资源与用户解耦，直接分配和保存分享来源独立存储；旧 `user_id=0` 与 `assignment:` 哨兵数据在真实 SQLite 迁移测试中转换，密文、nonce、真实 token hash 与访问关系保留。admin/user/open 入口继续共用验证器模块；Worker lint、typecheck、25 个测试文件（103 passed）和 dry-run build 通过。

### WP4 — 后台按功能拥有数据和动作（已完成）

**步骤**

1. 先迁移验证器和用户，验证 shell → 当前功能 → 数据/动作的边界，再按地址、域名、其余页面推进。
2. 将业务表单、动作和专属浮层从 `admin-console-actions.js` / `AdminOverlays.vue` 移到所属功能。
3. 替换跨全后台的 `workspaceModel/actions`，只向组件传所需数据；公共确认和反馈继续复用。
4. 移除全页面 `loadAdminSnapshot` 依赖；概览采用统计和有限最近邮件，运维才读取运行配置。
5. 同一页面刷新、重试与操作后失效统一；缓存仅在确有需要时保留，并在退出/换账号时清空。
6. 保留 URL、历史导航、稳定选择 ID 和角色管理员登录；迟到响应不得覆盖新页面或新会话。
7. 所有 view 完成迁移后删除旧动作集合与加载入口，不能只隐藏旧调用。
8. 所有入口、测试与文档均相对于唯一仓库根；不为管理员功能建立内外两份页面或 API adapter。

**验收**：验证器页不拉邮件/Webhook/域名全量数据；全局刷新能刷新当前页；无关接口失败不阻断当前功能。
**交付**：全部后台 view 的职责迁移和测试，薄 shell，旧大对象退出。

WP4 本地交付：`4d24737`。保留已有 AdminWorkspace/AdminResourceWorkspace/AdminMailWorkspace 组件和 admin 分发逻辑，将 `AdminNext` 的全量 snapshot 改为按 view 的读取清单；验证器不读取 snapshot，身份页只读取域名、地址和用户，view 切换只刷新当前功能。前端 lint、typecheck、33 个测试文件（234 passed）、production build、Pages build、Pages check 和 middleware 语法检查通过。

### WP5 — 后端公共职责与前端身份/请求分离

**步骤**

1. 按全部调用者迁移 `common.ts` / `utils.ts` 的地址生命周期、查询、角色、解析和通知职责。
2. admin/user/address API 调用同一个具体业务操作，保留入口与资源级授权；不抽象成万能 CRUD。
3. 整理 `worker.ts` 的中间件声明，按真实入口表达鉴权，保留分享只读范围和外部发信授权。
4. 前端请求层负责通信和结构化错误；设置装载、身份失效、通知展示归各自模块。
5. 分离身份、设备偏好和功能数据；保持存储 key 的兼容或显式迁移，保留统一退出清理。
6. 功能内 loading 独立；公共 loading 若仍保留，仅表示真实公共操作，不阻塞无关功能。
7. 生产与自部署复用同一业务逻辑，配置差异只通过现有 bindings/设置注入，不增加生产专用源码分支或发布时改写源码。

**验收**：角色管理员、会话过期、邮箱凭证轮换、分享撤销、外部发信权限和跨账号清理均保持正确。
**交付**：清楚的业务模块和请求/状态职责，移除已失去职责的公共出口。

### WP6 — 收敛邮件状态并落实正确分页

**步骤**

1. 对比仍使用的 MailBox、AccessMailWorkbench、admin-mail-flow 和 SimpleIndex，列出共同状态与真实差异。
2. 复用分页、刷新、已读、批量动作、详情缓存和对象 URL 清理中真正相同的逻辑。
3. 保留 `MailContentRenderer.vue` 为正文入口；保持安全 HTML、附件、HTML/Text/Raw 模式和详情解析状态。
4. 后台邮件列表改成服务端分页；同步完善筛选、计数与批量操作语义后才移除最多 500 封的预加载。
5. 用大于 500 封的本地样本验证域名/地址/已读/搜索筛选，不把当前页计数当总数。
6. 解析器保持现有能力；只有样本行为和耗时验证支持时才合并/删除某个解析器，不能凭依赖大小判断。
7. 覆盖快速换邮件、取消/迟到响应、缓存命中、解析失败、导出与卸载资源回收。

**验收**：摘要不冒充正文；筛选/计数跨页正确；各身份入口只看到授权数据；必要界面差异保留。
**交付**：共同邮件能力、必要界面适配、正确分页及相关回归验证。

### WP7 — 删除遗留实现并完成可维护性验收

**步骤**

1. 全仓查引用、路由、自动组件解析、动态字符串、测试和配置，确认旧组件及导出确实不可达。
2. 删除旧控制器、无用入口与临时转发；UserBar/UserMailBox 仅在复核后删除。
3. 专属 CSS 和翻译归功能，共享 token/文案保持公共来源；不为拆分重复公共规则。
4. 清理已无调用的依赖，保持仍使用的 PWA、编辑器、SMTP/IMAP、WASM 和 Pages 能力。
5. 从根目录完成 README/README_EN、`docs/SELF_HOSTING.md`、AGENTS、SECURITY、LICENSE/NOTICE、模板与对应 changelog 的一致性检查；遵循现有 CI，不能降低检查要求。
6. 记录实际请求数量、修改触点和新依赖数量；用一个已有功能的小行为变更检查是否仍须改跨功能控制器。
7. 完成相关包整体验证；交付 commit、待办、实际失败与适用的回退方案。
8. 参考 WANdrop 验证“一份代码、多配置”：无生产凭据的 clone/build/test/template dry-run 可执行；Worker、Pages BACKEND、数据库初始化/升级、TOTP 加密配置和可选邮件集成有准确说明。Dry-run 不冒充从空 Cloudflare 账号完整自部署成功。
9. 复核最终公开树和产品历史，明确已发现问题及 GitHub 私密漏洞报告的实际启用状态。仓库可见性、远端保护/报告设置和推送另获授权后操作，不写已启用的假结果。

**验收**：功能有明确归属，旧实现退出，数据库只有一个定义来源；没有未经证据支持的维护提速承诺。
**交付**：本地已验证的重构里程碑、简短维护地图、可交接状态；上线属于另一个明确授权步骤。

## 6. 验证、提交、回退与停止点

- 执行使用各包现有 lint、typecheck、test、build；前端交付需要相关 build 与 build:pages。
- 每个有实质逻辑变化的阶段运行受影响检查及相应 Git 的 `diff --check`，通过后形成任务所有的本地提交。
- WP2S 完成前仍按实际两个 Git 边界工作；完成后只在根仓库提交，CURRENT/INDEX/规划更新归同一个提交链。旧治理历史仅外部归档。
- 数据模型用真实本地数据库测试；签名/鉴权入口可继续用现有轻量测试，但不能仅靠伪 D1 判断 SQL 正确。
- 跨包权限、迁移、邮件链路变化运行对应集成检查；SMTP/Rust 仅在涉及它们或其合同的变更时增加检查。
- 不重复运行已通过且代码未变的昂贵检查；不默认增加浏览器矩阵/截图扫描，遵循 AGENTS 的复现例外。
- 回退必须区分纯代码与 schema：若旧代码不能读取新 schema，先交付兼容版本或设计前向修复，不能声称仅回退 Worker 就够。
- 远程迁移前准备可恢复备份并验证对应恢复/兼容方案；不将“保留旧表”冒充完整生产恢复方案。
- 发现不明数据转换、真实权限语义冲突、不可恢复风险或必要外部授权缺失时停止对应步骤，说明证据和最小待决事项。
- 普通实施选择、测试失败和可自行修复的引用错误自行解决；不得以困难或耗时为由把已授权本地工作交回用户。
- 每次交付在本文件与 CURRENT 更新一次：完成包、产品 commit、运行检查、真实限制、下一步；WP2S 后使用 `docs/` 中的文档，不另建内部发布目录或庞大日志体系。

## 7. 执行状态与接手说明

| 工作包 | 状态 | 产品 commit / 验证记录 |
| --- | --- | --- |
| WP1 | 完成 | `b5a3597`；真实 SQLite 2 tests + 2 WP3 todo；前端 adapter 4 tests；Worker lint/typecheck、diff check 通过。 |
| WP2 | 完成 | `971ec08`；唯一 SQL 定义来源、薄 Admin 路由、本地 v0.0.17 结构纠正；10 项真实迁移测试。Worker 25 files / 100 passed + 2 WP3 todo；lint/typecheck/dry-run build、TOML 结构和 diff check 通过。 |
| WP2S | 完成 | 根产品 Git 沿用 `main` 历史和产品 origin；治理/产品 bundle 验证，旧失效 worktree 注册清理，文档迁移，QA/发布/启动路径修正；Worker/frontend/Pages/Skill/QA 离线验证通过，业务树保持 WP2 行为。 |
| WP3 | 完成 | `b295fa1`；v0.0.18 来源迁移、真实 SQLite 迁移/回滚/重试、admin/user/open 验证器行为测试；Worker 25 files / 103 passed，lint/typecheck/dry-run build 通过。 |
| WP4 | 完成 | `4d24737`；按 view 的 admin API 读取边界、切换刷新和 5 项 adapter 回归测试；frontend 33 files / 234 passed，lint/typecheck/build/build:pages、Pages check 通过。 |
| WP5 | 完成 | 本地重构：邮件解析移入 `worker/src/email/mail_parser.ts`；前端请求 loading 计数移入 `frontend/src/api/request-state.js`；Worker lint/typecheck/25 files 103 passed，前端 lint/typecheck 及受影响测试通过。 |
| WP6 | 完成 | 管理后台邮件列表移除 500 封隐式预取，使用既有服务端 `limit/offset` 按翻页加载；邮件流程与 AdminNext 回归测试通过。 |
| WP7 | 完成 | 删除无调用的 500 封预加载出口，更新引用、测试和维护文档；最终全包验证与 diff check 通过。 |

新对话先按 AGENTS → docs/CURRENT → docs/INDEX → 本规划恢复；不用重看归档历史。
当前状态：WP1–WP7 已完成本地验证。WP3 只在本地测试库运行，无远程迁移；v0.0.18 需要兼容 Worker 后才能获得生产迁移授权。维护/兼容说明在 `db/README.md`；上线前仍须另行准备真实备份与恢复方案。
WP1 入口复核：admin session/role 由 `admin_security` 校验；user token 由 `user_identity` 校验；address 与 mailbox share 由 `address_authority` 校验并限制分享只读；authenticator open share 校验 token hash、撤销和到期。WP4 已将后台读取改为按 view 的清单，单接口失败进入当前 view 的 errors；验证器继续自行读取。
建议一个主执行对话按阶段连续推进，不让多个对话同时修改同一 checkout。
用户已授权同时推进 WP5、WP6、WP7；三阶段完成后又授权 GitHub 同步收尾。
本规划状态只在真实开始、阻塞或完成时按项目允许值更新。

同步收尾（2026-10-05）：旧 `ColinKiiim/email-transfer-station-workspace` 已复核并删除，仓库外恢复归档保留。
产品提交通过 [PR #5](https://github.com/ColinKiiim/email-transfer-station/pull/5) 集成，沿用产品历史和现有 `validate` 保护规则。
`c87b7d9` 修正 EOF 空白；`15d15d9` 补齐 E2E 镜像中的唯一 SQL 来源；`10d96f6` 修正测试代理监听和过时 UI/API 测试契约。
代码提交 `10d96f6` 的 [Actions 37265210587](https://github.com/ColinKiiim/email-transfer-station/actions/runs/37265210587) 中 validate 和 Docker E2E 全部通过（129 passed）。
本地前端 34 files / 235 tests、E2E 用例发现（129 tests / 31 files）和 diff check 通过。本机没有 Docker，不声称本地容器验证。
部署和生产 v0.0.18 迁移仍须另行授权。

可用于下一次执行的提示：

> 请读取 AGENTS.md、docs/CURRENT.md、docs/INDEX.md 和
> docs/plans/PLAN_2026-10-05_maintainability-refactor.md 的最新版本，复核根 Git 边界。
> WP1–WP7 已完成，不重做。先复核当前 Git 与 PR #5 的状态，
> 再处理用户新授权的维护任务。
> 不推送、不部署、不执行远程 D1 迁移、不启动子代理；需要我决定时再提问。

WP1–WP7 已完成；后续接手统一读取 `docs/CURRENT.md`、`docs/INDEX.md` 和
`docs/plans/PLAN_2026-10-05_maintainability-refactor.md`，从新的维护任务继续。

参考记录：

- [评估仓库开源准备度](codex://threads/01a1060f-b80b-76e1-b4bb-570e8edde1ee)：采用最终一份源码/模板方案，不采用前期已撤回的生产配置必须全部动态注入方案。
- [执行维护性重构计划](codex://threads/01a10809-0b38-7792-b36a-c73fa27bb74f)：WP1/WP2/WP3/WP4 完成、本地验证和阶段暂停点。

## 8. 对话与模型建议（2026-10-05 快照）

当前执行对话已完成 WP1–WP7 和 GitHub 同步验证；后续继续读取本规划和 CURRENT，不要让两个对话同时修改同一 checkout。
若另开对话，以本规划和 CURRENT 接手；这是工作组织建议，不是对对话速度或质量的实测保证。

- 默认执行：`GPT-6.1-Sol` + `high`。
- 数据迁移、访问来源并发问题和跨入口审查：先用同模型 `high`；确有未解问题时升至 `xhigh`。
- 最终独立架构/迁移审查：可选择 `GPT-6-Astra` + `high`，是否切换由用户决定。
- 纯文件移动、确定的引用修改、文档整理：`medium` 可用；整个工程不默认使用 `max` 或 `ultra`。
- 本机配置文件当次读取为 `gpt-6.1-sol` / `high`；单个对话可能有覆盖设置，实际以该对话选择器为准。
- 本机目录将 `ultra` 描述为带自动任务委派的模式；默认单执行者工作不选择它。

依据：当次本机模型目录和 [OpenAI 模型说明](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol)、
[推理深度说明](https://developers.openai.com/api/docs/guides/reasoning)。阶段选择是针对本任务的建议，未做模型对比实验。
后续可用模型及选项发生变化时再核对，不把该快照视为永久配置。

## 后续产品修复（2026-10-05）

管理员登录已完成本地持久会话和自动续期修复，数据库当前版本为 `v0.0.19`。
此项不改变 WP1–WP7 的完成记录；策略、官方参考与迁移边界见
[`管理员会话说明`](../admin-sessions.md)，最终验证与未上线状态见 [`CURRENT`](../CURRENT.md)。
