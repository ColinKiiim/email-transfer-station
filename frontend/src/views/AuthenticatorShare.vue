<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../api'

const route = useRoute()
const { t } = useScopedI18n('views.AuthenticatorShare')
const message = useMessage()
const item = ref(null)
const expiresAt = ref('')
const now = ref(Date.now())
let timer = null
let refreshRequest = null
let disposed = false

const token = computed(() => Array.isArray(route.params.token) ? route.params.token[0] : route.params.token)
const remaining = computed(() => item.value ? Math.max(0, Math.ceil(((item.value.valid_until || now.value) - now.value) / 1000)) : 0)

const handleVisibilityChange = () => {
    if (document.hidden) return
    now.value = Date.now()
    if (item.value && remaining.value <= 0 && !refreshRequest) {
        refresh()
    }
}

const load = () => {
    if (refreshRequest) return refreshRequest
    refreshRequest = api.fetch('/open_api/authenticator_share', {
        method: 'POST',
        body: JSON.stringify({ token: token.value })
    }).then((data) => {
        if (disposed) return
        item.value = data.item
        expiresAt.value = data.expires_at || ''
    }).finally(() => { refreshRequest = null })
    return refreshRequest
}

const refresh = () => load().catch((error) => {
    if (disposed) return
    item.value = null
    message.error(error.message || t('invalid'))
})

const copy = async () => {
    if (!item.value?.code) return
    await navigator.clipboard.writeText(item.value.code)
    message.success(t('copied'))
}

const save = async () => {
    try {
        await api.fetch('/user_api/authenticators/save-share', {
            method: 'POST',
            body: JSON.stringify({ token: token.value })
        })
        message.success(t('saved'))
    } catch (error) {
        message.error(error.message || 'Error')
    }
}

onMounted(() => {
    timer = window.setInterval(handleVisibilityChange, 1000)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    refresh()
})

onBeforeUnmount(() => {
    disposed = true
    if (timer) window.clearInterval(timer)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
    <main class="share-page">
        <section v-if="item" class="share-card">
            <p class="share-kicker">{{ t('kicker') }}</p>
            <h1 class="share-title">{{ item.label }}</h1>
            <span class="share-issuer" v-if="item.issuer">{{ item.issuer }}</span>
            <div class="code-box" role="button" tabindex="0" @click="copy" @keydown.enter="copy" :title="t('copied') ? 'Click to copy' : 'Copy'">
                <div class="code-row">
                    <span class="code-digits">{{ item.code.slice(0, 3) }} {{ item.code.slice(3) }}</span>
                    <svg class="copy-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </div>
                <span class="code-countdown">{{ remaining }}s</span>
            </div>
            <div class="share-actions">
                <n-button type="primary" block @click="save">
                    {{ t('save') }}
                </n-button>
            </div>
            <em v-if="expiresAt" class="share-expiry">{{ t('expires') }} {{ expiresAt }}</em>
        </section>
        <section v-else class="share-card error-card">
            <n-result status="warning" :title="t('invalid')" />
        </section>
    </main>
</template>

<style scoped>
.share-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--ets-bg, #f9fafb);
    color: var(--ets-text, #374151);
}

.share-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    width: min(100%, 420px);
    padding: 32px 28px;
    border: 1px solid var(--ets-border, #e5e7eb);
    border-radius: var(--ets-radius-lg, 12px);
    background: var(--ets-surface-card, #ffffff);
    text-align: center;
    box-shadow: var(--ets-shadow-card, 0 10px 25px -5px rgba(0, 0, 0, 0.1));
}

.share-kicker {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ets-brand, #2563eb);
    font-weight: 600;
    margin: 0;
}

.share-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--ets-text-strong, #111827);
    margin: 0;
}

.share-issuer {
    font-size: 13.5px;
    color: var(--ets-text-muted, #6b7280);
}

.code-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 18px 12px;
    background: var(--ets-surface-alt, #f3f4f6);
    border: 1px solid var(--ets-border, #e5e7eb);
    border-radius: var(--ets-radius-md, 8px);
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s;
    user-select: none;
}

.code-box:hover {
    border-color: var(--ets-brand, #2563eb);
    background: var(--ets-brand-soft, #eff6ff);
}

.code-digits {
    font-family: var(--ets-font-mono, monospace);
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 4px;
    color: var(--ets-brand, #2563eb);
}

.code-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.copy-icon {
    color: var(--ets-brand, #2563eb);
    opacity: 0.45;
    transition: opacity 0.15s ease, transform 0.15s ease;
    flex-shrink: 0;
}

.code-box:hover .copy-icon {
    opacity: 1;
    transform: scale(1.15);
}

.code-countdown {
    font-size: 12px;
    color: var(--ets-text-muted, #6b7280);
    font-variant-numeric: tabular-nums;
}

.share-actions {
    width: 100%;
    margin-top: 6px;
}

.share-expiry {
    font-size: 12px;
    color: var(--ets-text-muted, #9ca3af);
    font-style: normal;
}
</style>
