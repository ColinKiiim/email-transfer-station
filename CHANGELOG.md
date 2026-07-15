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
- 管理 API 迁移到 `/api/admin/*`；旧前缀和旧后台路由只作为待删除兼容实现保留。
- 前端品牌、地址凭据连接弹窗、分享邮箱壳、后台收件流和多断点布局改为本项目语义。
- 新增只读 GitHub Actions CI，覆盖 Worker/Frontend/Pages 本地等价验证与手动 E2E。
- 重写中英文发布说明，删除继承文档站，补充真实来源 NOTICE 与测试版安全支持范围。

### 修复与安全

- 修复复杂 MIME、quoted-printable/base64 和 HTML 邮件在后台预览中的解析/渲染退化。
- HTML 邮件统一使用 DOMPurify 和 sandbox 隔离；解析失败时不再把原始 MIME 当正文。
- 管理员密码重置改为提交哈希，地址列表不再返回已存储密码哈希。
- 分享 token 调用写接口稳定返回 403，撤销后短期会话会再次校验 token 状态。
- Worker 对外错误不再直接暴露内部异常；E2E 辅助接口保持测试模式/可选秘密门禁。
- 修复收件流筛选、未读状态、整页滚动、列表编码和邮件 HTML 正文选择问题。

## 来源基线

本项目从 `dreamhunter2333/cloudflare_temp_email` commit
`72bbfe8fd6d329237fa2e70b17cb95031597b345` 分化。此前历史由该固定 commit、Git 历史
和 [NOTICE](NOTICE) 中的来源链接保留，不在本日志重复复制上游发布记录。
