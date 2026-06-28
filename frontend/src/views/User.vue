<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../api'
import { useGlobalState } from '../store'
import AccessShell from '../components/AccessShell.vue'
import AccessMailWorkbench from '../components/AccessMailWorkbench.vue'
import AddressMangement from './user/AddressManagement.vue'
import UserSettingsPage from './user/UserSettings.vue'
import BindAddress from './user/BindAddress.vue'
import UserLogin from './user/UserLogin.vue'

const message = useMessage()
const {
  userTab,
  userJwt,
  userSettings,
  userOpenSettings,
  openSettings,
} = useGlobalState()

const { t } = useScopedI18n('views.User')
const addressFilter = ref('')
const addressFilterOptions = ref([])
const addressesLoaded = ref(false)

const isSignedIn = computed(() => !!userSettings.value.user_email)
const roleLabel = computed(() => userSettings.value.user_role?.role || '无角色')
const canCreateOrBindAddress = computed(() =>
  userSettings.value.is_admin
  || userSettings.value.can_bind_address === true
  || userSettings.value.can_create_address === true
)

const railItems = computed(() => {
  if (!isSignedIn.value) return []
  return [
    { id: 'user_mail_box_tab', label: t('user_mail_box_tab'), icon: 'mailbox' },
    { id: 'address_management', label: t('address_management'), icon: 'addresses', badge: String(addressFilterOptions.value.length || '') },
    { id: 'user_settings', label: t('user_settings'), icon: 'account' },
    ...(canCreateOrBindAddress.value ? [{ id: 'bind_address', label: t('bind_address'), icon: 'bind' }] : []),
  ]
})

const shellTitle = computed(() => isSignedIn.value ? '用户邮箱工作台' : '用户访问')
const shellKicker = computed(() => isSignedIn.value ? 'mailbox access and address ownership' : 'secure sign in')
const statusLabel = computed(() => {
  if (!userOpenSettings.value.fetched || !userSettings.value.fetched) return '同步中'
  return isSignedIn.value ? '已登录' : '需要登录'
})
const statusTone = computed(() => isSignedIn.value ? 'success' : 'warning')
const identityLabel = computed(() => isSignedIn.value ? userSettings.value.user_email : 'Email Transfer Station')
const identityMeta = computed(() => {
  if (!isSignedIn.value) return '登录后访问你的地址、收件箱和账户设置'
  if (userSettings.value.is_admin) return `${roleLabel.value} · 管理员分配`
  if (userSettings.value.can_create_address) return `${roleLabel.value} · 可创建地址`
  return `${roleLabel.value} · 已分配地址`
})

const fetchAddressOptions = async () => {
  if (!isSignedIn.value) return
  try {
    const { results } = await api.fetch('/user_api/bind_address')
    addressFilterOptions.value = (results || []).map((item) => ({
      label: item.name,
      value: item.name,
    }))
    addressesLoaded.value = true
  } catch (error) {
    console.error(error)
    message.error(error.message || 'error')
  }
}

const fetchMailData = async (limit, offset) => {
  return await api.fetch(
    `/user_api/mails`
    + `?limit=${limit}`
    + `&offset=${offset}`
    + (addressFilter.value ? `&address=${encodeURIComponent(addressFilter.value)}` : ''),
  )
}

const deleteMail = async (curMailId) => {
  await api.fetch(`/user_api/mails/${curMailId}`, { method: 'DELETE' })
}

const updateMailReadState = async (curMailId, read = true) => {
  return await api.fetch(`/user_api/mails/${curMailId}/read_state`, {
    method: 'PATCH',
    body: JSON.stringify({ read }),
  })
}

const logout = () => {
  userJwt.value = ''
  userSettings.value = {
    ...userSettings.value,
    fetched: true,
    user_email: '',
    user_id: 0,
    is_admin: false,
    access_token: null,
    new_user_token: null,
    user_role: null,
  }
  location.reload()
}

watch(canCreateOrBindAddress, (allowed) => {
  if (!allowed && userTab.value === 'bind_address') {
    userTab.value = 'address_management'
  }
}, { immediate: true })

watch(isSignedIn, async (signedIn) => {
  if (signedIn) await fetchAddressOptions()
}, { immediate: true })

onMounted(async () => {
  await api.getUserOpenSettings(message)
  if (userJwt.value && !userSettings.value.user_id) {
    await api.getUserSettings(message)
  } else if (!userSettings.value.fetched) {
    userSettings.value.fetched = true
  }
  if (isSignedIn.value && !addressesLoaded.value) await fetchAddressOptions()
})
</script>

<template>
  <AccessShell
    :title="shellTitle"
    :kicker="shellKicker"
    :identity-label="identityLabel"
    :identity-meta="identityMeta"
    :status-label="statusLabel"
    :status-tone="statusTone"
    :rail-items="railItems"
    :active-id="userTab"
    @select="userTab = $event"
  >
    <template #actions>
      <n-button v-if="isSignedIn" tertiary @click="fetchAddressOptions">
        刷新地址
      </n-button>
      <n-button v-if="isSignedIn" tertiary type="error" @click="logout">
        退出
      </n-button>
    </template>

    <template #rail-footer>
      <div v-if="isSignedIn" class="user-rail-summary">
        <span>访问范围</span>
        <strong>{{ addressFilterOptions.length || 0 }} 个地址</strong>
        <p>{{ openSettings.enableUserDeleteEmail ? '允许删除邮件' : '只读或受限删除' }}</p>
      </div>
    </template>

    <section v-if="!userSettings.fetched || !userOpenSettings.fetched" class="access-card">
      <n-skeleton text :repeat="8" />
    </section>

    <section v-else-if="!isSignedIn" class="login-layout">
      <div class="login-copy">
        <span>用户入口</span>
        <h2>登录后进入同一套新工作台</h2>
        <p>收件箱、地址绑定和账户安全都在这里完成。这个页面不再使用旧站 Header 和卡片式导航。</p>
      </div>
      <div class="login-panel">
        <UserLogin />
      </div>
    </section>

    <AccessMailWorkbench
      v-else-if="userTab === 'user_mail_box_tab'"
      v-model:address-filter="addressFilter"
      title="我的收件箱"
      description="按地址过滤、搜索当前页邮件，并在右侧阅读正文。"
      :address-options="addressFilterOptions"
      :show-address-filter="true"
      :enable-user-delete-email="openSettings.enableUserDeleteEmail"
      :fetch-mail-data="fetchMailData"
      :delete-mail="deleteMail"
      :update-mail-read-state="updateMailReadState"
      :show-filter-input="true"
    />

    <section v-else-if="userTab === 'address_management'" class="access-card">
      <div class="module-head">
        <span>address ownership</span>
        <h2>{{ t('address_management') }}</h2>
      </div>
      <AddressMangement />
    </section>

    <section v-else-if="userTab === 'user_settings'" class="access-card">
      <div class="module-head">
        <span>account security</span>
        <h2>{{ t('user_settings') }}</h2>
      </div>
      <UserSettingsPage />
    </section>

    <section v-else-if="canCreateOrBindAddress" class="access-card">
      <div class="module-head">
        <span>address onboarding</span>
        <h2>{{ t('bind_address') }}</h2>
      </div>
      <BindAddress />
    </section>
  </AccessShell>
</template>

<style scoped>
.user-rail-summary,
.access-card,
.login-layout {
  min-width: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.06),
    0 1px 2px -1px rgba(15, 23, 42, 0.08),
    0 16px 48px -34px rgba(15, 23, 42, 0.48);
}

.user-rail-summary {
  display: grid;
  gap: 3px;
  padding: 12px;
  background: #f8fafc;
}

.user-rail-summary span,
.module-head span,
.login-copy span {
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}

.user-rail-summary strong {
  color: #0f172a;
  font-size: 14px;
  font-weight: 760;
}

.user-rail-summary p {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
  text-wrap: pretty;
}

.access-card {
  padding: 18px;
}

.module-head {
  margin-bottom: 14px;
}

.module-head h2,
.login-copy h2 {
  margin: 3px 0 0;
  color: #020617;
  font-size: 20px;
  font-weight: 760;
  line-height: 1.2;
  text-wrap: balance;
}

.login-layout {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(320px, 520px);
  gap: 18px;
  align-items: start;
  max-width: 1040px;
  padding: 22px;
}

.login-copy {
  padding: 8px 4px;
}

.login-copy p {
  max-width: 520px;
  margin: 8px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
  text-wrap: pretty;
}

.login-panel {
  min-width: 0;
  border-radius: 8px;
  padding: 16px;
  background: #f8fafc;
}

.login-panel :deep(.center) {
  display: block;
  text-align: left;
}

.access-card :deep(.n-card),
.login-panel :deep(.n-card) {
  background: transparent;
}

@media (max-width: 820px) {
  .login-layout {
    grid-template-columns: 1fr;
    padding: 16px;
  }
}
</style>
