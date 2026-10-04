<script setup>
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { adminApi } from '../admin-api'

const props = defineProps({
    requestConfirm: { type: Function, required: true },
    copyText: { type: Function, required: true },
})
const { t } = useScopedI18n('admin.authenticators')
const rows = ref([]); const users = ref([]); const input = ref(''); const label = ref(''); const expiry = ref(''); const selectedUsers = ref({}); const assignments = ref({}); const busy = ref(''); const error = ref('')

const load = async () => {
    const [items, userResult] = await Promise.all([adminApi.listAuthenticators(), adminApi.listUsers({ limit: 100 })])
    rows.value = items.results || []; users.value = userResult.results || []
}
const run = async (key, task) => { busy.value = key; error.value = ''; try { await task(); await load() } catch (reason) { error.value = reason?.message || t('failed') } finally { busy.value = '' } }
const create = () => run('create', async () => { if (!input.value.trim()) return; await adminApi.createAuthenticator({ input: input.value, label: label.value }); input.value = ''; label.value = '' })
const remove = async row => { if (!await props.requestConfirm({ tone: 'danger', title: t('deleteTitle'), message: t('deleteConfirm', { label: row.label }) })) return; await run(`delete-${row.id}`, () => adminApi.deleteAuthenticator(row.id)) }
const assign = row => { const userId = Number(selectedUsers.value[row.id]); if (userId) return run(`assign-${row.id}`, () => adminApi.assignAuthenticator(row.id, userId)) }
const showAssignments = async row => { const result = await adminApi.listAuthenticatorAssignments(row.id); assignments.value[row.id] = result.results || [] }
const share = row => run(`share-${row.id}`, async () => { const result = await adminApi.createAuthenticatorShare(row.id, expiry.value); await props.copyText(`${location.origin}/a/${result.token}`) })
const labelForUser = user => user.display_name || user.username || user.user_email
onMounted(() => load().catch(reason => { error.value = reason?.message || t('failed') }))
</script>

<template>
    <section class="authenticator-admin panel">
        <div class="panel-head">
            <div class="panel-head-title"><h2>{{ t('title') }}</h2><p>{{ t('description') }}</p></div>
        </div>
        <form class="create-grid" @submit.prevent="create">
            <label><span>{{ t('label') }}</span><input v-model="label" :placeholder="t('labelPlaceholder')" /></label>
            <label><span>{{ t('secret') }}</span><input v-model="input" :placeholder="t('secretPlaceholder')" autocomplete="off" required /></label>
            <button class="btn small primary" type="submit" :disabled="!!busy || !input.trim()">{{ t('create') }}</button>
        </form>
        <label class="expiry"><span>{{ t('shareExpiry') }}</span><input v-model="expiry" type="datetime-local" /></label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div v-if="!rows.length" class="empty">{{ t('empty') }}</div>
        <ul v-else class="items">
            <li v-for="row in rows" :key="row.id" class="item">
                <div class="identity"><strong>{{ row.label }}</strong><span>{{ row.issuer || t('noIssuer') }}</span></div>
                <button class="code" type="button" :aria-label="t('copyCode')" @click="props.copyText(row.code)">{{ row.code.slice(0, 3) }} {{ row.code.slice(3) }}</button>
                <span class="meta">{{ t('assigned', { count: row.assigned_count }) }} · {{ t('shared', { count: row.share_count }) }}</span>
                <div class="assign"><select v-model="selectedUsers[row.id]" :aria-label="t('selectUser')"><option value="">{{ t('selectUser') }}</option><option v-for="user in users" :key="user.id" :value="user.id">{{ labelForUser(user) }}</option></select><button class="btn-action" type="button" :disabled="!!busy || !selectedUsers[row.id]" @click="assign(row)">{{ t('assign') }}</button></div>
                <div class="actions"><button class="btn-action" type="button" :disabled="!!busy" @click="showAssignments(row)">{{ t('viewAssignments') }}</button><button class="btn-action" type="button" :disabled="!!busy" @click="share(row)">{{ t('share') }}</button><button class="btn-action danger" type="button" :disabled="!!busy" @click="remove(row)">{{ t('delete') }}</button></div>
                <ul v-if="assignments[row.id]" class="assignment-list"><li v-for="user in assignments[row.id]" :key="user.id"><span>{{ labelForUser(user) }}</span><button class="btn-action danger" type="button" @click="run(`unassign-${row.id}-${user.id}`, () => adminApi.unassignAuthenticator(row.id, user.id))">{{ t('unassign') }}</button></li><li v-if="!assignments[row.id].length">{{ t('noAssignments') }}</li></ul>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.authenticator-admin{display:grid;gap:16px}.panel-head-title p,.empty,.meta,.identity span{color:var(--ets-text-muted)}.create-grid{display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end}label{display:grid;gap:5px;color:var(--ets-text-muted);font-size:12px;font-weight:650}input,select{min-width:0;border:1px solid var(--ets-border);border-radius:7px;padding:10px;color:var(--ets-text);background:var(--ets-surface-alt)}.expiry{max-width:280px}.items,.assignment-list{display:grid;gap:8px;list-style:none;margin:0;padding:0}.item{display:grid;grid-template-columns:minmax(130px,1fr) auto auto minmax(220px,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--ets-border);border-radius:8px;background:var(--ets-surface-alt)}.identity strong,.identity span{display:block}.code{font:700 18px ui-monospace,monospace;letter-spacing:2px;color:#93c5fd;border:0;background:none;cursor:pointer}.assign,.actions{display:flex;gap:6px;align-items:center}.assign select{flex:1}.btn-action{border:1px solid var(--ets-border);border-radius:6px;padding:7px 9px;color:var(--ets-text);background:transparent;cursor:pointer}.btn-action:hover,.btn-action:focus-visible{border-color:#60a5fa}.danger{color:#fca5a5}.assignment-list{grid-column:1/-1;padding-top:8px;border-top:1px solid var(--ets-border)}.assignment-list li{display:flex;justify-content:space-between;align-items:center;color:var(--ets-text-muted)}.error{color:#fca5a5}@media(max-width:900px){.create-grid{grid-template-columns:1fr}.item{grid-template-columns:1fr auto}.meta,.assign,.actions{grid-column:1/-1}.actions{justify-content:flex-end}}
</style>
