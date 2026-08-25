# 功能归档与暂存区 (Feature Archive & Stash)

本目录用于存放暂未开启后端接口、处于开发阶段或暂时隐藏的前端功能组件及逻辑实现。

---

## 目录规则

1. **零死代码原则**：主应用视图（`views/`）保持干净简洁，不暴露未启用的死按钮或报错入口。
2. **完整保留实现**：功能代码以独立组件形式完整归档于本目录对应子文件夹，包含完整的 API 调用、状态管理和 i18n 逻辑。
3. **即插即用恢复**：当后端接口或环境准备就绪时，只需将归档组件重新引入到对应页面即可无缝恢复。

---

## 归档功能清单

### 1. Passkey（WebAuthn 通行密钥）
- **状态**：暂存隐藏（因当前部署环境未启用 Worker WebAuthn 依赖及相关凭据存储）
- **归档文件**：
  - `passkey/PasskeyLoginButton.vue`：登录页面（`UserLogin.vue`）的 Passkey 登录按钮及 `authenticateRequest` / `authenticateResponse` 验证逻辑。
  - `passkey/PasskeySettingsSection.vue`：用户设置页（`UserSettings.vue`）的 Passkey 创建、重命名、删除和列表查看管理模块。
- **恢复步骤**：
  1. 在 `frontend/src/views/user/UserLogin.vue` 中引入并使用 `PasskeyLoginButton.vue`：
     ```vue
     <import PasskeyLoginButton from '@/archive/passkey/PasskeyLoginButton.vue' />
     <PasskeyLoginButton @login-success="handleLoginSuccess" />
     ```
  2. 在 `frontend/src/views/user/UserSettings.vue` 中引入并使用 `PasskeySettingsSection.vue`：
     ```vue
     <import PasskeySettingsSection from '@/archive/passkey/PasskeySettingsSection.vue' />
     <PasskeySettingsSection />
     ```
  3. 确认 Cloudflare Worker 后端路由 `/user_api/passkey/*` 数据库表 `user_passkeys` 已启用。
