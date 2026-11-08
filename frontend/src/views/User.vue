<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../api'
import { clearSessionStorageKeys } from '../utils/session'
import { useGlobalState } from '../store'
import { useStorage } from '@vueuse/core'
import AppShell from '../components/AppShell.vue'
import AppUtilityMenu from '../components/AppUtilityMenu.vue'
import AccessMailWorkbench from '../components/AccessMailWorkbench.vue'
import ProductSurfaceLinks from '../components/ProductSurfaceLinks.vue'
import { getRouterPathWithLang } from '../utils'
import AddressMangement from './user/AddressManagement.vue'
import UserSettingsPage from './user/UserSettings.vue'
import UserAuthenticators from './user/UserAuthenticators.vue'
import BindAddress from './user/BindAddress.vue'
import UserLogin from './user/UserLogin.vue'
import AuthCardShell from '../components/AuthCardShell.vue'
import AppTopbar from '../components/AppTopbar.vue'

const message = useMessage()
const {
  userTab,
  userJwt,
  userSettings,
  userOpenSettings,
  openSettings,
  showAdminPage,
} = useGlobalState()

const { t, locale } = useScopedI18n('views.User')
const addressFilter = ref('')
const addressFilterOptions = ref([])
const addressesLoaded = ref(false)
const userOpenSettingsWarning = ref('')
const showLogoutConfirm = ref(false)
const logoutLoading = ref(false)

const isSignedIn = computed(() => !!userSettings.value.user_email)
const roleLabel = computed(() => userSettings.value.user_role?.role || t('noRole'))
const canCreateOrBindAddress = computed(() =>
  userSettings.value.is_admin
  || userSettings.value.can_bind_address === true
  || userSettings.value.can_create_address === true
)

const iconPaths = {
  mailbox: ['M4 6h16v12H4z', 'm4 7 8 6 8-6'],
  addresses: ['M4 7h16v10H4z', 'M8 11h5M8 14h8'],
  account: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  bind: ['M12 5v14M5 12h14'],
  lock: ['M6 10V8a6 6 0 0 1 12 0v2', 'M5 10h14v10H5z'],
}
const navGroups = computed(() => {
  if (!isSignedIn.value) return []
  return [
    {
      id: 'mail',
      label: t('navGroupMail'),
      items: [
        { id: 'user_mail_box_tab', label: t('user_mail_box_tab'), icon: iconPaths.mailbox },
        { id: 'address_management', label: t('address_management'), icon: iconPaths.addresses, badge: String(addressFilterOptions.value.length || '') },
        ...(canCreateOrBindAddress.value ? [{ id: 'bind_address', label: t('bind_address'), icon: iconPaths.bind }] : []),
      ],
    },
    {
      id: 'account',
      label: t('navGroupAccount'),
      items: [
        { id: 'user_settings', label: t('user_settings'), icon: iconPaths.account },
        { id: 'authenticators', label: t('authenticators'), icon: iconPaths.lock },
      ],
    },
  ]
})
const sidebarCollapsed = useStorage('ets-user-sidebar-collapsed', false)
const pageTitle = computed(() => t(userTab.value === 'bind_address' && !canCreateOrBindAddress.value ? 'address_management' : userTab.value))
const mailboxKey = ref(0)
const sync = async () => {
  await fetchAddressOptions()
  if (userTab.value === 'user_mail_box_tab') mailboxKey.value += 1
}
const surfaceItems = computed(() => [
  { id: 'home', label: t('home'), to: getRouterPathWithLang('/', locale.value) },
  ...(showAdminPage.value
    ? [{ id: 'admin', label: t('adminConsole'), to: getRouterPathWithLang('/admin', locale.value) }]
    : []),
])
const identityMeta = computed(() => {
  if (!isSignedIn.value) return t('identityMetaGuest')
  if (userSettings.value.is_admin) return t('identityMetaAdmin', { role: roleLabel.value })
  if (userSettings.value.can_create_address) return t('identityMetaCanCreate', { role: roleLabel.value })
  return t('identityMetaAssigned', { role: roleLabel.value })
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

const logout = async () => {
  try {
    await api.logoutAdminSession()
  } catch (error) {
    message.error(error.message || 'Logout failed')
    return
  }
  // Clear every credential, not just this surface's. The address JWT lives in
  // localStorage and used to survive a user-portal sign-out, leaving the next
  // person on a shared browser able to open the previous user's mailbox.
  clearSessionStorageKeys()
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
  // UserLogin renders its Turnstile challenge from openSettings
  // (cfTurnstileSiteKey / enableGlobalTurnstileCheck), which only
  // `/open_api/settings` fills. This surface never fetched it, so on an instance
  // with ENABLE_GLOBAL_TURNSTILE_CHECK on, the widget never rendered and the
  // worker rejected every sign-in — the user portal was unusable.
  if (!openSettings.value.fetched) {
    try {
      await api.getOpenSettings(message, { info: () => {} })
    } catch (error) {
      console.error(error)
    }
  }
  try {
    await api.getUserOpenSettings({ error: (text) => { userOpenSettingsWarning.value = text } })
  } catch (error) {
    userOpenSettingsWarning.value = error.message || t('openSettingsUnavailable')
    userOpenSettings.value.fetched = true
  }  if (userJwt.value && !userSettings.value.user_id) {
    await api.getUserSettings(message)
  } else if (!userSettings.value.fetched) {
    userSettings.value.fetched = true
  }
  if (isSignedIn.value && !addressesLoaded.value) await fetchAddressOptions()
})
</script>

<template>
  <div v-if="!isSignedIn" class="user-guest-page">
    <AppTopbar />
    <div class="user-guest-shell">
      <AuthCardShell :title="t('loginHeading')">
        <div class="login-panel">
          <UserLogin />
        </div>
      </AuthCardShell>
    </div>
  </div>

  <AppShell
    v-else
    class="user-shell"
    :nav-groups="navGroups"
    :active-id="userTab"
    :collapsed="sidebarCollapsed"
    :brand-context="t('brandContext')"
    :nav-label="t('mainNav')"
    :toggle-label="t('toggleSidebar')"
    @select="userTab = $event"
    @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
  >
    <template #actions>
      <ProductSurfaceLinks :items="surfaceItems" :aria-label="t('surfaceLinksLabel')" />
      <AppUtilityMenu />
      <div class="shell-divider" role="separator"></div>
      <button class="shell-btn is-bordered" type="button" :aria-label="t('sync')" @click="sync">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4" />
          <path d="M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" />
        </svg>
        <span class="shell-btn-label">{{ t('sync') }}</span>
      </button>
      <button class="shell-btn is-destructive" type="button" :aria-label="t('signOut')" @click="showLogoutConfirm = true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 17l-5-5 5-5M5 12h11" />
        </svg>
        <span class="shell-btn-label">{{ t('signOut') }}</span>
      </button>
    </template>

    <template #sidebar-footer>
      <div class="user-identity" :title="userSettings.user_email">
        <span class="user-identity-label">{{ t('signedInAs') }}</span>
        <strong>{{ userSettings.user_email }}</strong>
        <span>{{ identityMeta }}</span>
      </div>
    </template>

    <div v-if="!userSettings.fetched || !userOpenSettings.fetched" class="shell-page">
      <n-skeleton text :repeat="8" />
    </div>

    <AccessMailWorkbench
      v-else-if="userTab === 'user_mail_box_tab'"
      :key="mailboxKey"
      v-model:address-filter="addressFilter"
      :address-options="addressFilterOptions"
      :show-address-filter="true"
      :enable-user-delete-email="openSettings.enableUserDeleteEmail"
      :fetch-mail-data="fetchMailData"
      :delete-mail="deleteMail"
      :update-mail-read-state="updateMailReadState"
      :show-filter-input="true"
    />

    <template v-else>
      <div class="shell-toolbar">
        <h2 class="shell-toolbar-title">{{ pageTitle }}</h2>
      </div>
      <div class="shell-page">
        <div class="shell-page-narrow" :class="{ 'is-wide': userTab === 'address_management' }">
          <AddressMangement v-if="userTab === 'address_management'" />
          <UserSettingsPage v-else-if="userTab === 'user_settings'" />
          <UserAuthenticators v-else-if="userTab === 'authenticators'" />
          <BindAddress v-else-if="canCreateOrBindAddress" />
        </div>
      </div>
    </template>
  </AppShell>

    <n-modal v-model:show="showLogoutConfirm" preset="dialog" :title="t('signOut')">
      <p>{{ t('logoutConfirm') }}</p>
      <template #action>
        <n-space justify="end">
          <n-button size="small" tertiary @click="showLogoutConfirm = false">
            {{ t('cancel') }}
          </n-button>
          <n-button size="small" type="error" :loading="logoutLoading" @click="logout">
            {{ t('signOut') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
</template>

<style scoped>
.user-identity {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.user-identity strong {
  overflow: hidden;
  color: var(--ets-text);
  font-size: var(--text-callout);
  font-weight: 600;
  line-height: var(--text-callout-lh);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-identity-label {
  color: var(--ets-text-subtle);
}

.shell-page-narrow.is-wide {
  max-width: 1080px;
}

.inline-warning {
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
  background: var(--ets-warn-soft);
  color: var(--ets-warn) !important;
  font-size: 13px !important;
}

.login-panel {
  min-width: 0;
  background: transparent;
  padding: 0;
}

.login-panel :deep(.center) {
  display: block;
  text-align: left;
}

.access-card :deep(.n-card),
.login-panel :deep(.n-card) {
  background: transparent;
}

.user-guest-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  background: var(--ets-bg);
  overflow: hidden;
}

.user-guest-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
}
</style>
