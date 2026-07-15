<script setup>
import { cellText, formatNumber, statusClass } from '../admin-formatters'
import AdminEmptyState from './AdminEmptyState.vue'

defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})
</script>

<template>
    <div v-if="model.activeView === 'overview'" class="overview-home" aria-label="运行总控入口">
        <button type="button" class="overview-entry primary-entry" @click="actions.setView('flow')">
            <span class="overview-entry-kicker">收件工作区</span>
            <strong>{{ formatNumber(model.explicitUnreadMailCount) }} 未读</strong>
            <span>{{ formatNumber(model.mailRows.length) }} 封最近邮件，进入收件箱查看正文、附件和渲染状态。</span>
        </button>
        <button type="button" class="overview-entry" @click="actions.setView('routing')">
            <span class="overview-entry-kicker">入口与路由</span>
            <strong>{{ formatNumber(model.domainRows.length) }} 个域名</strong>
            <span>检查 collector、接收方式、验证状态和域名归属。</span>
        </button>
        <button type="button" class="overview-entry" @click="actions.setView('identity')">
            <span class="overview-entry-kicker">地址身份</span>
            <strong>{{ formatNumber(model.addressRows.length) }} 个地址</strong>
            <span>管理地址、标签、凭证、分享包和账号归属。</span>
        </button>
        <button type="button" class="overview-entry" @click="actions.setView('ops')">
            <span class="overview-entry-kicker">运行维护</span>
            <strong>{{ model.blockingLoadErrors.length ? '需复核' : model.workerStatusLabel }}</strong>
            <span>查看 Worker、D1、KV、DB 版本和后台接口状态。</span>
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
                    <caption class="sr-only">{{ panel.title }} 数据表</caption>
                    <thead>
                        <tr>
                            <th v-for="column in panel.columns" :key="column.label"
                                :class="{ num: column.type === 'number' }">
                                {{ column.label }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in panel.rows" :key="row.id" tabindex="0"
                            :aria-selected="actions.isSelected(panel.kind, row)"
                            :class="{ 'is-selected': actions.isSelected(panel.kind, row) }"
                            @click="actions.selectRow(panel.kind, row.id)"
                            @keydown="actions.handleRowKey($event, panel.kind, row)">
                            <td v-for="column in panel.columns" :key="column.label"
                                :class="{ num: column.type === 'number' }">
                                <template v-if="column.type === 'entity'">
                                    <div class="cell-main">
                                        <strong>{{ cellText(row, column.main) }}</strong>
                                        <span class="cell-sub">{{ cellText(row, column.sub) }}</span>
                                        <span v-if="column.tags && row[column.tags]?.length" class="tag-row">
                                            <span v-for="tag in row[column.tags]" :key="tag" class="tag">{{ tag }}</span>
                                        </span>
                                        <span v-if="panel.kind === 'identity' && column.main === 'address'" class="cell-actions">
                                            <button type="button" @click.stop="actions.openMailFromAddress(row.address)">查看收件</button>
                                            <button type="button" @click.stop="actions.copyText(row.address)">复制</button>
                                            <button type="button" @click.stop="actions.openSharePackage(row)">分享</button>
                                        </span>
                                    </div>
                                </template>
                                <span v-else-if="column.type === 'status'" class="status"
                                    :class="statusClass(row[column.key])">
                                    {{ cellText(row, column.key) }}
                                </span>
                                <span v-else-if="column.type === 'domainActions'" class="cell-actions domain-actions">
                                    <button v-if="row.receiveMode === 'cloudflare_email'" type="button"
                                        :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'cloudflare-setup')">
                                        自动配置
                                    </button>
                                    <button type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'verify-start')">
                                        开始验证
                                    </button>
                                    <button type="button"
                                        :disabled="!row.sourceId || !row.verificationAddress || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'verify-check')">
                                        检查验证
                                    </button>
                                    <button type="button" :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'verify')">
                                        检查路由
                                    </button>
                                    <button v-if="row.enabled === '启用'" type="button"
                                        :disabled="!row.sourceId || !!model.actionBusy"
                                        @click.stop="actions.handleDomainRowAction(row, 'domain-disable')">
                                        停用
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
                                <AdminEmptyState :action-label="model.hasActiveFilters ? '清除筛选' : ''"
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
                    <h2>固定凭证链接</h2>
                </div>
            </div>
            <div class="inner-pad">
                <dl class="kv">
                    <dt>当前策略</dt><dd>credential_version 校验</dd>
                    <dt>显示方式</dt><dd>管理员确认后展示一次</dd>
                    <dt>泄露处理</dt><dd>轮换后旧链接立即失效</dd>
                    <dt>审计</dt><dd>show / rotate / revoke 均写入事件</dd>
                </dl>
            </div>
        </section>

        <section v-if="model.activeView === 'routing'" class="panel split">
            <div class="panel-head">
                <div>
                    <h2>配置检查</h2>
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
                    <h2>内容处理</h2>
                </div>
            </div>
            <div class="inner-pad">
                <dl class="kv">
                    <dt>AI 提取</dt><dd><span class="status warn">灰度中</span></dd>
                    <dt>HTML 预览</dt><dd><span class="status ok">隔离渲染</span></dd>
                    <dt>附件转存</dt><dd><span class="status warn">仅展示入口</span></dd>
                    <dt>自动回复</dt><dd><span class="status warn">暂未执行生产写入</span></dd>
                </dl>
            </div>
        </section>
    </div>
</template>
