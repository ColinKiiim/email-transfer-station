<script setup>
import { ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

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
        <div class="login-shell">
            <div class="login-brand" aria-hidden="true">
                <span class="brand-mark login-mark">
                    <svg viewBox="0 0 24 24">
                        <path d="M3.5 6.5h17v11h-17z" />
                        <path d="m4 7 8 6 8-6" />
                    </svg>
                </span>
                <span>Email Transfer Station</span>
            </div>
            <form class="login-card" @submit.prevent="emit('submit')">
                <div class="login-copy">
                    <h1 id="admin-auth-title">{{ t('title') }}</h1>
                </div>
                <div class="form-grid">
                    <label class="form-field full">
                        <span>{{ t('account') }}</span>
                        <input v-model="account" class="field" type="text" autocomplete="username"
                            autocapitalize="none" spellcheck="false" />
                    </label>
                    <label class="form-field full">
                        <span>{{ t('password') }}</span>
                        <input v-model="password" class="field" type="password" autocomplete="current-password" />
                    </label>
                </div>
                <Turnstile ref="turnstile" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
                <button class="btn primary login-submit" type="submit" :disabled="loading">
                    {{ loading ? t('submitting') : t('submit') }}
                </button>
            </form>
        </div>
    </section>
</template>
