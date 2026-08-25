<script setup>
import { NButton, NIcon, useMessage } from 'naive-ui'
import { KeyFilled } from '@vicons/material'
import { startAuthentication } from '@simplewebauthn/browser'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import { api } from '../../api'

const emit = defineEmits(['login-success'])

const { userJwt } = useGlobalState()
const message = useMessage()
const { t } = useScopedI18n('views.user.UserLogin')

const passkeyLogin = async () => {
    try {
        const options = await api.fetch(`/user_api/passkey/authenticate_request`, {
            method: 'POST',
            body: JSON.stringify({
                domain: location.hostname,
            })
        })
        const credential = await startAuthentication({ optionsJSON: options })

        // Send the result to the server
        const res = await api.fetch(`/user_api/passkey/authenticate_response`, {
            method: 'POST',
            body: JSON.stringify({
                origin: location.origin,
                credential
            })
        })
        userJwt.value = res.jwt
        message.success(t('loginSuccess'))
        emit('login-success', res.jwt)
    } catch (e) {
        console.error(e)
        message.error(e.message || 'Passkey 登录失败')
    }
}
</script>

<template>
    <n-button @click="passkeyLogin" type="primary" block secondary size="large" class="passkey-btn" strong>
        <template #icon>
            <n-icon :component="KeyFilled" />
        </template>
        {{ t('loginWithPasskey') || '使用 Passkey 登录' }}
    </n-button>
</template>

<style scoped>
.passkey-btn {
    height: 40px;
    border-radius: 8px;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--ets-border);
}

.passkey-btn:hover {
    background: rgba(255, 255, 255, 0.08);
}
</style>
