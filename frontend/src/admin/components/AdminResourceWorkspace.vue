<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import { cellText, formatNumber, statusClass } from '../admin-formatters'
import AdminEmptyState from './AdminEmptyState.vue'

const props = defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t: tCol } = useScopedI18n('admin.column')
const { t } = useScopedI18n('admin.resource')

const activeMenuAddressId = ref(null)
const activeMenuDomainId = ref(null)
const activeMenuUserId = ref(null)

const toggleAddressMenu = (addressId) => {
    activeMenuDomainId.value = null
    activeMenuUserId.value = null
    activeMenuAddressId.value = activeMenuAddressId.value === addressId ? null : addressId
}

const closeAddressMenu = () => {
    activeMenuAddressId.value = null
}

const toggleDomainMenu = (domainId) => {
    activeMenuAddressId.value = null
    activeMenuUserId.value = null
    activeMenuDomainId.value = activeMenuDomainId.value === domainId ? null : domainId
}

const closeDomainMenu = () => {
    activeMenuDomainId.value = null
}

const toggleUserMenu = (userId) => {
    activeMenuAddressId.value = null
    activeMenuDomainId.value = null
    activeMenuUserId.value = activeMenuUserId.value === userId ? null : userId
}

const closeUserMenu = () => {
    activeMenuUserId.value = null
}

const closeAllMenus = () => {
    activeMenuAddressId.value = null
    activeMenuDomainId.value = null
    activeMenuUserId.value = null
}

const handleDocumentClick = (event) => {
    if ((activeMenuAddressId.value !== null || activeMenuDomainId.value !== null || activeMenuUserId.value !== null) && !event.target?.closest?.('.action-dropdown')) {
        closeAllMenus()
    }
}

const handleDocumentKeydown = (event) => {
    if (event.key === 'Escape' && (activeMenuAddressId.value !== null || activeMenuDomainId.value !== null || activeMenuUserId.value !== null)) {
        closeAllMenus()
    }
}

onMounted(() => {
    window.addEventListener('click', handleDocumentClick)
    window.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('click', handleDocumentClick)
    window.removeEventListener('keydown', handleDocumentKeydown)
})

const recentMails = computed(() => {
    return (props.model.mailRows || []).slice(0, 6)
})

const addressDomainStats = computed(() => {
    const counts = {}
    for (const row of props.model.addressRows || []) {
        const domain = row.domain || (row.address?.includes('@') ? row.address.split('@')[1] : '')
        if (domain) {
            counts[domain] = (counts[domain] || 0) + 1
        }
    }
    return Object.keys(counts).sort().map((domain) => ({
        domain,
        count: counts[domain],
    }))
})

const scrollToChannels = (event) => {
    const el = document.getElementById('delivery-channels')
    if (el) {
        event?.preventDefault?.()
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
}

const isPrimaryPanel = (panel) => (
    panel.id === 'addresses' ||
    panel.id === 'domains' ||
    panel.id === 'channels' ||
    panel.id === 'users' ||
    panel.id === 'shares' ||
    panel.id === 'ops'
)
</script>

<template>
    <div v-if="model.activeView === 'overview'" class="overview-dashboard" :aria-label="t('overviewAria')">
        <!-- 4 High Impact KPI & Navigation Cards -->
        <div class="overview-grid">
            <button type="button" class="overview-card card-flow" @click="actions.setView('flow')">
                <div class="card-top">
                    <span class="card-kicker">{{ t('flowKicker') }}</span>
                    <span class="card-badge" :class="{ 'is-unread': model.explicitUnreadMailCount > 0 }">
                        {{ t('unreadCount', { count: formatNumber(model.explicitUnreadMailCount) }) }}
                    </span>
                </div>
                <div class="card-main">
                    <strong class="card-value">{{ formatNumber(model.mailRows.length) }}</strong>
                    <span class="card-unit">{{ t('mailUnit') }}</span>
                </div>
                <div class="card-action">
                    <span>{{ t('openFlow') }} &rarr;</span>
                </div>
            </button>

            <button type="button" class="overview-card" @click="actions.setView('routing')">
                <div class="card-top">
                    <span class="card-kicker">{{ t('routingKicker') }}</span>
                </div>
                <div class="card-main">
                    <strong class="card-value">{{ formatNumber(model.domainRows.length) }}</strong>
                    <span class="card-unit">{{ t('domainUnit') }}</span>
                </div>
                <div class="card-action">
                    <span>{{ t('manageDomains') }} &rarr;</span>
                </div>
            </button>

            <button type="button" class="overview-card" @click="actions.setView('identity')">
                <div class="card-top">
                    <span class="card-kicker">{{ t('identityKicker') }}</span>
                </div>
                <div class="card-main">
                    <strong class="card-value">{{ formatNumber(model.addressRows.length) }}</strong>
                    <span class="card-unit">{{ t('addressUnit') }}</span>
                </div>
                <div class="card-action">
                    <span>{{ t('manageAddressesOverview') }} &rarr;</span>
                </div>
            </button>

            <button type="button" class="overview-card" @click="actions.setView('ops')">
                <div class="card-top">
                    <span class="card-kicker">{{ t('opsKicker') }}</span>
                    <span class="badge" :class="model.blockingLoadErrors.length ? 'badge-danger' : 'badge-ok'">
                        <span class="badge-dot" />
                        <span>{{ model.blockingLoadErrors.length ? t('needsReview') : model.workerStatusLabel }}</span>
                    </span>
                </div>
                <div class="card-main">
                    <strong class="card-value mono">{{ model.dbVersionLabel }}</strong>
                    <span class="card-unit">{{ t('dbVersionUnit') }}</span>
                </div>
                <div class="card-action">
                    <span>{{ t('viewOps') }} &rarr;</span>
                </div>
            </button>
        </div>

        <!-- Lower Section: Recent Inbound Stream & Runtime Health -->
        <div class="overview-sections">
            <section class="panel overview-stream-panel">
                <div class="panel-head">
                    <div>
                        <h2>{{ t('recentActivity') }}</h2>
                    </div>
                    <button class="btn small" type="button" @click="actions.setView('flow')">
                        {{ t('openFlow') }}
                    </button>
                </div>
                <div class="table-wrap">
                    <table v-if="recentMails.length">
                        <thead>
                            <tr>
                                <th>{{ t('tableTime') }}</th>
                                <th>{{ t('tableSender') }}</th>
                                <th>{{ t('tableRecipient') }}</th>
                                <th>{{ t('tableSubject') }}</th>
                                <th class="text-right">{{ t('tableStatus') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="mail in recentMails" :key="mail.id" tabindex="0"
                                @click="actions.selectRow('flow', mail.id)">
                                <td class="time-text">{{ mail.time }}</td>
                                <td class="mono cell-truncate" :title="mail.sender">{{ mail.sender || '-' }}</td>
                                <td><strong>{{ mail.to || '-' }}</strong></td>
                                <td class="cell-truncate">{{ mail.subject || t('noSubject') }}</td>
                                <td class="text-right">
                                    <span class="badge" :class="'badge-' + (statusClass(mail.resultTone || mail.result))">
                                        <span class="badge-dot" aria-hidden="true" />
                                        <span>{{ mail.result || t('statusReceived') }}</span>
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="empty-pad">
                        <p class="text-muted">{{ t('noRecentLogs') }}</p>
                    </div>
                </div>
            </section>

            <section class="panel overview-health-panel">
                <div class="panel-head">
                    <div>
                        <h2>{{ t('systemHealth') }}</h2>
                        <p>{{ t('systemHealthDesc') }}</p>
                    </div>
                </div>
                <div class="inner-pad">
                    <dl class="kv-grid">
                        <div class="kv-item">
                            <dt>{{ t('workerStatus') }}</dt>
                            <dd>
                                <span class="badge badge-ok">
                                    <span class="badge-dot" />
                                    <span>{{ model.workerStatusLabel }}</span>
                                </span>
                            </dd>
                        </div>
                        <div class="kv-item">
                            <dt>{{ t('d1Database') }}</dt>
                            <dd>
                                <span class="badge mono badge-ok">
                                    <span>DB_VERSION {{ model.dbVersionLabel }}</span>
                                </span>
                            </dd>
                        </div>
                        <div class="kv-item">
                            <dt>{{ t('totalDomains') }}</dt>
                            <dd><strong>{{ model.domainRows.length }} {{ t('domainUnit') }}</strong></dd>
                        </div>
                        <div class="kv-item">
                            <dt>{{ t('totalAddresses') }}</dt>
                            <dd><strong>{{ model.addressRows.length }} {{ t('addressUnit') }}</strong></dd>
                        </div>
                        <div class="kv-item">
                            <dt>{{ t('inboundNotify') }}</dt>
                            <dd>
                                <span class="badge" :class="model.mailWebhook?.enabled ? 'badge-ok' : 'badge-neutral'">
                                    <span>{{ model.mailWebhook?.enabled ? t('statusEnabled') : t('statusDisabled') }}</span>
                                </span>
                            </dd>
                        </div>
                        <div class="kv-item">
                            <dt>{{ t('lastSyncTime') }}</dt>
                            <dd class="mono text-muted">{{ model.lastSynced || t('realtimeSync') }}</dd>
                        </div>
                    </dl>
                </div>
            </section>
        </div>
    </div>

    <!-- Regular Resource View Grid -->
    <div v-else class="view-grid">
        <section v-for="panel in model.activePanels" :key="panel.id" class="panel"
            :id="model.activeView === 'delivery' && panel.id === 'channels' ? 'delivery-channels' : undefined"
            :class="[panel.layout, `panel-${panel.id}`]">
            <!-- Primary Panel Toolbar: Standard 48px height across all views -->
            <div v-if="isPrimaryPanel(panel)" class="workspace-toolbar">
                <div class="toolbar-left">
                    <!-- Address-specific domain filters using unified filter-chip -->
                    <div v-if="panel.id === 'addresses'" class="filter-chips">
                        <button type="button" class="filter-chip"
                            :class="{ 'is-active': !model.ui.domain || model.ui.domain === 'all' }"
                            :aria-pressed="!model.ui.domain || model.ui.domain === 'all' ? 'true' : 'false'"
                            @click="actions.setFilterDomain('all')">
                            <span>{{ t('allFilter') }}</span>
                            <b class="chip-count">{{ model.addressRows.length }}</b>
                        </button>
                        <button v-for="domainOpt in addressDomainStats" :key="domainOpt.domain"
                            type="button" class="filter-chip"
                            :class="{ 'is-active': model.ui.domain === domainOpt.domain }"
                            :aria-pressed="model.ui.domain === domainOpt.domain ? 'true' : 'false'"
                            @click="actions.setFilterDomain(domainOpt.domain)">
                            <span class="chip-at">@</span>
                            <span>{{ domainOpt.domain }}</span>
                            <b class="chip-count">{{ domainOpt.count }}</b>
                        </button>
                    </div>

                    <!-- Domains summary counter -->
                    <div v-else-if="panel.id === 'domains'" class="toolbar-counter">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" x2="22" y1="12" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        <span>{{ t('countDomains', { count: panel.rows ? panel.rows.length : 0 }) }}</span>
                    </div>

                    <!-- Channels summary counter -->
                    <div v-else-if="panel.id === 'channels'" class="toolbar-counter">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="m22 2-7 20-4-9-9-4Z" />
                            <path d="M22 2 11 13" />
                        </svg>
                        <span>{{ t('countChannels', { count: panel.rows ? panel.rows.length : 0 }) }}</span>
                    </div>

                    <!-- Users summary counter -->
                    <div v-else-if="panel.id === 'users'" class="toolbar-counter">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>{{ t('countUsers', { count: panel.rows ? panel.rows.length : 0 }) }}</span>
                    </div>

                    <!-- Shares summary counter -->
                    <div v-else-if="panel.id === 'shares'" class="toolbar-counter">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect width="18" height="18" x="3" y="3" rx="2" />
                            <path d="M7 7h.01" />
                            <path d="M17 7h.01" />
                            <path d="M7 17h.01" />
                            <path d="M17 17h.01" />
                        </svg>
                        <span>{{ t('countShares', { count: panel.rows ? panel.rows.length : 0 }) }}</span>
                    </div>

                    <!-- Ops summary counter -->
                    <div v-else-if="panel.id === 'ops'" class="toolbar-counter">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        <span>{{ t('countComponents', { count: panel.rows ? panel.rows.length : 0 }) }}</span>
                    </div>
                </div>

                <div class="panel-head-actions">
                    <button v-if="panel.id === 'addresses'" class="btn small primary" type="button"
                        :disabled="!!model.actionBusy" @click="actions.openActionModal('new-address')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>{{ t('newAddress') }}</span>
                    </button>
                    <button v-else-if="panel.id === 'domains'" class="btn small primary" type="button"
                        :disabled="!!model.actionBusy" @click="actions.handleAction('new-domain')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>{{ t('newDomain') }}</span>
                    </button>
                    <button v-else-if="panel.id === 'channels'" class="btn small" type="button"
                        :disabled="!!model.actionBusy" @click="actions.handleAction('refresh')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                            <path d="M16 21h5v-5" />
                        </svg>
                        <span>{{ t('refreshChannels') }}</span>
                    </button>
                    <button v-else-if="panel.id === 'users'" class="btn small primary" type="button"
                        :disabled="!!model.actionBusy" @click="actions.openActionModal('new-user')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>{{ t('newUser') }}</span>
                    </button>
                    <button v-else-if="panel.id === 'shares'" class="btn small primary" type="button"
                        :disabled="!!model.actionBusy" @click="actions.openActionModal('share-package')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>{{ t('generateAccessPackage') }}</span>
                    </button>
                    <button v-else-if="panel.id === 'ops'" class="btn small" type="button"
                        :disabled="!!model.actionBusy" @click="actions.handleAction('health-check')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                        <span>{{ t('healthCheck') }}</span>
                    </button>
                </div>
            </div>

            <!-- Ops Runtime Boundary Strip -->
            <div v-if="panel.id === 'ops' && model.opsBoundaryItems?.length" class="ops-boundary-strip" :aria-label="t('systemHealth')">
                <div v-for="item in model.opsBoundaryItems" :key="item.label" class="ops-boundary-item">
                    <span>{{ item.label }}</span>
                    <strong class="status" :class="statusClass(item.value)">{{ item.value }}</strong>
                </div>
            </div>

            <!-- Secondary section header for subordinate panels -->
            <div v-else-if="!isPrimaryPanel(panel)" class="panel-section-head">
                <div class="panel-head-title">
                    <h3>{{ panel.title }}</h3>
                    <span v-if="panel.rows && panel.rows.length" class="panel-badge-count">{{ panel.rows.length }}</span>
                </div>
            </div>

            <div class="table-wrap">
                <table :class="['resource-table', `table-${panel.id}`]">
                    <caption class="sr-only">{{ t('tableCaption', { title: panel.title }) }}</caption>
                    <thead>
                        <tr>
                            <th v-for="column in panel.columns" :key="column.labelKey"
                                :class="[
                                    `col-${column.key || column.main || column.type}`,
                                    {
                                        num: column.type === 'number',
                                        'text-right': column.type === 'number' || column.type === 'domainActions' || column.type === 'userActions' || column.type === 'addressActions' || column.type === 'shareActions',
                                        'text-center': column.type === 'status'
                                    }
                                ]">
                                {{ tCol(column.labelKey) }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in panel.rows" :key="row.id" tabindex="0"
                            :aria-selected="actions.isSelected(panel.kind, row)"
                            :class="{ 'is-selected': actions.isSelected(panel.kind, row) }"
                            @click="actions.selectRow(panel.kind, row.id)"
                            @keydown="actions.handleRowKey($event, panel.kind, row)">
                            <td v-for="column in panel.columns" :key="column.labelKey"
                                :class="[
                                    `col-${column.key || column.main || column.type}`,
                                    {
                                        num: column.type === 'number',
                                        'text-right': column.type === 'number' || column.type === 'domainActions' || column.type === 'userActions' || column.type === 'addressActions' || column.type === 'shareActions',
                                        'text-center': column.type === 'status'
                                    }
                                ]">
                                <template v-if="column.type === 'entity'">
                                    <div class="cell-main">
                                        <strong>{{ cellText(row, column.main) }}</strong>
                                        <span v-if="row[column.sub]" class="cell-sub">{{ cellText(row, column.sub) }}</span>
                                        <span v-if="column.tags && row[column.tags]?.length" class="tag-row">
                                            <span v-for="tag in row[column.tags]" :key="tag" class="tag">{{ tag }}</span>
                                        </span>
                                    </div>
                                </template>

                                <span v-else-if="column.type === 'status'" class="badge"
                                    :class="[
                                        'badge-' + (statusClass(row[`${column.key}Tone`] || row[column.key])),
                                        { 'badge-dotless': column.key === 'credential' || (column.key === 'password' && (row[`${column.key}Tone`] === 'neutral' || !row[`${column.key}Tone`])) }
                                    ]">
                                    <span v-if="!(column.key === 'credential' || (column.key === 'password' && (row[`${column.key}Tone`] === 'neutral' || !row[`${column.key}Tone`])))" class="badge-dot" aria-hidden="true" />
                                    <span>{{ cellText(row, column.key) }}</span>
                                </span>

                                <div v-else-if="column.type === 'userActions'" class="row-actions user-actions cell-actions" @click.stop>
                                    <button class="btn-action primary" type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleUserRowAction(row, 'user-addresses')" :title="t('manageAddresses')">
                                        {{ t('manageAddresses') }}
                                    </button>
                                    <div class="action-dropdown" :class="{ 'is-open': activeMenuUserId === row.id }">
                                        <button class="btn-action btn-action-more" type="button"
                                            :aria-expanded="activeMenuUserId === row.id ? 'true' : 'false'"
                                            aria-haspopup="menu"
                                            :aria-label="t('moreActions')"
                                            :title="t('moreActions')"
                                            @click.stop="toggleUserMenu(row.id)">
                                            {{ t('more') }}
                                            <span class="dropdown-arrow" aria-hidden="true">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </span>
                                        </button>
                                        <div v-show="activeMenuUserId === row.id" class="action-dropdown-menu" role="menu"
                                            :aria-label="t('moreActions')">
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('resetPassword')"
                                                @click="actions.handleUserRowAction(row, 'reset-password'); closeUserMenu()">
                                                {{ t('resetPassword') }}
                                            </button>
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('editRole')"
                                                @click="actions.handleUserRowAction(row, 'edit-role'); closeUserMenu()">
                                                {{ t('editRole') }}
                                            </button>
                                            <button class="action-menu-item danger" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('deleteUser')"
                                                @click="actions.handleUserRowAction(row, 'delete'); closeUserMenu()">
                                                {{ t('delete') }}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div v-else-if="column.type === 'addressActions'" class="row-actions address-actions cell-actions" @click.stop>
                                    <button class="btn-action primary" type="button" @click="actions.openMailFromAddress(row.address)"
                                        :title="t('viewMail')" :aria-label="t('viewMail')">
                                        {{ t('viewMail') }}
                                    </button>
                                    <button class="btn-action" type="button" @click="actions.copyText(row.address)"
                                        :title="t('copy')" :aria-label="t('copy')">
                                        {{ t('copy') }}
                                    </button>
                                    <div class="action-dropdown" :class="{ 'is-open': activeMenuAddressId === row.id }">
                                        <button class="btn-action btn-action-more" type="button"
                                            :aria-expanded="activeMenuAddressId === row.id ? 'true' : 'false'"
                                            aria-haspopup="menu"
                                            :aria-label="t('moreActions')"
                                            :title="t('moreActions')"
                                            @click.stop="toggleAddressMenu(row.id)">
                                            {{ t('more') }}
                                            <span class="dropdown-arrow" aria-hidden="true">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </span>
                                        </button>
                                        <div v-show="activeMenuAddressId === row.id" class="action-dropdown-menu" role="menu"
                                            :aria-label="t('moreActions')">
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('showCredential')"
                                                :aria-label="t('showCredential')"
                                                @click="actions.handleAddressRowAction(row, 'show-credential'); closeAddressMenu()">
                                                {{ t('showCredential') }}
                                            </button>
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('rotateCredential')"
                                                :aria-label="t('rotateCredential')"
                                                @click="actions.handleAddressRowAction(row, 'rotate'); closeAddressMenu()">
                                                {{ t('rotateCredential') }}
                                            </button>
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('share')"
                                                :aria-label="t('share')"
                                                @click="actions.openSharePackage(row); closeAddressMenu()">
                                                {{ t('share') }}
                                            </button>
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !row.mails || !!model.actionBusy"
                                                :title="t('clearInbox')"
                                                :aria-label="t('clearInbox')"
                                                @click="actions.handleAddressRowAction(row, 'clear-inbox'); closeAddressMenu()">
                                                {{ t('clearInbox') }}
                                            </button>
                                            <button class="action-menu-item danger" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('deleteAddress')"
                                                :aria-label="t('deleteAddress')"
                                                @click="actions.handleAddressRowAction(row, 'delete-address'); closeAddressMenu()">
                                                {{ t('delete') }}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div v-else-if="column.type === 'shareActions'" class="row-actions share-actions cell-actions" @click.stop>
                                    <button class="btn-action" type="button" @click="actions.copyText(row.path)">
                                        {{ t('copy') }}
                                    </button>
                                </div>

                                <div v-else-if="column.type === 'domainActions'" class="row-actions domain-actions cell-actions" @click.stop>
                                    <div class="action-dropdown" :class="{ 'is-open': activeMenuDomainId === row.id }">
                                        <button class="btn-action btn-action-more" type="button"
                                            :aria-expanded="activeMenuDomainId === row.id ? 'true' : 'false'"
                                            aria-haspopup="menu"
                                            :aria-label="t('moreActions')"
                                            :title="t('moreActions')"
                                            @click.stop="toggleDomainMenu(row.id)">
                                            {{ t('more') }}
                                            <span class="dropdown-arrow" aria-hidden="true">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </span>
                                        </button>
                                        <div v-show="activeMenuDomainId === row.id" class="action-dropdown-menu" role="menu"
                                            :aria-label="t('moreActions')">
                                            <button v-if="row.receiveMode === 'cloudflare_email'" class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('autoSetup')"
                                                :aria-label="t('autoSetup')"
                                                @click="actions.handleDomainRowAction(row, 'cloudflare-setup'); closeDomainMenu()">
                                                {{ t('autoSetup') }}
                                            </button>
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('startVerify')"
                                                :aria-label="t('startVerify')"
                                                @click="actions.handleDomainRowAction(row, 'verify-start'); closeDomainMenu()">
                                                {{ t('startVerify') }}
                                            </button>
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !row.verificationAddress || !!model.actionBusy"
                                                :title="t('checkVerify')"
                                                :aria-label="t('checkVerify')"
                                                @click="actions.handleDomainRowAction(row, 'verify-check'); closeDomainMenu()">
                                                {{ t('checkVerify') }}
                                            </button>
                                            <button class="action-menu-item" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('checkRouting')"
                                                :aria-label="t('checkRouting')"
                                                @click="actions.handleDomainRowAction(row, 'verify'); closeDomainMenu()">
                                                {{ t('checkRouting') }}
                                            </button>
                                            <button v-if="row.isEnabled" class="action-menu-item danger" role="menuitem" type="button"
                                                :disabled="!row.sourceId || !!model.actionBusy"
                                                :title="t('disable')"
                                                :aria-label="t('disable')"
                                                @click="actions.handleDomainRowAction(row, 'domain-disable'); closeDomainMenu()">
                                                {{ t('disable') }}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <strong v-else-if="column.type === 'strong'">{{ cellText(row, column.key) }}</strong>
                                <span v-else-if="column.type === 'time'" class="time-text mono">{{ cellText(row, column.key) }}</span>
                                <span v-else-if="column.type === 'mono'" class="mono"
                                    :title="cellText(row, column.key)">{{ cellText(row, column.key) }}</span>
                                <span v-else-if="column.type === 'number'">
                                    {{ Number.isFinite(Number(row[column.key])) ? formatNumber(row[column.key]) : '-' }}
                                </span>
                                <span v-else-if="panel.kind === 'ops' && column.key === 'action'" class="ops-action-hint">
                                    {{ cellText(row, column.key) }}
                                </span>
                                <span v-else>{{ cellText(row, column.key) }}</span>
                            </td>
                        </tr>
                        <tr v-if="panel.rows.length === 0">
                            <td :colspan="panel.columns.length">
                                <AdminEmptyState v-if="model.hasActiveFilters" :action-label="t('clearFilters')"
                                    @action="actions.handleAction('reset-filters')" />
                                <AdminEmptyState v-else-if="model.activeView === 'delivery' && (panel.id === 'sender' || panel.id === 'sendbox')"
                                    :description="panel.id === 'sender' ? t('emptySenderDesc') : t('emptySendboxDesc')">
                                    <template #extra>
                                        <a href="#delivery-channels" class="empty-guide-link" @click="scrollToChannels">
                                            {{ t('configureChannelsLink') }} &rarr;
                                        </a>
                                    </template>
                                </AdminEmptyState>
                                <AdminEmptyState v-else />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section v-if="model.activeView === 'routing'" class="panel split panel-routing-check">
            <div class="panel-section-head">
                <div class="panel-head-title">
                    <h3>{{ t('configCheck') }}</h3>
                </div>
            </div>
            <div class="inner-pad timeline">
                <div v-for="item in model.routingActivationRows" :key="item.code" class="timeline-row">
                    <span class="mono">{{ item.code }}</span>
                    <strong>{{ item.title }}</strong>
                    <span class="badge" :class="'badge-' + (item.tone || 'neutral')">
                        <span class="badge-dot" />
                        <span>{{ item.state }}</span>
                    </span>
                </div>
            </div>
        </section>

        <section v-if="model.activeView === 'delivery'" class="panel">
            <div class="panel-section-head">
                <div class="panel-head-title">
                    <h3>{{ t('contentProcessing') }}</h3>
                </div>
            </div>
            <div class="inner-pad">
                <dl class="kv-grid">
                    <div class="kv-item">
                        <dt>{{ t('aiExtract') }}</dt>
                        <dd><span class="badge badge-neutral"><span class="badge-dot" />{{ t('aiExtractValue') }}</span></dd>
                    </div>
                    <div class="kv-item">
                        <dt>{{ t('htmlPreview') }}</dt>
                        <dd><span class="badge badge-ok"><span class="badge-dot" />{{ t('htmlPreviewValue') }}</span></dd>
                    </div>
                    <div class="kv-item">
                        <dt>{{ t('attachmentTransfer') }}</dt>
                        <dd><span class="badge badge-neutral"><span class="badge-dot" />{{ t('attachmentTransferValue') }}</span></dd>
                    </div>
                    <div class="kv-item">
                        <dt>{{ t('autoReply') }}</dt>
                        <dd><span class="badge badge-neutral"><span class="badge-dot" />{{ t('autoReplyValue') }}</span></dd>
                    </div>
                </dl>
            </div>
        </section>
    </div>
</template>
