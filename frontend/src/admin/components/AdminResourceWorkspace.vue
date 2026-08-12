<script setup>
import { useScopedI18n } from '@/i18n/app'

import { cellText, formatNumber, statusClass } from '../admin-formatters'
import AdminEmptyState from './AdminEmptyState.vue'

defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t: tCol } = useScopedI18n('admin.column')
const { t } = useScopedI18n('admin.resource')
</script>

<template>
    <div v-if="model.activeView === 'overview'" class="overview-home" :aria-label="t('overviewAria')">
        <button type="button" class="overview-entry primary-entry" @click="actions.setView('flow')">
            <span class="overview-entry-kicker">{{ t('flowKicker') }}</span>
            <strong>{{ t('unreadCount', { count: formatNumber(model.explicitUnreadMailCount) }) }}</strong>
            <span>{{ t('flowDesc', { count: formatNumber(model.mailRows.length) }) }}</span>
        </button>
        <button type="button" class="overview-entry" @click="actions.setView('routing')">
            <span class="overview-entry-kicker">{{ t('routingKicker') }}</span>
            <strong>{{ t('domainCount', { count: formatNumber(model.domainRows.length) }) }}</strong>
            <span>{{ t('routingDesc') }}</span>
        </button>
        <button type="button" class="overview-entry" @click="actions.setView('identity')">
            <span class="overview-entry-kicker">{{ t('identityKicker') }}</span>
            <strong>{{ t('addressCount', { count: formatNumber(model.addressRows.length) }) }}</strong>
            <span>{{ t('identityDesc') }}</span>
        </button>
        <button type="button" class="overview-entry" @click="actions.setView('ops')">
            <span class="overview-entry-kicker">{{ t('opsKicker') }}</span>
            <strong>{{ model.blockingLoadErrors.length ? t('needsReview') : model.workerStatusLabel }}</strong>
            <span>{{ t('opsDesc') }}</span>
        </button>
    </div>

    <div v-else class="view-grid">
        <section v-for="panel in model.activePanels" :key="panel.id" class="panel"
            :class="[panel.layout, `panel-${panel.id}`]">
            <div class="panel-head">
                <div>
                    <h2>{{ panel.title }}</h2>
                    <p v-if="panel.note">{{ panel.note }}</p>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <caption class="sr-only">{{ t('tableCaption', { title: panel.title }) }}</caption>
                    <thead>
                        <tr>
                            <th v-for="column in panel.columns" :key="column.labelKey"
                                :class="{ num: column.type === 'number' }">
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
                                :class="{ num: column.type === 'number' }">
                                <template v-if="column.type === 'entity'">
                                    <div class="cell-main">
                                        <strong>{{ cellText(row, column.main) }}</strong>
                                        <span class="cell-sub">{{ cellText(row, column.sub) }}</span>
                                        <span v-if="column.tags && row[column.tags]?.length" class="tag-row">
                                            <span v-for="tag in row[column.tags]" :key="tag" class="tag">{{ tag }}</span>
                                        </span>
                                        <span v-if="panel.kind === 'identity' && column.main === 'address'" class="cell-actions">
                                            <button type="button" @click.stop="actions.openMailFromAddress(row.address)">{{ t('viewMail') }}</button>
                                            <button type="button" @click.stop="actions.copyText(row.address)">{{ t('copy') }}</button>
                                            <button type="button" @click.stop="actions.openSharePackage(row)">{{ t('share') }}</button>
                                        </span>
                                    </div>
                                </template>
                                <!-- Prefer the row's explicit tone; the text heuristic is
                                     only a fallback for rows not yet migrated. -->
                                <span v-else-if="column.type === 'status'" class="status"
                                    :class="statusClass(row[`${column.key}Tone`] || row[column.key])">
                                    {{ cellText(row, column.key) }}
                                </span>
                                <span v-else-if="column.type === 'domainActions'" class="cell-actions domain-actions">
                                    <button v-if="row.receiveMode === 'cloudflare_email'" type="button"
                                        :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'cloudflare-setup')">
                                        {{ t('autoSetup') }}
                                    </button>
                                    <button type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'verify-start')">
                                        {{ t('startVerify') }}
                                    </button>
                                    <button type="button"
                                        :disabled="!row.sourceId || !row.verificationAddress || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'verify-check')">
                                        {{ t('checkVerify') }}
                                    </button>
                                    <button type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'verify')">
                                        {{ t('checkRouting') }}
                                    </button>
                                    <button v-if="row.isEnabled" type="button"
                                        :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'domain-disable')">
                                        {{ t('disable') }}
                                    </button>
                                </span>
                                <strong v-else-if="column.type === 'strong'">{{ cellText(row, column.key) }}</strong>
                                <span v-else-if="column.type === 'time'" class="time-text">{{ cellText(row, column.key) }}</span>
                                <span v-else-if="column.type === 'mono'" class="mono"
                                    :title="cellText(row, column.key)">{{ cellText(row, column.key) }}</span>
                                <span v-else-if="column.type === 'number'">
                                    {{ Number.isFinite(Number(row[column.key])) ? formatNumber(row[column.key]) : '-' }}
                                </span>
                                <span v-else>{{ cellText(row, column.key) }}</span>
                            </td>
                        </tr>
                        <tr v-if="panel.rows.length === 0">
                            <td :colspan="panel.columns.length">
                                <AdminEmptyState :action-label="model.hasActiveFilters ? t('clearFilters') : ''"
                                    @action="actions.handleAction('reset-filters')" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section v-if="model.activeView === 'identity'" class="panel third">
            <div class="panel-head">
                <div>
                    <h2>{{ t('fixedCredentialLink') }}</h2>
                </div>
            </div>
            <div class="inner-pad">
                <dl class="kv">
                    <dt>{{ t('currentPolicy') }}</dt><dd>{{ t('currentPolicyValue') }}</dd>
                    <dt>{{ t('displayMode') }}</dt><dd>{{ t('displayModeValue') }}</dd>
                    <dt>{{ t('leakHandling') }}</dt><dd>{{ t('leakHandlingValue') }}</dd>
                    <dt>{{ t('audit') }}</dt><dd>{{ t('auditValue') }}</dd>
                </dl>
            </div>
        </section>

        <section v-if="model.activeView === 'routing'" class="panel split">
            <div class="panel-head">
                <div>
                    <h2>{{ t('configCheck') }}</h2>
                </div>
            </div>
            <div class="inner-pad timeline">
                <div v-for="item in model.routingActivationRows" :key="item.code" class="timeline-row">
                    <span class="mono">{{ item.code }}</span>
                    <strong>{{ item.title }}</strong>
                    <span class="status" :class="item.tone">{{ item.state }}</span>
                </div>
            </div>
        </section>

        <section v-if="model.activeView === 'delivery'" class="panel third">
            <div class="panel-head">
                <div>
                    <h2>{{ t('contentProcessing') }}</h2>
                </div>
            </div>
            <div class="inner-pad">
                <dl class="kv">
                    <dt>{{ t('aiExtract') }}</dt><dd><span class="status warn">{{ t('aiExtractValue') }}</span></dd>
                    <dt>{{ t('htmlPreview') }}</dt><dd><span class="status ok">{{ t('htmlPreviewValue') }}</span></dd>
                    <dt>{{ t('attachmentTransfer') }}</dt><dd><span class="status warn">{{ t('attachmentTransferValue') }}</span></dd>
                    <dt>{{ t('autoReply') }}</dt><dd><span class="status warn">{{ t('autoReplyValue') }}</span></dd>
                </dl>
            </div>
        </section>
    </div>
</template>
