<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'

const { t } = useScopedI18n('views.user.UserAuthenticators')
const message = useMessage(); const rows = ref([]); const now = ref(Date.now()); let timer; let refreshing = false
const load = async () => { const data = await api.fetch('/user_api/authenticators'); rows.value = data.results || []; now.value = data.server_time || Date.now() }
const remaining = row => Math.max(0, Math.ceil(((row.valid_until || now.value + row.period * 1000) - now.value) / 1000))
const remove = async row => { try { await api.fetch(`/user_api/authenticators/${encodeURIComponent(row.id)}`, { method:'DELETE', body:JSON.stringify({ confirm:true }) }); await load() } catch (error) { message.error(error.message || t('failed')) } }
const copy = async value => { try { await navigator.clipboard.writeText(value); message.success(t('copied')) } catch (error) { message.error(error.message || t('failed')) } }
onMounted(async () => { try { await load() } catch (error) { message.error(error.message) }; timer = window.setInterval(async () => { now.value = Date.now(); if (!refreshing && rows.value.some(row => remaining(row) === 0)) { refreshing = true; try { await load() } catch (error) { rows.value = []; message.error(error.message || t('failed')) } finally { refreshing = false } } }, 1000) }); onBeforeUnmount(() => window.clearInterval(timer))
</script>
<template>
  <div class="authenticator-panel">
    <p class="hint">{{ t('description') }}</p>
    <div v-if="!rows.length" class="empty">{{ t('empty') }}</div>
    <ul v-else class="items" aria-live="polite"><li v-for="row in rows" :key="row.id" class="item"><div><strong>{{ row.label }}</strong><small>{{ row.issuer || t('noIssuer') }}</small></div><button type="button" class="code" :aria-label="t('copyCode')" @click="copy(row.code)">{{ row.code.slice(0,3) }} {{ row.code.slice(3) }}</button><span class="count">{{ remaining(row) }}s</span><n-popconfirm :positive-text="t('delete')" :negative-text="t('cancel')" @positive-click="remove(row)"><template #trigger><button type="button" class="danger">{{ t('delete') }}</button></template>{{ t('deleteConfirm') }}</n-popconfirm></li></ul>
  </div>
</template>
<style scoped>
.authenticator-panel{display:grid;gap:16px}.hint,.empty{color:var(--ets-text-muted);margin:0}button{border:1px solid var(--ets-border);border-radius:7px;padding:10px 13px;color:var(--ets-text);background:var(--ets-surface-alt);cursor:pointer}button:hover:not(:disabled),button:focus-visible{border-color:#60a5fa;outline:2px solid transparent}.items{display:grid;gap:8px;list-style:none;padding:0;margin:0}.item{display:grid;grid-template-columns:minmax(110px,1fr) auto auto auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--ets-border);border-radius:8px;background:var(--ets-surface-alt)}.item strong,.item small{display:block}.item small{color:var(--ets-text-muted);margin-top:3px}.code{font:700 19px ui-monospace,monospace;letter-spacing:2px;color:#93c5fd}.count{color:var(--ets-text-muted);min-width:32px}.danger{color:#fca5a5}@media(max-width:700px){.item{grid-template-columns:1fr auto auto}.item button:not(.code){grid-row:3}}
</style>
