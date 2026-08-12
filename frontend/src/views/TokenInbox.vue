<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../api'
import AccessShell from '../components/AccessShell.vue'
import AccessMailWorkbench from '../components/AccessMailWorkbench.vue'

const route = useRoute()
const homePath = computed(() => '/')
const userPath = computed(() => '/user')
const message = useMessage()
const { t } = useScopedI18n('views.TokenInbox')

const shareJwt = ref('')
const address = ref('')
const label = ref('')
const errorText = ref('')
const resolving = ref(false)
const mailBoxKey = ref('')

const token = computed(() => {
  const rawToken = route.params.token
  return Array.isArray(rawToken) ? rawToken[0] : rawToken
})

const title = computed(() => label.value || address.value || t('mailbox'))
const identityLabel = computed(() => address.value || t('mailbox'))
const statusLabel = computed(() => {
  if (resolving.value) return t('verifying')
  if (errorText.value) return t('invalidLink')
  return shareJwt.value ? t('readOnlyShare') : t('awaitingVerification')
})
const statusTone = computed(() => errorText.value ? 'error' : (shareJwt.value ? 'success' : 'warning'))

const resolveToken = async () => {
  try {
    resolving.value = true
    errorText.value = ''
    shareJwt.value = ''
    address.value = ''
    label.value = ''
    const res = await api.fetch(`/open_api/share/${encodeURIComponent(token.value || '')}`)
    // A 2xx response carrying no `jwt` is not success. Without this the three
    // template branches (resolving / error / inbox) are all false and the page
    // renders an entirely blank pane with no explanation — reproducible whenever
    // something upstream answers 200 with the SPA shell instead of the API, e.g.
    // a misconfigured Pages BACKEND binding.
    if (!res?.jwt) throw new Error(t('invalidToken'))
    shareJwt.value = res.jwt
    address.value = res.address
    label.value = res.label || ''
    mailBoxKey.value = Date.now().toString()
  } catch (error) {
    errorText.value = error.message || t('invalidToken')
    message.error(errorText.value)
  } finally {
    resolving.value = false
  }
}

const fetchMailData = async (limit, offset) => {
  if (!shareJwt.value) return { results: [], count: 0 }
  return await api.fetch(`/api/mails?limit=${limit}&offset=${offset}`, {
    jwt: shareJwt.value,
  })
}

const updateMailReadState = async (curMailId, read = true) => {
  if (!shareJwt.value) return { success: false }
  return await api.fetch(`/api/mails/${curMailId}/read_state`, {
    method: 'PATCH',
    jwt: shareJwt.value,
    body: JSON.stringify({ read }),
  })
}

watch(token, resolveToken)

onMounted(resolveToken)
</script>

<template>
  <AccessShell
    :title="title"
    :kicker="t('shellKicker')"
    :brand-context="t('brandContext')"
    :identity-label="identityLabel"
    :identity-meta="t('identityMeta')"
    :status-label="statusLabel"
    :status-tone="statusTone"
  >
    <template #rail-footer>
      <div class="share-summary">
        <span>{{ t('accessMode') }}</span>
        <strong>Read only</strong>
        <p>{{ t('accessModeDesc') }}</p>
      </div>
    </template>

    <section v-if="resolving" class="token-state-card">
      <n-skeleton text :repeat="8" />
    </section>

    <section v-else-if="errorText" class="token-state-card is-error">
      <span>share token</span>
      <h2>{{ t('invalidToken') }}</h2>
      <p>{{ errorText }}</p>
      <div class="token-next-steps">
        <strong>{{ t('errorHint') }}</strong>
        <ul>
          <li>{{ t('errorHintAdmin') }}</li>
          <li>{{ t('errorHintUser') }}</li>
          <li>{{ t('errorHintTemporary') }}</li>
        </ul>
      </div>
      <div class="token-actions">
        <n-button tertiary type="primary" @click="resolveToken">{{ t('retryVerify') }}</n-button>
        <n-button tag="a" :href="userPath" tertiary>{{ t('goToUserPortal') }}</n-button>
        <n-button tag="a" :href="homePath" tertiary>{{ t('backToHome') }}</n-button>
      </div>
    </section>

    <AccessMailWorkbench
      v-else-if="shareJwt"
      :key="mailBoxKey"
      :title="t('mailbox')"
      :description="t('workbenchDescription')"
      :show-e-mail-to="false"
      :show-reply="false"
      :show-save-s3="false"
      :enable-user-delete-email="false"
      :fetch-mail-data="fetchMailData"
      :update-mail-read-state="updateMailReadState"
    />

    <!-- Belt and braces: even if some future state escapes the three branches
         above, the recipient sees an explanation and a way forward rather than
         an empty page. -->
    <section v-else class="token-state-card is-error">
      <h2>{{ t('invalidToken') }}</h2>
      <div class="token-actions">
        <n-button tertiary type="primary" @click="resolveToken">{{ t('retryVerify') }}</n-button>
        <n-button tag="a" :href="homePath" tertiary>{{ t('backToHome') }}</n-button>
      </div>
    </section>
  </AccessShell>
</template>

<style scoped>
.share-summary,
.token-state-card {
  min-width: 0;
  border-radius: 8px;
  background: var(--ets-surface);
  box-shadow: var(--ets-shadow-card);
}

.share-summary {
  display: grid;
  gap: 3px;
  padding: 12px;
  background: var(--ets-surface-alt);
}

.share-summary span,
.token-state-card span {
  color: var(--ets-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.share-summary strong {
  color: var(--ets-text);
  font-size: 14px;
  font-weight: 760;
}

.share-summary p,
.token-state-card p {
  margin: 0;
  color: var(--ets-text-muted);
  font-size: 12px;
  line-height: 1.45;
  text-wrap: pretty;
}

.token-state-card {
  display: grid;
  align-content: start;
  gap: 10px;
  width: min(720px, 100%);
  padding: 22px;
}

.token-state-card h2 {
  margin: 0;
  color: var(--ets-text-strong);
  font-size: 22px;
  font-weight: 760;
  line-height: 1.2;
  text-wrap: balance;
}

.token-state-card.is-error {
  background: var(--ets-danger-soft);
}

.token-next-steps {
  display: grid;
  gap: 8px;
  border-radius: 8px;
  padding: 12px;
  background: var(--ets-surface-alt);
}

.token-next-steps strong {
  color: var(--ets-danger);
  font-size: 14px;
}

.token-next-steps ul {
  margin: 0;
  padding-left: 18px;
  color: var(--ets-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.token-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
