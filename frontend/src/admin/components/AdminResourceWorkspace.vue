<script setup>
import { computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import { cellText, formatNumber, statusClass } from '../admin-formatters'
import AdminEmptyState from './AdminEmptyState.vue'

const props = defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t: tCol } = useScopedI18n('admin.column')
const { t } = useScopedI18n('admin.resource')

const recentMails = computed(() => {
    return (props.model.mailRows || []).slice(0, 6)
})
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
                    <span class="card-unit">封邮件</span>
                </div>
                <p class="card-desc">{{ t('flowDesc', { count: formatNumber(model.mailRows.length) }) }}</p>
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
                    <span class="card-unit">个域名</span>
                </div>
                <p class="card-desc">{{ t('routingDesc') }}</p>
                <div class="card-action">
                    <span>管理域名路由 &rarr;</span>
                </div>
            </button>

            <button type="button" class="overview-card" @click="actions.setView('identity')">
                <div class="card-top">
                    <span class="card-kicker">{{ t('identityKicker') }}</span>
                </div>
                <div class="card-main">
                    <strong class="card-value">{{ formatNumber(model.addressRows.length) }}</strong>
                    <span class="card-unit">个地址</span>
                </div>
                <p class="card-desc">{{ t('identityDesc') }}</p>
                <div class="card-action">
                    <span>管理地址与用户 &rarr;</span>
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
                    <span class="card-unit">DB 版本</span>
                </div>
                <p class="card-desc">{{ t('opsDesc') }}</p>
                <div class="card-action">
                    <span>查看运行维护 &rarr;</span>
                </div>
            </button>
        </div>

        <!-- Lower Section: Recent Inbound Stream & Runtime Health -->
        <div class="overview-sections">
            <section class="panel overview-stream-panel">
                <div class="panel-head">
                    <div>
                        <h2>{{ t('recentActivity') }}</h2>
                        <p>实时入站邮件与投递流水记录</p>
                    </div>
                    <button class="btn small" type="button" @click="actions.setView('flow')">
                        {{ t('openFlow') }}
                    </button>
                </div>
                <div class="table-wrap">
                    <table v-if="recentMails.length">
                        <thead>
                            <tr>
                                <th>时间</th>
                                <th>发件人</th>
                                <th>收件地址</th>
                                <th>主题</th>
                                <th class="text-right">状态</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="mail in recentMails" :key="mail.id" tabindex="0"
                                @click="actions.selectRow('flow', mail.id)">
                                <td class="time-text">{{ mail.time }}</td>
                                <td class="mono cell-truncate" :title="mail.sender">{{ mail.sender || '-' }}</td>
                                <td><strong>{{ mail.to || '-' }}</strong></td>
                                <td class="cell-truncate">{{ mail.subject || '(无主题)' }}</td>
                                <td class="text-right">
                                    <span class="badge" :class="'badge-' + (statusClass(mail.resultTone || mail.result))">
                                        <span class="badge-dot" aria-hidden="true" />
                                        <span>{{ mail.result || '已接收' }}</span>
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
                        <p>Cloudflare Workers, D1 & 边缘配置</p>
                    </div>
                </div>
                <div class="inner-pad">
                    <dl class="kv-grid">
                        <div class="kv-item">
                            <dt>Worker 状态</dt>
                            <dd>
                                <span class="badge badge-ok">
                                    <span class="badge-dot" />
                                    <span>{{ model.workerStatusLabel }}</span>
                                </span>
                            </dd>
                        </div>
                        <div class="kv-item">
                            <dt>D1 数据库</dt>
                            <dd>
                                <span class="badge mono badge-ok">
                                    <span>DB_VERSION {{ model.dbVersionLabel }}</span>
                                </span>
                            </dd>
                        </div>
                        <div class="kv-item">
                            <dt>域名总量</dt>
                            <dd><strong>{{ model.domainRows.length }} 个</strong></dd>
                        </div>
                        <div class="kv-item">
                            <dt>地址总量</dt>
                            <dd><strong>{{ model.addressRows.length }} 个</strong></dd>
                        </div>
                        <div class="kv-item">
                            <dt>入站通知</dt>
                            <dd>
                                <span class="badge" :class="model.mailWebhook?.enabled ? 'badge-ok' : 'badge-neutral'">
                                    <span>{{ model.mailWebhook?.enabled ? '已启用' : '未启用' }}</span>
                                </span>
                            </dd>
                        </div>
                        <div class="kv-item">
                            <dt>最后同步时间</dt>
                            <dd class="mono text-muted">{{ model.lastSynced || '实时同步' }}</dd>
                        </div>
                    </dl>
                </div>
            </section>
        </div>
    </div>

    <!-- Regular Resource View Grid -->
    <div v-else class="view-grid">
        <section v-for="panel in model.activePanels" :key="panel.id" class="panel"
            :class="[panel.layout, `panel-${panel.id}`]">
            <div class="panel-head">
                <div>
                    <h2>{{ panel.title }}</h2>
                    <p v-if="panel.note">{{ panel.note }}</p>
                </div>
                <div v-if="panel.kind === 'users'" class="panel-head-actions">
                    <button class="btn small primary" type="button" :disabled="!!model.actionBusy"
                        @click="actions.openActionModal('new-user')">
                        + {{ t('newUser') }}
                    </button>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <caption class="sr-only">{{ t('tableCaption', { title: panel.title }) }}</caption>
                    <thead>
                        <tr>
                            <th v-for="column in panel.columns" :key="column.labelKey"
                                :class="{
                                    num: column.type === 'number',
                                    'text-right': column.type === 'domainActions' || column.type === 'userActions' || column.type === 'addressActions' || column.type === 'shareActions'
                                }">
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
                                :class="{
                                    num: column.type === 'number',
                                    'text-right': column.type === 'domainActions' || column.type === 'userActions' || column.type === 'addressActions' || column.type === 'shareActions'
                                }">
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
                                    :class="'badge-' + (statusClass(row[`${column.key}Tone`] || row[column.key]))">
                                    <span class="badge-dot" aria-hidden="true" />
                                    <span>{{ cellText(row, column.key) }}</span>
                                </span>

                                <div v-else-if="column.type === 'userActions'" class="row-actions user-actions cell-actions" @click.stop>
                                    <button class="btn-action" type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleUserRowAction(row, 'reset-password')" :title="t('resetPassword')">
                                        {{ t('resetPassword') }}
                                    </button>
                                    <button class="btn-action" type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleUserRowAction(row, 'edit-role')" :title="t('editRole')">
                                        {{ t('editRole') }}
                                    </button>
                                    <button class="btn-action" type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleUserRowAction(row, 'user-addresses')" :title="t('manageAddresses')">
                                        {{ t('manageAddresses') }}
                                    </button>
                                    <button class="btn-action danger" type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleUserRowAction(row, 'delete')" :title="t('deleteUser')">
                                        {{ t('delete') }}
                                    </button>
                                </div>

                                <div v-else-if="column.type === 'addressActions'" class="row-actions address-actions cell-actions" @click.stop>
                                    <button class="btn-action primary" type="button" @click="actions.openMailFromAddress(row.address)">
                                        {{ t('viewMail') }}
                                    </button>
                                    <button class="btn-action" type="button" @click="actions.copyText(row.address)">
                                        {{ t('copy') }}
                                    </button>
                                    <button class="btn-action" type="button" @click="actions.openSharePackage(row)">
                                        {{ t('share') }}
                                    </button>
                                </div>

                                <div v-else-if="column.type === 'shareActions'" class="row-actions share-actions cell-actions" @click.stop>
                                    <button class="btn-action" type="button" @click="actions.copyText(row.path)">
                                        {{ t('copy') }}
                                    </button>
                                </div>

                                <div v-else-if="column.type === 'domainActions'" class="row-actions domain-actions cell-actions" @click.stop>
                                    <button v-if="row.receiveMode === 'cloudflare_email'" class="btn-action primary" type="button"
                                        :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleDomainRowAction(row, 'cloudflare-setup')">
                                        {{ t('autoSetup') }}
                                    </button>
                                    <button class="btn-action" type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleDomainRowAction(row, 'verify-start')">
                                        {{ t('startVerify') }}
                                    </button>
                                    <button class="btn-action" type="button"
                                        :disabled="!row.sourceId || !row.verificationAddress || !!model.actionBusy"
                                        @click="actions.handleDomainRowAction(row, 'verify-check')">
                                        {{ t('checkVerify') }}
                                    </button>
                                    <button class="btn-action" type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleDomainRowAction(row, 'verify')">
                                        {{ t('checkRouting') }}
                                    </button>
                                    <button v-if="row.isEnabled" class="btn-action danger" type="button"
                                        :disabled="!row.sourceId || !!model.actionBusy"
                                        @click="actions.handleDomainRowAction(row, 'domain-disable')">
                                        {{ t('disable') }}
                                    </button>
                                </div>

                                <strong v-else-if="column.type === 'strong'">{{ cellText(row, column.key) }}</strong>
                                <span v-else-if="column.type === 'time'" class="time-text mono">{{ cellText(row, column.key) }}</span>
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
                    <span class="badge" :class="'badge-' + (item.tone || 'neutral')">
                        <span class="badge-dot" />
                        <span>{{ item.state }}</span>
                    </span>
                </div>
            </div>
        </section>

        <section v-if="model.activeView === 'delivery'" class="panel">
            <div class="panel-head">
                <div>
                    <h2>{{ t('contentProcessing') }}</h2>
                </div>
            </div>
            <div class="inner-pad">
                <dl class="kv-grid">
                    <div class="kv-item">
                        <dt>{{ t('aiExtract') }}</dt>
                        <dd><span class="badge badge-warn"><span class="badge-dot" />{{ t('aiExtractValue') }}</span></dd>
                    </div>
                    <div class="kv-item">
                        <dt>{{ t('htmlPreview') }}</dt>
                        <dd><span class="badge badge-ok"><span class="badge-dot" />{{ t('htmlPreviewValue') }}</span></dd>
                    </div>
                    <div class="kv-item">
                        <dt>{{ t('attachmentTransfer') }}</dt>
                        <dd><span class="badge badge-warn"><span class="badge-dot" />{{ t('attachmentTransferValue') }}</span></dd>
                    </div>
                    <div class="kv-item">
                        <dt>{{ t('autoReply') }}</dt>
                        <dd><span class="badge badge-warn"><span class="badge-dot" />{{ t('autoReplyValue') }}</span></dd>
                    </div>
                </dl>
            </div>
        </section>
    </div>
</template>
