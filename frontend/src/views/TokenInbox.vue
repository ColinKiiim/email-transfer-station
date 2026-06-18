<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../api'
import MailBox from '../components/MailBox.vue'

const route = useRoute()
const message = useMessage()
const { t } = useScopedI18n('views.TokenInbox')

const shareJwt = ref('')
const address = ref('')
const label = ref('')
const errorText = ref('')
const mailBoxKey = ref('')

const token = computed(() => {
  const rawToken = route.params.token
  return Array.isArray(rawToken) ? rawToken[0] : rawToken
})

const resolveToken = async () => {
  try {
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
  }
}

const fetchMailData = async (limit, offset) => {
  if (!shareJwt.value) return { results: [], count: 0 }
  return await api.fetch(`/api/mails?limit=${limit}&offset=${offset}`, {
    jwt: shareJwt.value,
  })
}

watch(token, resolveToken)

onMounted(resolveToken)
</script>

<template>
  <main class="token-inbox">
    <n-card :bordered="false" embedded>
      <n-space vertical size="small">
        <n-text depth="3">{{ t('mailbox') }}</n-text>
        <n-h2 style="margin: 0;">
          {{ label || address || t('loading') }}
        </n-h2>
        <n-text v-if="address" depth="3">{{ address }}</n-text>
      </n-space>
    </n-card>

    <n-alert v-if="errorText" type="error" :bordered="false">
      {{ errorText }}
    </n-alert>

    <MailBox v-if="shareJwt" :key="mailBoxKey" :showEMailTo="false" :showReply="false"
      :showSaveS3="false" :enableUserDeleteEmail="false" :fetchMailData="fetchMailData"
      :showFilterInput="true" />
  </main>
</template>

<style scoped>
.token-inbox {
  display: grid;
  gap: 12px;
  padding: 16px;
}
</style>
