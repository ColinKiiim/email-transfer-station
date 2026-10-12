<script setup>
import { Transition, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import MailContentRenderer from '../../components/MailContentRenderer.vue'
import { formatNumber, statusClass } from '../admin-formatters'
import AdminEmptyState from './AdminEmptyState.vue'
import AdminDomainDropdown from './AdminDomainDropdown.vue'
import AdminRefreshButton from './AdminRefreshButton.vue'

const props = defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t } = useScopedI18n('admin.mailView')
const mailList = ref(null)
const showSelectMenu = ref(false)
const selectDropdownRef = ref(null)
const headerCheckboxRef = ref(null)

const syncHeaderCheckbox = () => {
    if (headerCheckboxRef.value) {
        headerCheckboxRef.value.checked = Boolean(props.model.isAllVisibleSelected)
        headerCheckboxRef.value.indeterminate = Boolean(props.model.isSomeVisibleSelected)
    }
}

watch(
    [() => props.model.isAllVisibleSelected, () => props.model.isSomeVisibleSelected],
    () => {
        syncHeaderCheckbox()
    },
    { flush: 'post' }
)

const getSenderInitial = (sender) => {
    if (!sender) return '✉'
    const clean = String(sender).replace(/^["'<]|["'>]$/g, '').trim()
    const first = clean.charAt(0)
    return first.toUpperCase() || '✉'
}

const hasActiveMailFilters = computed(() => {
    return (props.model.ui.status && props.model.ui.status !== 'all') ||
           (props.model.ui.domain && props.model.ui.domain !== 'all') ||
           (props.model.ui.address && props.model.ui.address !== 'all')
})

const clearAllMailFilters = () => {
    props.actions.setMailStatus?.('all')
    props.actions.setMailDomain?.('all')
    props.actions.setMailAddress?.('all')
    if (props.actions.handleAction) {
        props.actions.handleAction('reset-filters')
    }
}

const handleClickOutside = (e) => {
    if (selectDropdownRef.value && !selectDropdownRef.value.contains(e.target)) {
        showSelectMenu.value = false
    }
}

const handleSelectAllToggle = () => {
    if (props.model.isAllVisibleSelected || props.model.isSomeVisibleSelected || props.model.selectedMailCount > 0) {
        if (props.actions.clearMailSelection) {
            props.actions.clearMailSelection()
        } else {
            props.actions.selectAllVisibleMails('none')
        }
    } else {
        props.actions.selectAllVisibleMails('all')
    }
    nextTick(syncHeaderCheckbox)
}

const handleSelectOption = (mode) => {
    props.actions.selectAllVisibleMails(mode)
    showSelectMenu.value = false
    nextTick(syncHeaderCheckbox)
}

const rangeLabel = computed(() => {
    const filteredCount = props.model.filteredMailRows?.length || 0
    if (!filteredCount) {
        return t('rangeEmpty') || '0 / 0'
    }
    const page = props.model.mailPage || 1
    const pageSize = props.model.mailPageSize || 25
    const start = (page - 1) * pageSize + 1
    const end = Math.min(page * pageSize, filteredCount)
    const loadedCount = props.model.mailRowCount ?? props.model.mailRows?.length ?? filteredCount
    const totalCount = props.model.mailTotalCount

    if (totalCount != null && totalCount > loadedCount) {
        if (props.model.hasActiveFilters) {
            return t('rangeLabelFilteredLoaded', { start, end, loadedMatches: filteredCount, total: totalCount })
        }
        return t('rangeLabelLoaded', { start, end, loaded: loadedCount, total: totalCount })
    }
    return t('rangeLabel', { start, end, total: filteredCount })
})

const handleRowMouseEnter = (row) => {
    props.actions.schedulePrefetchMail?.(row)
}

const handleRowMouseLeave = (event, row) => {
    const current = event.currentTarget || event.target
    if (event.relatedTarget && current?.contains?.(event.relatedTarget)) return
    props.actions.cancelPrefetchMail?.(row)
}

const handleRowFocusIn = (event, row) => {
    const current = event.currentTarget || event.target
    if (event.relatedTarget && current?.contains?.(event.relatedTarget)) return
    props.actions.schedulePrefetchMail?.(row)
}

const handleRowFocusOut = (event, row) => {
    const current = event.currentTarget || event.target
    if (event.relatedTarget && current?.contains?.(event.relatedTarget)) return
    props.actions.cancelPrefetchMail?.(row)
}

onMounted(() => {
    window.addEventListener('click', handleClickOutside)
    syncHeaderCheckbox()
})
onBeforeUnmount(() => {
    window.removeEventListener('click', handleClickOutside)
    props.actions.cancelPrefetchMail?.()
})

defineExpose({
    scrollToTop: () => mailList.value?.scrollTo?.({ top: 0 }),
})
</script>

<template>
    <div class="mail-workbench" :class="`flow-mode-${model.ui.flowMode}`"
        :style="model.mailGridStyle" :aria-label="t('workbenchLabel')">
        <aside class="mail-facets" :aria-label="t('facetsLabel')">
            <div class="facet-card">
                <div class="facet-title">
                    <strong>{{ t('queues') }}</strong>
                    <button type="button" class="facet-mini-action mobile-only"
                        @click="actions.backToMailList ? actions.backToMailList() : (model.ui.flowMode = 'list', model.ui.selected.flow = '', model.ui.detailKind = '', actions.syncMailQueryToRoute({ mailId: undefined, mode: undefined }))">
                        {{ t('backToList') }}
                    </button>
                </div>
                <button v-for="queue in model.mailHierarchy.queues" :key="queue.id" class="facet-row"
                    :class="{ 'is-active': model.ui.status === queue.status }" type="button"
                    @click="actions.setMailStatus(queue.status)">
                    <span>{{ queue.label }}</span>
                    <b>{{ formatNumber(queue.count) }}</b>
                </button>
            </div>

            <div class="facet-card">
                <div class="facet-title">
                    <strong>{{ t('mailboxes') }}</strong>
                </div>
                <div class="mail-tree">
                    <button class="facet-row" :class="{ 'is-active': model.ui.domain === 'all' && model.ui.address === 'all' }"
                        type="button" @click="actions.setMailDomain('all')">
                        <span>{{ t('allDomains') }}</span>
                        <b>{{ formatNumber(model.mailHierarchy.queues[0]?.count ?? model.mailRows.length) }}</b>
                    </button>
                    <div v-for="domain in model.mailHierarchy.domains" :key="domain.id || domain.domain" class="tree-group">
                        <div class="domain-line" :class="{ 'is-active': model.ui.domain === domain.domain && model.ui.address === 'all' }">
                            <button class="tree-toggle-btn" type="button"
                                :class="{ 'is-collapsed': actions.isMailDomainCollapsed(domain.domain) }"
                                :aria-expanded="!actions.isMailDomainCollapsed(domain.domain)"
                                :aria-label="actions.isMailDomainCollapsed(domain.domain) ? t('expandDomain') : t('collapseDomain')"
                                @click="actions.toggleMailDomain(domain.domain)"></button>
                            <button class="facet-row domain-row" type="button" @click="actions.setMailDomain(domain.domain)">
                                <span>{{ domain.domain }}</span>
                                <b>{{ formatNumber(domain.mails || 0) }}</b>
                            </button>
                        </div>
                        <div v-show="!actions.isMailDomainCollapsed(domain.domain)" class="tree-children">
                            <button v-for="address in domain.addresses" :key="address.address"
                                class="facet-row address-row" :class="{ 'is-active': model.ui.address === address.address }"
                                type="button" @click="actions.setMailAddress(address.address)">
                                <span>{{ address.address }}</span>
                                <b>{{ formatNumber(address.count) }}</b>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
        <button type="button" class="column-resizer facets-resizer" :aria-label="t('resizeFacetsColumn')"
            @pointerdown="actions.startMailColumnResize('facets-list', $event)"></button>

        <section class="mail-list-panel panel" :aria-label="t('mailListLabel')">
            <div class="panel-head mail-panel-head">
                <div class="mail-header-controls">
                    <div ref="selectDropdownRef" class="mail-select-all-wrapper">
                        <label class="mail-select-all-trigger"
                            :class="{ 'is-active': model.selectedMailCount > 0 }">
                            <input ref="headerCheckboxRef" type="checkbox" class="mail-checkbox header-checkbox"
                                :checked.prop="Boolean(model.isAllVisibleSelected)"
                                :indeterminate.prop="Boolean(model.isSomeVisibleSelected)"
                                :aria-checked="model.isAllVisibleSelected ? 'true' : (model.isSomeVisibleSelected ? 'mixed' : 'false')"
                                :aria-label="t('selectAll')"
                                @change.stop="handleSelectAllToggle"
                                @keydown.enter.stop.prevent="handleSelectAllToggle" />
                        </label>
                        <button type="button" class="mail-select-all-arrow"
                            :aria-label="t('selectionOptions')"
                            :aria-expanded="showSelectMenu"
                            @click.stop="showSelectMenu = !showSelectMenu">
                            <span class="dropdown-arrow" aria-hidden="true">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </span>
                        </button>
                        <div v-show="showSelectMenu" class="mail-select-menu">
                            <button type="button" class="select-option" @click="handleSelectOption('all')">
                                {{ t('selectAll') }}
                            </button>
                            <button type="button" class="select-option" @click="handleSelectOption('none')">
                                {{ t('selectNone') }}
                            </button>
                            <button type="button" class="select-option" @click="handleSelectOption('read')">
                                {{ t('selectRead') }}
                            </button>
                            <button type="button" class="select-option" @click="handleSelectOption('unread')">
                                {{ t('selectUnread') }}
                            </button>
                        </div>
                    </div>

                    <AdminRefreshButton
                        :disabled="!!model.actionBusy"
                        :label="t('refresh') || '刷新'"
                        @click="actions.handleAction('refresh')" />

                    <div class="mail-toolbar-divider" aria-hidden="true" />

                    <!-- When selected > 0: Batch Action Toolbar in same row -->
                    <div v-if="model.selectedMailCount > 0" class="mail-batch-bar" role="toolbar" :aria-label="t('selectionOptions')">
                        <span class="batch-count">{{ t('selectedCount', { count: model.selectedMailCount }) }}</span>
                        <button type="button" class="btn compact-btn batch-action-btn"
                            :disabled="!!model.actionBusy"
                            @click="actions.batchMarkRead(model.selectedMailRows, true)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {{ t('markAsRead') }}
                        </button>
                        <button type="button" class="btn compact-btn batch-action-btn"
                            :disabled="!!model.actionBusy"
                            @click="actions.batchMarkRead(model.selectedMailRows, false)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <rect width="20" height="16" x="2" y="4" rx="2" />
                                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                            </svg>
                            {{ t('markAsUnread') }}
                        </button>
                        <button type="button" class="btn compact-btn danger batch-action-btn"
                            :disabled="!!model.actionBusy"
                            @click="actions.batchDeleteMails(model.selectedMailRows)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            {{ t('deleteSelected') }}
                        </button>
                        <button type="button" class="btn compact-btn batch-action-btn"
                            :disabled="!!model.actionBusy"
                            @click="actions.batchExportMails(model.selectedMailRows)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {{ t('exportSelected') }}
                        </button>
                    </div>

                    <!-- When selected == 0: Inline Filter Chips -->
                    <div v-else class="mail-filter-chips" role="toolbar" :aria-label="t('filters') || '筛选'">
                        <AdminDomainDropdown
                            v-if="model.mailHierarchy?.domains?.length"
                            :selected-domain="model.ui.domain"
                            :all-label="t('allDomains') || '全部域名'"
                            :all-count="formatNumber(model.mailHierarchy.queues[0]?.count ?? model.mailRows.length)"
                            :domains="model.mailHierarchy.domains.map((domain) => ({ domain: domain.domain, count: formatNumber(domain.mails || 0) }))"
                            @select="actions.setMailDomain" />

                        <button type="button" class="filter-chip"
                            :class="{ 'is-active': model.ui.status === 'unread' }"
                            :aria-pressed="model.ui.status === 'unread' ? 'true' : 'false'"
                            @click="actions.setMailStatus(model.ui.status === 'unread' ? 'all' : 'unread')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <rect width="20" height="16" x="2" y="4" rx="2" />
                                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                            </svg>
                            <span>{{ t('unread') || '未读' }}</span>
                        </button>

                        <button type="button" class="filter-chip"
                            :class="{ 'is-active': model.ui.status === 'attachments' }"
                            :aria-pressed="model.ui.status === 'attachments' ? 'true' : 'false'"
                            @click="actions.setMailStatus(model.ui.status === 'attachments' ? 'all' : 'attachments')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            <span>{{ t('attachments') || '附件' }}</span>
                        </button>

                        <button v-if="hasActiveMailFilters" type="button" class="filter-chip clear-chip"
                            :title="t('clearFilters') || '清除筛选'"
                            @click="clearAllMailFilters">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                            <span>{{ t('clearFilters') || '清除筛选' }}</span>
                        </button>
                    </div>
                </div>

                <div class="panel-head-actions mail-head-actions">
                    <span class="mail-range-indicator">{{ rangeLabel }}</span>
                    <div class="mail-pagination-controls" role="group" :aria-label="t('mailListLabel')">
                        <button type="button" class="mail-page-btn"
                            :disabled="!model.canPrevPage || !!model.actionBusy"
                            :aria-label="t('prevPage')"
                            :title="t('prevPage')"
                            @click="actions.prevMailPage">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </button>
                        <button type="button" class="mail-page-btn"
                            :disabled="!model.canNextPage || !!model.actionBusy"
                            :aria-label="t('nextPage')"
                            :title="t('nextPage')"
                            @click="actions.nextMailPage">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        </button>
                    </div>
                    <button type="button" class="mail-view-toggle-btn"
                        :class="{ 'is-active': model.ui.flowMode === 'detail' }"
                        :aria-label="t('toggleSplitView')"
                        :aria-pressed="model.ui.flowMode === 'detail' ? 'true' : 'false'"
                        :title="model.ui.flowMode === 'detail' ? t('listView') : t('splitView')"
                        @click="actions.toggleMailViewMode">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="16" rx="2" />
                            <path d="M12 4v16" />
                        </svg>
                    </button>
                </div>
            </div>
            <div ref="mailList" class="mail-list" role="list" :aria-label="t('mailRecordsLabel')">
                <div v-for="row in (model.visibleMailRows || model.filteredMailRows)" :key="row.id" class="mail-row"
                    role="listitem" :aria-current="actions.isSelected('flow', row) ? 'true' : undefined" tabindex="0"
                    :class="{ 'is-selected': actions.isSelected('flow', row), 'is-unread': row.unread, 'is-checked': actions.isMailSelected(row.id) }"
                    @click="actions.selectRow('flow', row.id)"
                    @keydown="actions.handleRowKey($event, 'flow', row)"
                    @mouseenter="handleRowMouseEnter(row)"
                    @mouseleave="handleRowMouseLeave($event, row)"
                    @focusin="handleRowFocusIn($event, row)"
                    @focusout="handleRowFocusOut($event, row)">
                    <label class="mail-select-cell" @click.stop.prevent="actions.toggleMailSelection(row, { shiftKey: $event.shiftKey })">
                        <input type="checkbox" class="mail-checkbox"
                            :checked="actions.isMailSelected(row.id)"
                            :aria-label="t('selectRow', { subject: row.subject })"
                            tabindex="0"
                            @keydown.space.stop.prevent="actions.toggleMailSelection(row, { shiftKey: false })"
                            @keydown.enter.stop.prevent="actions.toggleMailSelection(row, { shiftKey: false })" />
                    </label>
                    <span class="mail-sender" :title="row.sender">{{ row.senderDisplay || row.sender }}</span>
                    <span class="mail-main">
                        <strong class="mail-subject">{{ row.subject }}</strong>
                        <span v-if="row.body" class="mail-snippet-sep">-</span>
                        <small v-if="row.body" class="mail-body-preview">{{ row.body }}</small>
                    </span>
                    <span class="mail-meta">
                        <span v-if="row.attachmentCount > 0" class="attachment-indicator" :title="t('attachments') || '附件'">📎</span>
                        <span class="mail-time">{{ row.time }}</span>
                        <span class="mail-row-actions" role="toolbar" :aria-label="t('rowActions') || '快捷操作'">
                            <button v-if="row.unread" type="button" class="mail-row-action-btn"
                                :title="t('markAsRead')"
                                :aria-label="t('markAsRead')"
                                :disabled="!!model.actionBusy"
                                @click.stop.prevent="actions.setRowReadState ? actions.setRowReadState(row, true) : actions.batchMarkRead([row], true)"
                                @keydown.space.stop.prevent="actions.setRowReadState ? actions.setRowReadState(row, true) : actions.batchMarkRead([row], true)"
                                @keydown.enter.stop.prevent="actions.setRowReadState ? actions.setRowReadState(row, true) : actions.batchMarkRead([row], true)">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6z" />
                                    <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
                                </svg>
                            </button>
                            <button v-else type="button" class="mail-row-action-btn"
                                :title="t('markAsUnread')"
                                :aria-label="t('markAsUnread')"
                                :disabled="!!model.actionBusy"
                                @click.stop.prevent="actions.setRowReadState ? actions.setRowReadState(row, false) : actions.batchMarkRead([row], false)"
                                @keydown.space.stop.prevent="actions.setRowReadState ? actions.setRowReadState(row, false) : actions.batchMarkRead([row], false)"
                                @keydown.enter.stop.prevent="actions.setRowReadState ? actions.setRowReadState(row, false) : actions.batchMarkRead([row], false)">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <rect x="3" y="5" width="18" height="14" rx="2" />
                                    <path d="m3 7 9 6 9-6" />
                                </svg>
                            </button>
                            <button type="button" class="mail-row-action-btn danger"
                                :title="t('delete')"
                                :aria-label="t('delete')"
                                :disabled="!!model.actionBusy"
                                @click.stop.prevent="actions.deleteMailRow ? actions.deleteMailRow(row) : actions.batchDeleteMails([row])"
                                @keydown.space.stop.prevent="actions.deleteMailRow ? actions.deleteMailRow(row) : actions.batchDeleteMails([row])"
                                @keydown.enter.stop.prevent="actions.deleteMailRow ? actions.deleteMailRow(row) : actions.batchDeleteMails([row])">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                            </button>
                        </span>
                    </span>
                </div>

                <AdminEmptyState v-if="model.filteredMailRows.length === 0"
                    :action-label="model.hasActiveFilters ? t('clearFilters') : ''"
                    @action="actions.handleAction('reset-filters')" />
            </div>
        </section>
        <button type="button" class="column-resizer detail-resizer" :aria-label="t('resizeDetailColumn')"
            @pointerdown="actions.startMailColumnResize('list-detail', $event)"></button>

        <aside class="mail-detail-panel panel" :aria-label="t('mailDetailLabel')">
            <div class="panel-head">
                <div class="mail-detail-head-content">
                    <div class="detail-back-bar">
                        <button type="button" class="btn compact-btn detail-back-btn"
                            @click="actions.backToMailList ? actions.backToMailList() : (model.ui.flowMode = 'list', model.ui.selected.flow = '', model.ui.detailKind = '', actions.syncMailQueryToRoute({ mailId: undefined, mode: undefined }))">
                            ← {{ t('backToList') || '返回列表' }}
                        </button>
                    </div>
                    <h2>{{ model.currentMail?.subject || model.currentRail.title }}</h2>
                    <p v-if="model.currentRail.subtitle && !model.currentMail">{{ model.currentRail.subtitle }}</p>
                </div>
                <button v-if="model.currentMail" type="button" class="btn danger"
                    :disabled="!!model.actionBusy" @click="actions.deleteCurrentMail">
                    {{ t('delete') }}
                </button>
            </div>
            <div class="inner-pad detail-pane-body" :class="{ 'is-reader-empty': model.currentRail.empty }">
                <AdminEmptyState v-if="model.currentRail.empty" class="reader-empty"
                    :title="model.currentRail.title" :description="model.currentRail.subtitle" />
                <template v-else>
                    <div v-if="model.currentMail" class="gmail-sender-card">
                        <div class="sender-avatar">
                            {{ getSenderInitial(model.currentMail.sender) }}
                        </div>
                        <div class="sender-body">
                            <div class="sender-row">
                                <strong class="sender-name">{{ model.currentMail.sender }}</strong>
                                <span class="sender-time">{{ model.currentMail.fullTime || model.currentMail.time }}</span>
                            </div>
                            <div class="recipient-summary">
                                <span class="recipient-text">{{ t('recipient') }}: {{ model.currentMail.to }}</span>
                                <button type="button" class="icon-btn mail-copy-button"
                                    :aria-label="t('copyRecipient')" :title="t('copyRecipient')"
                                    @click="actions.copyText(model.currentMail.to)">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    <!-- Hidden dl preserved for backward compatibility with existing tests -->
                    <dl v-if="model.currentMail" class="mail-summary sr-only">
                        <div>
                            <dt>{{ t('sender') }}</dt>
                            <dd>{{ model.currentMail.sender }}</dd>
                        </div>
                        <div class="recipient-summary">
                            <dt>
                                <span>{{ t('recipient') }}</span>
                                <button type="button" class="icon-btn mail-copy-button"
                                    :aria-label="t('copyRecipient')" :title="t('copyRecipient')"
                                    @click="actions.copyText(model.currentMail.to)">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                </button>
                            </dt>
                            <dd>{{ model.currentMail.to }}</dd>
                        </div>
                        <div>
                            <dt>{{ t('time') }}</dt>
                            <dd>{{ model.currentMail.fullTime || model.currentMail.time }}</dd>
                        </div>
                    </dl>
                    <div v-if="model.currentRail.tags?.length" class="tag-row rail-tags">
                        <span v-for="tag in model.currentRail.tags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                    <section class="body-section">
                        <div class="body-section-head">
                            <strong>{{ t('body') }}</strong>
                            <div class="render-toggle" role="group" :aria-label="t('renderModeLabel')">
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'html' }"
                                    :disabled="Boolean(model.isDetailParsing || !model.currentRail.mail?.html)"
                                    @click="model.ui.mailRenderMode = 'html'">HTML</button>
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'text' }"
                                    :disabled="Boolean(model.isDetailParsing || !model.currentRail.mail?.text)"
                                    @click="model.ui.mailRenderMode = 'text'">{{ t('textMode') }}</button>
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'raw' }"
                                    :disabled="Boolean(model.isDetailParsing || !model.currentRail.mail?.raw)"
                                    @click="model.ui.mailRenderMode = 'raw'">{{ t('rawMode') }}</button>
                            </div>
                        </div>
                        <div class="mail-body-stage" :aria-busy="model.isDetailParsing ? 'true' : 'false'">
                            <Transition name="mail-body-fade" mode="out-in">
                                <div v-if="model.isDetailParsing" key="skeleton"
                                    class="mail-body mail-body-skeleton" role="status"
                                    aria-live="polite" aria-busy="true" :aria-label="t('loadingBody') || '正在解析邮件正文...'">
                                    <div class="skeleton-line skeleton-line-title"></div>
                                    <div class="skeleton-line"></div>
                                    <div class="skeleton-line"></div>
                                    <div class="skeleton-line skeleton-line-short"></div>
                                </div>
                                <div v-else-if="model.currentRendererMail && !model.currentRendererMail.parseFailed && (model.currentRendererMail.message || model.currentRail.mail?.html || model.currentRail.mail?.text) && model.ui.mailRenderMode === 'html'"
                                    key="html" class="mail-body html-body">
                                    <MailContentRenderer :mail="model.currentRendererMail" :showEMailTo="true"
                                        :showReply="false" :showMetaBar="false" />
                                </div>
                                <pre v-else-if="model.currentRail.mail?.text && model.ui.mailRenderMode === 'text'"
                                    key="text" class="mail-body text-body">{{ model.currentRail.mail.text }}</pre>
                                <pre v-else-if="model.currentRail.mail?.raw && model.ui.mailRenderMode === 'raw'"
                                    key="raw" class="mail-body raw-body">{{ model.currentRail.mail.raw }}</pre>
                                <p v-else key="empty" class="mail-body text-fallback">{{ t('emptyBody') }}</p>
                            </Transition>
                        </div>
                    </section>
                    <section v-if="model.currentRail.mail?.attachments?.length" class="attachment-section">
                        <div class="body-section-head">
                            <strong>{{ t('attachments') }}</strong>
                            <span>{{ model.currentRail.mail.attachmentLabel }}</span>
                        </div>
                        <div class="attachment-list">
                            <span v-for="item in model.currentRail.mail.attachments" :key="item.filename || item.id"
                                class="attachment-chip">
                                {{ item.filename || 'attachment' }}
                            </span>
                        </div>
                    </section>
                    <details v-if="model.currentRail.kv" class="metadata-section">
                        <summary>{{ t('technicalInfo') }}</summary>
                        <dl class="kv">
                            <template v-for="item in model.currentRail.kv" :key="item[0]">
                                <dt>{{ item[0] }}</dt>
                                <dd>
                                    <span v-if="item[2] === 'status'" class="status"
                                        :class="statusClass(item[1])">{{ item[1] }}</span>
                                    <span v-else>{{ item[1] }}</span>
                                </dd>
                            </template>
                        </dl>
                    </details>
                    <div v-if="model.currentRail.actions" class="tag-row rail-actions">
                        <button v-for="action in model.currentRail.actions" :key="action.label" type="button" class="btn"
                            :class="{ primary: action.primary, danger: action.danger }"
                            :disabled="!!model.actionBusy" @click="actions.runRailAction(action)">
                            {{ action.label }}
                        </button>
                    </div>
                </template>
            </div>
        </aside>
    </div>
</template>
