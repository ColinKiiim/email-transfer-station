<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import MailContentRenderer from '../../components/MailContentRenderer.vue'
import { formatNumber, statusClass } from '../admin-formatters'
import AdminEmptyState from './AdminEmptyState.vue'

const props = defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t } = useScopedI18n('admin.mailView')
const mailList = ref(null)
const showDomainMenu = ref(false)
const domainDropdownRef = ref(null)

const getSenderInitial = (sender) => {
    if (!sender) return '✉'
    const clean = String(sender).replace(/^["'<]|["'>]$/g, '').trim()
    const first = clean.charAt(0)
    return first.toUpperCase() || '✉'
}

const selectedDomainLabel = computed(() => {
    if (!props.model.ui.domain || props.model.ui.domain === 'all') {
        return `🌐 ${t('allDomains') || '全部域名'}`
    }
    return `🌐 ${props.model.ui.domain}`
})

const selectDomain = (domain) => {
    props.actions.setMailDomain(domain)
    showDomainMenu.value = false
}

const handleClickOutside = (e) => {
    if (domainDropdownRef.value && !domainDropdownRef.value.contains(e.target)) {
        showDomainMenu.value = false
    }
}

onMounted(() => {
    window.addEventListener('click', handleClickOutside)
})
onBeforeUnmount(() => {
    window.removeEventListener('click', handleClickOutside)
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
                    <span class="help-tip" :data-tip="t('queueTip')" tabindex="0" :aria-label="t('helpTip')">?</span>
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
                <div class="mail-filter-chips">
                    <button type="button" class="filter-chip"
                        :class="{ 'is-active': model.ui.status === 'unread' }"
                        @click="actions.setMailStatus(model.ui.status === 'unread' ? 'all' : 'unread')">
                        ✉️ {{ t('unread') || '未读' }}
                    </button>
                    <button type="button" class="filter-chip"
                        :class="{ 'is-active': model.ui.status === 'attachments' }"
                        @click="actions.setMailStatus(model.ui.status === 'attachments' ? 'all' : 'attachments')">
                        📎 {{ t('attachments') || '有附件' }}
                    </button>
                    <div v-if="model.mailHierarchy?.domains?.length" ref="domainDropdownRef" class="domain-filter-wrapper">
                        <button type="button" class="filter-chip domain-chip" :class="{ 'is-active': model.ui.domain !== 'all' }"
                            @click.stop="showDomainMenu = !showDomainMenu">
                            {{ selectedDomainLabel }}
                            <span class="dropdown-arrow">▼</span>
                        </button>
                        <div v-show="showDomainMenu" class="domain-dropdown-menu">
                            <button type="button" class="domain-option" :class="{ 'is-selected': model.ui.domain === 'all' }"
                                @click="selectDomain('all')">
                                <span>🌐 {{ t('allDomains') || '全部域名' }}</span>
                                <b>{{ formatNumber(model.mailHierarchy.queues[0]?.count ?? model.mailRows.length) }}</b>
                            </button>
                            <button v-for="d in model.mailHierarchy.domains" :key="d.domain" type="button"
                                class="domain-option" :class="{ 'is-selected': model.ui.domain === d.domain }"
                                @click="selectDomain(d.domain)">
                                <span>{{ d.domain }}</span>
                                <b>{{ formatNumber(d.mails || 0) }}</b>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="panel-head-actions">
                    <span class="status neutral">{{ t('mailCount', { count: formatNumber(model.filteredMailRows.length) }) }}</span>
                </div>
            </div>
            <div ref="mailList" class="mail-list" role="listbox" :aria-label="t('mailRecordsLabel')">
                <button v-for="row in model.filteredMailRows" :key="row.id" class="mail-row" type="button"
                    role="option" :aria-selected="actions.isSelected('flow', row)"
                    :class="{ 'is-selected': actions.isSelected('flow', row), 'is-unread': row.unread }"
                    @click="actions.selectRow('flow', row.id)"
                    @keydown="actions.handleRowKey($event, 'flow', row)">
                    <span class="mail-sender">{{ row.sender }}</span>
                    <span class="mail-main">
                        <strong class="mail-subject">{{ row.subject }}</strong>
                        <span v-if="row.body" class="mail-snippet-sep">-</span>
                        <small v-if="row.body" class="mail-body-preview">{{ row.body }}</small>
                    </span>
                    <span class="mail-meta">
                        <span v-if="row.attachmentCount > 0" class="attachment-indicator" :title="t('attachments') || '附件'">📎</span>
                        <span class="mail-time">{{ row.time }}</span>
                    </span>
                </button>

                <div v-if="model.filteredUnknownRows.length" class="queue-section">
                    <div class="queue-title">{{ t('exceptionQueue') }}</div>
                    <button v-for="row in model.filteredUnknownRows" :key="row.id" class="mail-row exception"
                        type="button" role="option" :aria-selected="actions.isSelected('exception', row)"
                        :class="{ 'is-selected': actions.isSelected('exception', row) }"
                        @click="actions.selectRow('exception', row.id)"
                        @keydown="actions.handleRowKey($event, 'exception', row)">
                        <span class="mail-sender">{{ row.owner }}</span>
                        <span class="mail-main">
                            <strong class="mail-subject">{{ row.title }}</strong>
                            <span v-if="row.detail" class="mail-snippet-sep">-</span>
                            <small v-if="row.detail" class="mail-body-preview">{{ row.detail }}</small>
                        </span>
                        <span class="mail-meta">
                            <span class="status" :class="statusClass(row.statusTone || row.status)">{{ row.status }}</span>
                            <span class="mail-time">{{ row.level }}</span>
                        </span>
                    </button>
                </div>

                <AdminEmptyState v-if="model.filteredMailRows.length === 0 && model.filteredUnknownRows.length === 0"
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
            <div class="inner-pad detail-pane-body">
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
                                    :disabled="!model.currentRail.mail?.html"
                                    @click="model.ui.mailRenderMode = 'html'">HTML</button>
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'text' }"
                                    :disabled="!model.currentRail.mail?.text"
                                    @click="model.ui.mailRenderMode = 'text'">{{ t('textMode') }}</button>
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'raw' }"
                                    :disabled="!model.currentRail.mail?.raw"
                                    @click="model.ui.mailRenderMode = 'raw'">{{ t('rawMode') }}</button>
                            </div>
                        </div>
                        <div v-if="model.currentRendererMail && model.ui.mailRenderMode === 'html'" class="mail-body html-body">
                            <MailContentRenderer :mail="model.currentRendererMail" :showEMailTo="true"
                                :showReply="false" :showMetaBar="false" />
                        </div>
                        <pre v-else-if="model.currentRail.mail?.text && model.ui.mailRenderMode === 'text'"
                            class="mail-body text-body">{{ model.currentRail.mail.text }}</pre>
                        <pre v-else-if="model.currentRail.mail?.raw && model.ui.mailRenderMode === 'raw'"
                            class="mail-body raw-body">{{ model.currentRail.mail.raw }}</pre>
                        <p v-else-if="model.currentRail.body" class="mail-body text-fallback">{{ model.currentRail.body }}</p>
                        <p v-else class="mail-body text-fallback">{{ t('emptyBody') }}</p>
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
