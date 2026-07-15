# 更新日志

[English](CHANGELOG_EN.md)

## 0.0.0-test（未发布）

### 新增

- 新增以 `/admin` 为唯一规范入口的管理控制台，以及同源 `/api/admin/*` 管理 API。
- 新增托管域名注册表、Cloudflare Email Routing 激活流程和外部 forwarding collector
  原始收件人恢复。
- 新增单地址分享 token、短期只读会话、过期时间、单条/批量撤销和地址凭据轮换。
- 新增按管理员、地址凭据、分享链接和用户会话隔离的邮件已读状态。
- 新增域名/地址维度的邮件流、访问审计、Webhook 配置和运行诊断。
- 新增 `email-transfer-station-agent-mail` Skill，默认不持久化凭据，并把发送、删除和
  远端操作置于显式授权边界内。

### 变更

- 默认产品策略改为管理员创建地址优先，关闭匿名创建和普通用户删除。
- Pages 成为唯一前端发布表面；Pages Function 通过 `BACKEND` service binding 同源
  代理 Worker API。
- 管理 API 迁移到 `/api/admin/*`；内部调用方完成迁移后，旧 API 前缀、旧后台和
  `/console` 兼容入口已经删除。
- 前端品牌、地址凭据连接弹窗、分享邮箱壳、后台收件流和多断点布局改为本项目语义。
- 新增只读 GitHub Actions CI，覆盖 Worker/Frontend/Pages 本地等价验证与手动 E2E。
- 重写中英文发布说明，删除继承文档站，补充真实来源 NOTICE 与测试版安全支持范围。

### 修复与安全

- 修复复杂 MIME、quoted-printable/base64 和 HTML 邮件在后台预览中的解析/渲染退化。
- HTML 邮件统一使用 DOMPurify 和 sandbox 隔离；解析失败时不再把原始 MIME 当正文。
- 管理员密码重置改为提交哈希，地址列表不再返回已存储密码哈希。
- 分享 token 调用写接口稳定返回 403，撤销后短期会话会再次校验 token 状态。
- Worker 对外错误不再直接暴露内部异常；E2E 辅助接口保持测试模式/可选秘密门禁。
- 安全敏感随机值改用 Web Crypto；OAuth state 使用 256-bit 随机值、标签页会话绑定、
  十分钟过期和一次性消费。
- 新增默认关闭的版本化 PBKDF2 地址密码迁移，保留旧记录读取和成功登录后的 CAS 渐进
  升级；生产启用前必须验证兼容并取得可恢复备份。
- 浏览器 CORS 改为同源、`FRONTEND_URL` 和显式 origin allowlist；无 `Origin` 的
  Agent/SMTP 调用仍必须通过正常认证。
- 管理 API 不再接受部署口令作为请求凭据，改用一小时、标签页范围的签名会话；管理
  写入新增请求 ID、结果审计、显式危险操作确认，以及地址删除/清空/凭据操作的
  版本或计数冲突保护。
- 升级 Worker、前端、构建与 E2E 的安全相关依赖，并移除旧 AWS/Resend 依赖链中
  已知有公告的传递版本。
- Webhook 失败日志不再记录目标 URL、headers、请求 body 或邮件内容，并以合成
  secret canary 覆盖 HTTP 失败和 transport 异常。
- 修复收件流筛选、未读状态、整页滚动、列表编码和邮件 HTML 正文选择问题。
- Agent 邮箱 Skill 显式禁止通过 URL、命令参数、终端输出、日志或跨源重定向泄露
  Address JWT，并新增合成 canary 与只读 CI 门禁。

## 来源基线

本项目从 `dreamhunter2333/cloudflare_temp_email` commit
`72bbfe8fd6d329237fa2e70b17cb95031597b345` 分化。此前历史由该固定 commit、Git 历史
和 [NOTICE](NOTICE) 中的来源链接保留，不在本日志重复复制上游发布记录。
