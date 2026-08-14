<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../api'
import { clearSessionStorageKeys } from '../utils/session'
import { useGlobalState } from '../store'
import AccessShell from '../components/AccessShell.vue'
import AccessMailWorkbench from '../components/AccessMailWorkbench.vue'
import ProductSurfaceLinks from '../components/ProductSurfaceLinks.vue'
import { getRouterPathWithLang } from '../utils'
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
  showAdminPage,
} = useGlobalState()

const { t, locale } = useScopedI18n('views.User')
const addressFilter = ref('')
const addressFilterOptions = ref([])
const addressesLoaded = ref(false)
const userOpenSettingsWarning = ref('')

const isSignedIn = computed(() => !!userSettings.value.user_email)
const roleLabel = computed(() => userSettings.value.user_role?.role || t('noRole'))
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

const shellTitle = computed(() => isSignedIn.value ? t('shellTitleSignedIn') : t('shellTitleGuest'))
const shellKicker = computed(() => isSignedIn.value ? t('shellKickerSignedIn') : t('shellKickerGuest'))
const surfaceItems = computed(() => [
  { id: 'home', label: t('home'), to: getRouterPathWithLang('/', locale.value) },
  ...(showAdminPage.value
    ? [{ id: 'admin', label: t('adminConsole'), to: getRouterPathWithLang('/admin', locale.value) }]
    : []),
])
const statusLabel = computed(() => {
  if (!userOpenSettings.value.fetched || !userSettings.value.fetched) return t('statusSyncing')
  return isSignedIn.value ? t('statusSignedIn') : t('statusNeedsSignIn')
})
const statusTone = computed(() => isSignedIn.value ? 'success' : 'warning')
const identityLabel = computed(() => isSignedIn.value ? userSettings.value.user_email : 'Email Transfer Station')
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

const logout = () => {
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
  }
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
    :brand-context="t('brandContext')"
    :identity-label="identityLabel"
    :identity-meta="identityMeta"
    :status-label="statusLabel"
    :status-tone="statusTone"
    :rail-items="railItems"
    :active-id="userTab"
    @select="userTab = $event"
  >
    <template #actions>
      <ProductSurfaceLinks :items="surfaceItems" :aria-label="t('surfaceLinksLabel')" />
      <n-button v-if="isSignedIn" tertiary @click="fetchAddressOptions">
        {{ t('refreshAddresses') }}
      </n-button>
      <n-button v-if="isSignedIn" tertiary type="error" @click="logout">
        {{ t('signOut') }}
      </n-button>
    </template>

    <template #rail-footer>
      <div v-if="isSignedIn" class="user-rail-summary">
        <span>{{ t('accessScope') }}</span>
        <strong>{{ t('addressCount', { count: addressFilterOptions.length || 0 }) }}</strong>
        <p>{{ openSettings.enableUserDeleteEmail ? t('deleteAllowed') : t('deleteRestricted') }}</p>
      </div>
    </template>

    <section v-if="!userSettings.fetched || !userOpenSettings.fetched" class="access-card">
      <n-skeleton text :repeat="8" />
    </section>

    <section v-else-if="!isSignedIn" class="login-layout">
      <div class="login-copy">
        <span>{{ t('loginKicker') }}</span>
        <h2>{{ t('loginHeading') }}</h2>
        <p>{{ t('loginDescription') }}</p>
        <p v-if="userOpenSettingsWarning" class="inline-warning">
          {{ t('localPreviewWarning') }}
        </p>
      </div>
      <div class="login-panel">
        <UserLogin />
      </div>
    </section>

    <AccessMailWorkbench
      v-else-if="userTab === 'user_mail_box_tab'"
      v-model:address-filter="addressFilter"
      :title="t('myInbox')"
      :description="t('inboxDescription')"
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
  background: var(--ets-surface);
  box-shadow: var(--ets-shadow-card);
}

.user-rail-summary {
  display: grid;
  gap: 3px;
  padding: 12px;
  background: var(--ets-surface-alt);
}

.user-rail-summary span,
.module-head span,
.login-copy span {
  color: var(--ets-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.user-rail-summary strong {
  color: var(--ets-text);
  font-size: 14px;
  font-weight: 760;
}

.user-rail-summary p {
  margin: 0;
  color: var(--ets-text-muted);
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
  color: var(--ets-text-strong);
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
  width: min(100%, 1040px);
  margin-inline: auto;
  padding: 22px;
}

.login-copy {
  padding: 8px 4px;
}

.login-copy p {
  max-width: 520px;
  margin: 8px 0 0;
  color: var(--ets-text-muted);
  font-size: 13px;
  line-height: 1.55;
  text-wrap: pretty;
}

.inline-warning {
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--ets-warn-soft);
  color: var(--ets-warn) !important;
  font-size: 13px !important;
}

.login-panel {
  min-width: 0;
  border-radius: 8px;
  padding: 16px;
  background: var(--ets-surface-alt);
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
