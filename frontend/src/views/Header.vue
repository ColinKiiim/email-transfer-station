<script setup>
import { ref, onMounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useHead } from '@unhead/vue'
import { NButton, NInput, NModal, useMessage, useNotification } from 'naive-ui'

import { useGlobalState } from '../store'
import { api } from '../api'
import { hashPassword } from '../utils'
import Turnstile from '../components/Turnstile.vue'
import AppTopbar from '../components/AppTopbar.vue'

const PRODUCT_TITLE = 'Email Transfer Station'

const message = useMessage()
const notification = useNotification()

const {
    showAuth, auth, loading, openSettings, userSettings
} = useGlobalState()
const { t } = useScopedI18n('views.Header')

const cfToken = ref('')
const turnstileRef = ref(null)

const authFunc = async () => {
    try {
        await api.fetch('/open_api/site_login', {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(auth.value),
                cf_token: cfToken.value
            })
        })
        location.reload()
    } catch (error) {
        message.error(error.message || "error")
        turnstileRef.value?.refresh?.()
    }
}

useHead({
    title: () => openSettings.value.title || PRODUCT_TITLE,
    meta: [
        { name: "description", content: openSettings.value.description || PRODUCT_TITLE },
    ]
})

onMounted(async () => {
    await api.getOpenSettings(message, notification)
    if (!userSettings.value.user_id) await api.getUserSettings(message)
})
</script>

<template>
    <div class="header-shell">
        <AppTopbar />
        <n-modal v-model:show="showAuth" :closable="false" :closeOnEsc="false" :maskClosable="false" preset="dialog"
            :title="t('accessHeader')">
            <n-input v-model:value="auth" type="password" show-password-on="click" @keyup.enter="authFunc" />
            <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
            <template #action>
                <n-button :loading="loading" @click="authFunc" type="primary">
                    {{ t('ok') }}
                </n-button>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
.header-shell {
    width: 100%;
    position: relative;
    z-index: 100;
}
</style>
