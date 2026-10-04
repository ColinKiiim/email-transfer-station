<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'

const { t } = useScopedI18n('views.user.UserAuthenticators')
const message = useMessage(); const rows = ref([]); const input = ref(''); const label = ref(''); const expiry = ref(''); const loading = ref(false); const now = ref(Date.now()); let timer
const load = async () => { const data = await api.fetch('/user_api/authenticators'); rows.value = data.results || []; now.value = data.server_time || Date.now() }
const remaining = row => Math.max(0, Math.ceil(((row.valid_until || now.value + row.period * 1000) - now.value) / 1000))
const add = async () => { if (!input.value.trim()) return; loading.value = true; try { await api.fetch('/user_api/authenticators', { method:'POST', body:JSON.stringify({ input:input.value, label:label.value }) }); input.value=''; label.value=''; await load(); message.success(t('saved')) } catch (error) { message.error(error.message || t('failed')) } finally { loading.value=false } }
const remove = async row => { try { await api.fetch(`/user_api/authenticators/${encodeURIComponent(row.id)}`, { method:'DELETE', body:JSON.stringify({ confirm:true }) }); await load() } catch (error) { message.error(error.message || t('failed')) } }
const share = async row => { const data = await api.fetch(`/user_api/authenticators/${encodeURIComponent(row.id)}/shares`, { method:'POST', body:JSON.stringify({ expires_at:expiry.value || null }) }); await navigator.clipboard.writeText(`${location.origin}/a/${data.token}`); message.success(t('linkCopied')) }
const copy = async value => { await navigator.clipboard.writeText(value); message.success(t('copied')) }
onMounted(async () => { try { await load() } catch (error) { message.error(error.message) }; timer = window.setInterval(() => { now.value = Date.now() }, 1000) }); onBeforeUnmount(() => window.clearInterval(timer))
</script>
<template>
  <div class="authenticator-panel">
    <p class="hint">{{ t('description') }}</p>
    <div class="add-grid">
      <label><span>{{ t('label') }}</span><input v-model="label" :placeholder="t('labelPlaceholder')" /></label>
      <label><span>{{ t('secretOrUri') }}</span><input v-model="input" :placeholder="t('secretPlaceholder')" autocomplete="off" /></label>
      <button type="button" :disabled="loading || !input.trim()" @click="add">{{ t('add') }}</button>
    </div>
    <label class="expiry"><span>{{ t('shareExpiry') }}</span><input v-model="expiry" type="datetime-local" /></label>
    <div v-if="!rows.length" class="empty">{{ t('empty') }}</div>
    <ul v-else class="items" aria-live="polite"><li v-for="row in rows" :key="row.id" class="item"><div><strong>{{ row.label }}</strong><small>{{ row.issuer || t('noIssuer') }}</small></div><button type="button" class="code" :aria-label="t('copyCode')" @click="copy(row.code)">{{ row.code.slice(0,3) }} {{ row.code.slice(3) }}</button><span class="count">{{ remaining(row) }}s</span><button type="button" @click="share(row)">{{ t('share') }}</button><n-popconfirm :positive-text="t('delete')" :negative-text="t('cancel')" @positive-click="remove(row)"><template #trigger><button type="button" class="danger">{{ t('delete') }}</button></template>{{ t('deleteConfirm') }}</n-popconfirm></li></ul>
  </div>
</template>
<style scoped>
.authenticator-panel{display:grid;gap:16px}.hint,.empty{color:var(--ets-text-muted);margin:0}.add-grid{display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end}label{display:grid;gap:5px;color:var(--ets-text-muted);font-size:12px;font-weight:650}input{min-width:0;border:1px solid var(--ets-border);border-radius:7px;padding:10px;color:var(--ets-text);background:rgba(255,255,255,.04)}button{border:1px solid var(--ets-border);border-radius:7px;padding:10px 13px;color:var(--ets-text);background:var(--ets-surface-alt);cursor:pointer}button:hover:not(:disabled),button:focus-visible{border-color:#60a5fa;outline:2px solid transparent}button:disabled{opacity:.5;cursor:not-allowed}.expiry{max-width:280px}.items{display:grid;gap:8px;list-style:none;padding:0;margin:0}.item{display:grid;grid-template-columns:minmax(110px,1fr) auto auto auto auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--ets-border);border-radius:8px;background:var(--ets-surface-alt)}.item strong,.item small{display:block}.item small{color:var(--ets-text-muted);margin-top:3px}.code{font:700 19px ui-monospace,monospace;letter-spacing:2px;color:#93c5fd}.count{color:var(--ets-text-muted);min-width:32px}.danger{color:#fca5a5}@media(max-width:700px){.add-grid{grid-template-columns:1fr}.item{grid-template-columns:1fr auto auto}.item button:not(.code){grid-row:3}}
</style>
