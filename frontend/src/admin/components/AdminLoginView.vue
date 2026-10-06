<script setup>
import { ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import AppTopbar from '../../components/AppTopbar.vue'
import AuthCardShell from '../../components/AuthCardShell.vue'
import ApplePasswordInput from '../../components/ApplePasswordInput.vue'
import Turnstile from '../../components/Turnstile.vue'

const { t } = useScopedI18n('admin.login')

const account = defineModel('account', { type: String, default: '' })
const password = defineModel('password', { type: String, default: '' })
const cfToken = defineModel('cfToken', { type: String, default: '' })

defineProps({
    loading: { type: Boolean, default: false },
    openSettings: { type: Object, required: true },
})

const emit = defineEmits(['submit'])
const turnstile = ref(null)

// The caller (useAdminSession) invokes `refresh`; expose both names so a
// rename on either side cannot silently disable the widget reset again.
defineExpose({
    refresh: () => turnstile.value?.refresh?.(),
    reset: () => turnstile.value?.refresh?.(),
})
</script>

<template>
    <section class="admin-next login-page" aria-labelledby="admin-auth-title">
        <AppTopbar />
        <div class="login-shell">
            <AuthCardShell :title="t('title')" title-id="admin-auth-title">
                <template #badge>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 2 3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="none" stroke="currentColor" stroke-width="2" />
                        <path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" />
                    </svg>
                </template>
                <form class="auth-form" @submit.prevent="emit('submit')">
                    <div class="auth-field">
                        <label class="auth-label" for="admin-account-input">{{ t('account') }}</label>
                        <input id="admin-account-input" v-model="account" class="auth-input" type="text" autocomplete="username"
                            autocapitalize="none" spellcheck="false" />
                    </div>
                    <div class="auth-field">
                        <label class="auth-label" for="admin-password-input">{{ t('password') }}</label>
                        <ApplePasswordInput id="admin-password-input" v-model="password" autocomplete="current-password" />
                    </div>
                    <Turnstile ref="turnstile" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
                    <button class="auth-submit-btn" type="submit" :disabled="loading">
                        {{ loading ? t('submitting') : t('submit') }}
                    </button>
                </form>
            </AuthCardShell>
        </div>
    </section>
</template>
