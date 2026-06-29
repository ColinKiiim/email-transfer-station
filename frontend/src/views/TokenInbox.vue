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
const identityLabel = computed(() => address.value || '共享收件箱')
const statusLabel = computed(() => {
  if (resolving.value) return '验证中'
  if (errorText.value) return '无效链接'
  return shareJwt.value ? '只读分享' : '等待验证'
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
    kicker="shared mailbox access"
    :identity-label="identityLabel"
    identity-meta="通过分享 token 只读访问"
    :status-label="statusLabel"
    :status-tone="statusTone"
  >
    <template #rail-footer>
      <div class="share-summary">
        <span>访问模式</span>
        <strong>Read only</strong>
        <p>可阅读邮件和附件；不能删除、发送或管理地址。</p>
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
        <strong>这个分享链接可能已经过期、被撤销，或复制不完整。</strong>
        <ul>
          <li>请确认链接来自地址管理员。</li>
          <li>如果你本来拥有账号，可以进入用户入口查看已绑定地址。</li>
          <li>如果这是临时协作链接，请让分享者重新生成访问包。</li>
        </ul>
      </div>
      <div class="token-actions">
        <n-button tertiary type="primary" @click="resolveToken">重新验证</n-button>
        <n-button tag="a" :href="userPath" tertiary>进入用户入口</n-button>
        <n-button tag="a" :href="homePath" tertiary>返回首页</n-button>
      </div>
    </section>

    <AccessMailWorkbench
      v-else-if="shareJwt"
      :key="mailBoxKey"
      title="共享收件箱"
      description="这是只读访问视图，风格与管理台一致，但不会暴露地址管理或写入操作。"
      :show-e-mail-to="false"
      :show-reply="false"
      :show-save-s3="false"
      :enable-user-delete-email="false"
      :fetch-mail-data="fetchMailData"
      :update-mail-read-state="updateMailReadState"
    />
  </AccessShell>
</template>

<style scoped>
.share-summary,
.token-state-card {
  min-width: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.06),
    0 1px 2px -1px rgba(15, 23, 42, 0.08),
    0 16px 48px -34px rgba(15, 23, 42, 0.48);
}

.share-summary {
  display: grid;
  gap: 3px;
  padding: 12px;
  background: #f8fafc;
}

.share-summary span,
.token-state-card span {
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}

.share-summary strong {
  color: #0f172a;
  font-size: 14px;
  font-weight: 760;
}

.share-summary p,
.token-state-card p {
  margin: 0;
  color: #64748b;
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
  color: #020617;
  font-size: 22px;
  font-weight: 760;
  line-height: 1.2;
  text-wrap: balance;
}

.token-state-card.is-error {
  background: #fff7f7;
}

.token-next-steps {
  display: grid;
  gap: 8px;
  border-radius: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.72);
}

.token-next-steps strong {
  color: #991b1b;
  font-size: 14px;
}

.token-next-steps ul {
  margin: 0;
  padding-left: 18px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
}

.token-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
