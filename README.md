# Email Transfer Station

[English](README_EN.md)

Email Transfer Station 是一个运行在 Cloudflare 上的自托管邮件接收与委托访问系统。
它把 Cloudflare Email Routing 或外部转发服务送达的邮件交给 Worker，使用 D1 保存
邮箱与邮件数据，并通过同源 Pages 前端提供邮箱、分享链接和管理控制台。

> 当前版本为 `0.0.0-test`（开发标签 `v0.0.0(test)`）。它不是稳定发行版，不提供
> 生产 SLA、无中断升级保证或托管服务。部署者必须自行评估数据保护、域名、成本和
> Cloudflare 配置。

## 当前产品契约

| 表面 | 路径或位置 | 认证边界 |
| --- | --- | --- |
| 公共站点与地址邮箱 | `/`、`/api/*` | Address bearer credential 或实例配置的站点认证 |
| 管理控制台 | `/admin` | 管理员账号/密码换取的短期会话；API 使用 `x-admin-auth` |
| 管理 API | `/api/admin/*` | 管理员会话 |
| 用户中心 | `/user`、`/user_api/*` | 用户会话；是否开放由实例配置决定 |
| 地址分享 | `/i/:token` | 分享 token 换取的短期、只读地址会话 |
| 公共配置与登录 | `/open_api/*` | 只暴露明确设计为公开的设置和认证入口 |

`/admin` 与 `/api/admin/*` 是唯一对外承诺的后台入口。

管理员登录成功后返回最长一小时的签名会话；前端只在当前标签页的
`sessionStorage` 中保存它。配置在 `ADMIN_PASSWORDS` 中的口令只用于登录，不是
`x-admin-auth` API 凭据，Worker 会拒绝把原始口令直接作为管理认证。管理响应使用
`Cache-Control: no-store`；写请求带 `x-admin-request-id`，所有 `DELETE` 和指定的
高影响 `POST` 还必须提交 `{"confirm":true}`。地址删除、清空收件箱和凭据操作会
校验调用方看到的版本或计数，状态已变化时返回 `409`，要求刷新后重新确认。

`DISABLE_ADMIN_PASSWORD_CHECK` 只有与 `E2E_TEST_MODE=true` 同时设置时才生效；
它们只用于一次性本地 E2E 环境，不是生产配置。

## 核心能力

- 通过 Cloudflare Email Routing 接收邮件，保存原始 MIME 与入站元数据，并按需提供
  解析视图。
- 通过 collector 地址接收 ImprovMX 等外部服务转发的非 Cloudflare 域邮件，并恢复
  原始收件人。
- 由管理员管理域名、地址、邮件流、访问包和运行状态。
- 为单个地址创建可过期、可撤销的只读分享链接。
- 轮换地址凭据，使旧的固定自动登录链接失效。
- 按管理员、地址凭据、分享链接和用户会话分别记录已读状态。
- 使用仓库内的 `skills/email-transfer-station-agent-mail/` 让 Agent 在持有者授权下读取
  邮箱；Skill 不默认落盘或回显 Address JWT，发送和删除仍需调用者明确授权。

Webhook、Telegram、SMTP/IMAP proxy、OAuth、出站邮件、S3 附件和 AI 提取等继承能力
仍保留为可选兼容表面，但不属于最小部署门禁。启用前应单独验证对应绑定、秘密、成本
和数据流。

## 架构

```text
Cloudflare Email Routing ─┐
外部转发 / collector ─────┴─> Worker (mail handler + Hono API)
                                ├─> D1: 地址、邮件、会话与审计数据
                                ├─> KV: 可选 Webhook/验证码/Telegram 状态
                                └─> 可选 S3、AI、发信与通知集成

Browser ─> Cloudflare Pages (Vue SPA)
             └─> Pages Function ─BACKEND service binding─> Worker
```

Pages Function 只代理 `/api/`、`/open_api/`、`/user_api/`、`/telegram/` 和
`/external/`。生产前端必须从 `pages/` 构建和部署，不能绕过 Functions 直接从
`frontend/` 发布。

## 仓库结构

```text
worker/                         Worker、邮件入口、API 与 Cloudflare 绑定
frontend/                       Vue 3 SPA
pages/                          Pages 构建入口和同源 Worker 代理
db/                             D1 schema 与迁移 SQL
e2e/                            Docker + Playwright + Mailpit 集成测试
mail-parser-wasm/               继承的 Rust/WASM 邮件解析兼容源码
smtp_proxy_server/              可选 SMTP/IMAP proxy
skills/email-transfer-station-agent-mail/
                                Agent 邮箱访问契约
```

## 无秘密本地验证

需要 Node.js 22、Corepack 和 pnpm 10.10.0。以下命令只做安装、测试和构建，不需要
Cloudflare 凭据：

```bash
cd worker
corepack pnpm install --frozen-lockfile
corepack pnpm run lint
corepack pnpm run test
corepack pnpm run build

cd ../frontend
corepack pnpm install --frozen-lockfile
corepack pnpm run test
corepack pnpm run build
corepack pnpm run build:pages

cd ../pages
corepack pnpm install --frozen-lockfile
corepack pnpm run check
corepack pnpm run build

cd ..
git diff --check
```

完整 E2E 需要 Docker：

```bash
cd e2e
npm ci
npm test
npm run test:down
```

## 自托管部署边界

部署会写入远端 Cloudflare 资源；请先审阅命令和目标账号。最小部署需要：

1. 一个已接入 Cloudflare 的域名，并为该域启用 Email Routing。
2. 一个 D1 数据库，以及按实际功能选择的 KV、R2/S3、AI、发送邮件或服务绑定。
3. 从 `worker/wrangler.toml.template` 创建不纳入 Git 的 `worker/wrangler.toml`，替换
   所有占位域名、数据库 ID 和资源名。
4. 通过 `wrangler secret put` 写入管理员口令、JWT 签名值和第三方令牌；不要把真实值
   写入 TOML、README、issue 或提交历史。
5. 在备份后按 `db/` 中的 schema/迁移初始化 D1，再从 `worker/` 部署 Worker。
6. 核对 `pages/wrangler.toml` 的 Pages 项目名及 `BACKEND` service binding，然后只从
   `pages/` 运行规范构建/部署命令。

地址密码兼容迁移必须先部署 Worker，再更新 Pages 前端或 SMTP/IMAP proxy。默认保持
`ENABLE_ADDRESS_PASSWORD_V2=false`；确认新旧调用方均兼容并取得可恢复的 D1 备份后，
才可显式启用。启用后必须保留新版读取逻辑，完整回滚旧 Worker 需要恢复启用前备份。

规范 Pages 部署通过 `BACKEND` binding 同源调用 Worker，不需要放宽 CORS。只有另一个
浏览器 origin 直接调用 Worker 时，才在 `CORS_ALLOWED_ORIGINS` 中列出精确的
scheme/host/port；不要使用通配符。Agent、SMTP/IMAP 和其他无 `Origin` 的非浏览器客户端
仍按原认证契约访问。

```bash
cd worker
corepack pnpm run deploy

cd ../pages
corepack pnpm run deploy
```

仓库中的活动 CI 只有只读验证权限，不会部署。`.github/workflows-disabled/` 是不能执行
的历史工作流存档，不是受支持的发布方式。当前也没有与生产资源隔离的 staging 环境。

## 安全与隐私

邮件正文、附件、地址凭据、分享 token 和管理员会话都属于敏感数据。生产部署至少应：

- 使用独立、最小权限的 Cloudflare 资源和 API token；
- 保持管理员认证开启并定期轮换管理员及地址凭据；
- 在生产入口前增加 Cloudflare Access 或等效的 MFA/网络访问控制；内置管理员会话
  当前不提供 MFA、会话撤销列表或细粒度管理员角色；
- 限制公开创建、删除、发信和 Webhook 能力；
- 在迁移前备份 D1，并为邮件及审计数据设置明确保留期；
- 保持邮件 HTML 清洗和远程媒体默认阻止策略，不要为了保留发件人样式而放宽；
- 不把真实邮箱内容、浏览器存储状态或 Wrangler 配置提交到 Git。

支持范围和报告方式见 [SECURITY.md](SECURITY.md)。当前没有私密漏洞接收入口，请勿在
公开 issue 中粘贴利用细节、凭据或个人邮件内容。

## 来源与许可证

本项目基于 `dreamhunter2333/cloudflare_temp_email` 的固定源码快照继续开发。来源
commit、保留的版权声明以及 Telegraf patch 的第三方许可见 [NOTICE](NOTICE)。仓库根
[LICENSE](LICENSE) 保留上游 MIT 许可证全文；依赖包仍分别受其自身许可证约束。

项目主页：<https://github.com/ColinKiiim/email-transfer-station>
