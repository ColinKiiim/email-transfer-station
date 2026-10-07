<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { adminApi } from '../admin-api'
import AdminEmptyState from './AdminEmptyState.vue'

const props = defineProps({
    requestConfirm: { type: Function, required: true },
    copyText: { type: Function, required: true },
})

const { t } = useScopedI18n('admin.authenticators')
const { t: tRes } = useScopedI18n('admin.resource')

const rows = ref([])
const users = ref([])
const input = ref('')
const label = ref('')
const expiry = ref('')
const selectedUsers = ref({})
const assignments = ref({})
const busy = ref('')
const error = ref('')
const isCreating = ref(false)
const activeMenuId = ref(null)

let timer
let refreshing = false
const shares = ref({})

const toggleMenu = (rowId) => {
    activeMenuId.value = activeMenuId.value === rowId ? null : rowId
}

const closeMenu = () => {
    activeMenuId.value = null
}

const handleDocumentClick = (event) => {
    if (activeMenuId.value !== null && !event.target?.closest?.('.action-dropdown')) {
        closeMenu()
    }
}

const handleDocumentKeydown = (event) => {
    if (event.key === 'Escape' && activeMenuId.value !== null) {
        closeMenu()
    }
}

const load = async () => {
    const [items, userResult] = await Promise.all([adminApi.listAuthenticators(), adminApi.listUsers({ limit: 100 })])
    rows.value = items.results || []
    users.value = userResult.results || []
}

const run = async (key, task) => {
    busy.value = key
    error.value = ''
    try {
        await task()
        await load()
    } catch (reason) {
        error.value = reason?.message || t('failed')
    } finally {
        busy.value = ''
    }
}

const create = () => run('create', async () => {
    if (!input.value.trim()) return
    await adminApi.createAuthenticator({ input: input.value, label: label.value })
    input.value = ''
    label.value = ''
    expiry.value = ''
    isCreating.value = false
})

const remove = async (row) => {
    if (!await props.requestConfirm({ tone: 'danger', title: t('deleteTitle'), message: t('deleteConfirm', { label: row.label }) })) return
    await run(`delete-${row.id}`, () => adminApi.deleteAuthenticator(row.id))
}

const assign = (row) => {
    const userId = Number(selectedUsers.value[row.id])
    if (userId) return run(`assign-${row.id}`, () => adminApi.assignAuthenticator(row.id, userId))
}

const showAssignments = async (row) => {
    try {
        const result = await adminApi.listAuthenticatorAssignments(row.id)
        assignments.value[row.id] = result.results || []
    } catch (reason) {
        error.value = reason?.message || t('failed')
    }
}

const unassign = (row, user) => run(`unassign-${row.id}-${user.id}`, async () => {
    await adminApi.unassignAuthenticator(row.id, user.id)
    await showAssignments(row)
})

const showShares = async (row) => {
    try {
        const result = await adminApi.listAuthenticatorShares(row.id)
        shares.value[row.id] = result.results || []
    } catch (reason) {
        error.value = reason?.message || t('failed')
    }
}

const revokeShare = (row, link) => run(`revoke-${link.id}`, async () => {
    await adminApi.revokeAuthenticatorShare(row.id, link.id)
    await showShares(row)
    if (assignments.value[row.id]) await showAssignments(row)
})

const share = (row) => run(`share-${row.id}`, async () => {
    const result = await adminApi.createAuthenticatorShare(row.id, expiry.value ? new Date(expiry.value).toISOString() : null)
    await props.copyText(`${location.origin}/a/${result.token}`)
    if (shares.value[row.id]) await showShares(row)
})

const labelForUser = (user) => user.display_name || user.username || user.user_email

onMounted(() => {
    load().catch((reason) => { error.value = reason?.message || t('failed') })
    window.addEventListener('click', handleDocumentClick)
    window.addEventListener('keydown', handleDocumentKeydown)
    timer = window.setInterval(async () => {
        if (!busy.value && !refreshing && rows.value.some((row) => row.valid_until <= Date.now())) {
            refreshing = true
            try {
                const result = await adminApi.listAuthenticators()
                rows.value = result.results || []
            } catch (reason) {
                rows.value = []
                error.value = reason?.message || t('failed')
            } finally {
                refreshing = false
            }
        }
    }, 1000)
})

onBeforeUnmount(() => {
    window.removeEventListener('click', handleDocumentClick)
    window.removeEventListener('keydown', handleDocumentKeydown)
    window.clearInterval(timer)
})
</script>

<template>
    <section class="authenticator-admin panel">
        <!-- Standard 48px Workspace Toolbar -->
        <div class="workspace-toolbar">
            <div class="domain-filter-bar">
                <button type="button" class="domain-filter-pill is-active">
                    {{ tRes('allFilter') }} ({{ rows.length }})
                </button>
            </div>
            <div class="panel-head-actions">
                <button class="btn small primary" type="button" :disabled="!!busy"
                    @click="isCreating = !isCreating">
                    {{ isCreating ? ('- ' + t('cancel')) : ('+ ' + t('create')) }}
                </button>
            </div>
        </div>

        <!-- Collapsible Creation Panel -->
        <div v-if="isCreating" class="auth-create-panel">
            <form class="create-grid" @submit.prevent="create">
                <label>
                    <span>{{ t('label') }}</span>
                    <input v-model="label" :placeholder="t('labelPlaceholder')" />
                </label>
                <label>
                    <span>{{ t('secret') }}</span>
                    <input v-model="input" :placeholder="t('secretPlaceholder')" autocomplete="off" required />
                </label>
                <label class="expiry">
                    <span>{{ t('shareExpiry') }}</span>
                    <input v-model="expiry" type="datetime-local" />
                </label>
                <div class="create-actions">
                    <button class="btn small" type="button" @click="isCreating = false">
                        {{ t('cancel') }}
                    </button>
                    <button class="btn small primary" type="submit" :disabled="!!busy || !input.trim()">
                        {{ t('create') }}
                    </button>
                </div>
            </form>
        </div>

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <!-- Empty state or Items list -->
        <div v-if="!rows.length" class="empty-pad">
            <AdminEmptyState :title="t('empty')" />
        </div>
        <ul v-else class="items">
            <li v-for="row in rows" :key="row.id" class="item">
                <div class="identity">
                    <strong>{{ row.label }}</strong>
                    <span>{{ row.issuer || t('noIssuer') }}</span>
                </div>
                <button class="code" type="button" :aria-label="t('copyCode')" @click="props.copyText(row.code)">
                    {{ row.code.slice(0, 3) }} {{ row.code.slice(3) }}
                </button>
                <span class="meta">
                    {{ t('assigned', { count: row.assigned_count }) }} · {{ t('shared', { count: row.share_count }) }}
                </span>
                <div class="assign">
                    <select v-model="selectedUsers[row.id]" :aria-label="t('selectUser')">
                        <option value="">{{ t('selectUser') }}</option>
                        <option v-for="user in users" :key="user.id" :value="user.id">{{ labelForUser(user) }}</option>
                    </select>
                    <button class="btn-action primary" type="button" :disabled="!!busy || !selectedUsers[row.id]" @click="assign(row)">
                        {{ t('assign') }}
                    </button>
                </div>
                <div class="actions">
                    <button class="btn-action" type="button" :disabled="!!busy" @click="share(row)">
                        {{ t('share') }}
                    </button>
                    <div class="action-dropdown" :class="{ 'is-open': activeMenuId === row.id }">
                        <button class="btn-action btn-action-more" type="button"
                            :aria-expanded="activeMenuId === row.id ? 'true' : 'false'"
                            aria-haspopup="menu"
                            :aria-label="tRes('moreActions')"
                            :title="tRes('moreActions')"
                            @click.stop="toggleMenu(row.id)">
                            {{ tRes('more') }}
                            <span class="dropdown-arrow" aria-hidden="true">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </span>
                        </button>
                        <div v-show="activeMenuId === row.id" class="action-dropdown-menu" role="menu" :aria-label="tRes('moreActions')">
                            <button class="action-menu-item" role="menuitem" type="button" :disabled="!!busy"
                                @click="showAssignments(row); closeMenu()">
                                {{ t('viewAssignments') }}
                            </button>
                            <button class="action-menu-item" role="menuitem" type="button" :disabled="!!busy"
                                @click="showShares(row); closeMenu()">
                                {{ t('viewLinks') }}
                            </button>
                            <button class="action-menu-item danger" role="menuitem" type="button" :disabled="!!busy"
                                @click="remove(row); closeMenu()">
                                {{ t('delete') }}
                            </button>
                        </div>
                    </div>
                </div>
                <ul v-if="assignments[row.id]" class="assignment-list">
                    <li v-for="user in assignments[row.id]" :key="user.id">
                        <span>{{ labelForUser(user) }}</span>
                        <button class="btn-action danger" type="button" :disabled="!!busy" @click="unassign(row, user)">
                            {{ t('unassign') }}
                        </button>
                    </li>
                    <li v-if="!assignments[row.id].length">{{ t('noAssignments') }}</li>
                </ul>
                <ul v-if="shares[row.id]" class="assignment-list">
                    <li v-for="link in shares[row.id]" :key="link.id">
                        <span>{{ link.created_at }} · {{ link.expires_at || t('noExpiry') }}</span>
                        <button class="btn-action danger" type="button" :disabled="!!busy" @click="revokeShare(row, link)">
                            {{ t('revoke') }}
                        </button>
                    </li>
                    <li v-if="!shares[row.id].length">{{ t('noLinks') }}</li>
                </ul>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.authenticator-admin {
    display: flex;
    flex-direction: column;
    padding: 0;
    box-sizing: border-box;
    background: var(--surface);
    border-radius: var(--radius-sm, 8px);
    overflow: visible;
}

.auth-create-panel {
    padding: 14px 18px;
    background: var(--surface-soft);
    border-bottom: 1px solid var(--border);
    box-sizing: border-box;
}

.create-grid {
    display: grid;
    grid-template-columns: 1fr 2fr 180px auto;
    gap: 12px;
    align-items: end;
}

.create-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

label {
    display: grid;
    gap: 5px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
}

input,
select {
    min-width: 0;
    height: 32px;
    min-height: 32px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 6px);
    padding: 0 10px;
    color: var(--fg);
    background: var(--surface);
    font-size: 13px;
    box-sizing: border-box;
    transition: border-color 120ms ease;
}

input:focus,
select:focus {
    outline: none;
    border-color: var(--accent);
}

.empty-pad {
    padding: 32px 18px;
}

.meta,
.identity span {
    color: var(--muted);
    font-size: 12px;
}

.items,
.assignment-list {
    display: grid;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 16px 18px;
    box-sizing: border-box;
}

.item {
    display: grid;
    grid-template-columns: minmax(130px, 1.2fr) auto auto minmax(200px, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 8px);
    background: var(--surface);
    transition: background-color 120ms ease;
}

.item:hover {
    background: var(--surface-soft);
}

.identity strong {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
}

.identity span {
    display: block;
    margin-top: 2px;
}

.code {
    font: 600 16px ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
    letter-spacing: 2px;
    color: var(--accent);
    border: 1px solid var(--border);
    background: var(--surface-soft);
    cursor: pointer;
    padding: 4px 10px;
    border-radius: var(--radius-sm, 6px);
    transition: all 120ms ease;
}

.code:hover {
    background: var(--accent-soft, color-mix(in srgb, var(--accent) 12%, transparent));
    border-color: var(--accent);
}

.assign,
.actions {
    display: flex;
    gap: 6px;
    align-items: center;
}

.assign select {
    flex: 1;
}

.assignment-list {
    grid-column: 1 / -1;
    padding: 8px 12px;
    background: var(--surface-soft);
    border-radius: var(--radius-sm, 6px);
    margin-top: 4px;
}

.assignment-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--muted);
    font-size: 12px;
}

.error {
    color: var(--danger);
    padding: 8px 18px;
    margin: 0;
    font-size: 13px;
}

@media (max-width: 900px) {
    .create-grid {
        grid-template-columns: 1fr;
    }
    .item {
        grid-template-columns: 1fr auto;
    }
    .meta,
    .assign,
    .actions {
        grid-column: 1 / -1;
    }
    .actions {
        justify-content: flex-end;
    }
}
</style>
