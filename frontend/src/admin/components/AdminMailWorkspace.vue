<script setup>
import { ref } from 'vue'

import MailContentRenderer from '../../components/MailContentRenderer.vue'
import { formatNumber, statusClass } from '../admin-formatters'

defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const mailList = ref(null)

defineExpose({
    scrollToTop: () => mailList.value?.scrollTo?.({ top: 0 }),
})
</script>

<template>
    <div class="mail-workbench" :class="`flow-mode-${model.ui.flowMode}`"
        :style="model.mailGridStyle" aria-label="收件流工作台">
        <aside class="mail-facets" aria-label="收件流筛选">
            <div class="facet-card">
                <div class="facet-title">
                    <strong>队列</strong>
                    <span class="help-tip" data-tip="常规邮件、未知收件人和渲染风险归在同一条收件链路里。" tabindex="0" aria-label="说明">?</span>
                    <button type="button" class="facet-mini-action mobile-only"
                        @click="model.ui.flowMode = 'list'; actions.syncMailQueryToRoute({ mode: undefined })">
                        返回列表
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
                    <strong>邮箱</strong>
                </div>
                <div class="mail-tree">
                    <button class="facet-row" :class="{ 'is-active': model.ui.domain === 'all' && model.ui.address === 'all' }"
                        type="button" @click="actions.setMailDomain('all')">
                        <span>全部域名</span>
                        <b>{{ formatNumber(model.mailHierarchy.queues[0]?.count ?? model.mailRows.length) }}</b>
                    </button>
                    <div v-for="domain in model.mailHierarchy.domains" :key="domain.id || domain.domain" class="tree-group">
                        <div class="domain-line" :class="{ 'is-active': model.ui.domain === domain.domain && model.ui.address === 'all' }">
                            <button class="tree-toggle-btn" type="button"
                                :class="{ 'is-collapsed': actions.isMailDomainCollapsed(domain.domain) }"
                                :aria-expanded="!actions.isMailDomainCollapsed(domain.domain)"
                                :aria-label="actions.isMailDomainCollapsed(domain.domain) ? '展开域名' : '折叠域名'"
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
        <button type="button" class="column-resizer facets-resizer" aria-label="调整筛选列宽"
            @pointerdown="actions.startMailColumnResize('facets-list', $event)"></button>

        <section class="mail-list-panel panel" aria-label="邮件列表">
            <div class="panel-head">
                <div>
                    <div class="panel-title-line">
                        <h2>收件箱</h2>
                        <span class="help-tip" data-tip="搜索支持 from:、to:、subject:、has:attachment、is:unread。" tabindex="0" aria-label="搜索说明">?</span>
                    </div>
                </div>
                <div class="panel-head-actions">
                    <button type="button" class="btn compact-btn mobile-only"
                        @click="model.ui.flowMode = 'filters'; actions.syncMailQueryToRoute({ mode: 'filters' })">
                        邮箱
                    </button>
                    <span class="status neutral">{{ formatNumber(model.filteredMailRows.length) }} 封</span>
                </div>
            </div>
            <div ref="mailList" class="mail-list" role="listbox" aria-label="邮件记录">
                <button v-for="row in model.filteredMailRows" :key="row.id" class="mail-row" type="button"
                    role="option" :aria-selected="actions.isSelected('flow', row)"
                    :class="{ 'is-selected': actions.isSelected('flow', row), 'is-unread': row.unread }"
                    @click="actions.selectRow('flow', row.id)"
                    @keydown="actions.handleRowKey($event, 'flow', row)">
                    <span class="mail-main">
                        <span class="mail-row-top">
                            <strong>{{ row.subject }}</strong>
                            <span class="mail-time">{{ row.time }}</span>
                        </span>
                        <span class="mail-snippet">{{ row.sender }}</span>
                        <small>{{ row.body }}</small>
                    </span>
                    <span v-if="row.result !== '已保存' || row.attachmentCount > 0" class="mail-meta">
                        <span class="status" :class="statusClass(row.result)">{{ row.result }}</span>
                        <span v-if="row.attachmentCount > 0">{{ row.attachmentCount }} 附件</span>
                    </span>
                </button>

                <div v-if="model.filteredUnknownRows.length" class="queue-section">
                    <div class="queue-title">异常队列</div>
                    <button v-for="row in model.filteredUnknownRows" :key="row.id" class="mail-row exception"
                        type="button" role="option" :aria-selected="actions.isSelected('exception', row)"
                        :class="{ 'is-selected': actions.isSelected('exception', row) }"
                        @click="actions.selectRow('exception', row.id)"
                        @keydown="actions.handleRowKey($event, 'exception', row)">
                        <span class="mail-main">
                            <span class="mail-row-top">
                                <strong>{{ row.title }}</strong>
                                <span class="mail-time">{{ row.level }}</span>
                            </span>
                            <span class="mail-snippet">{{ row.owner }}</span>
                            <small>{{ row.detail }}</small>
                        </span>
                        <span class="mail-meta">
                            <span class="status" :class="statusClass(row.status)">{{ row.status }}</span>
                        </span>
                    </button>
                </div>

                <div v-if="model.filteredMailRows.length === 0 && model.filteredUnknownRows.length === 0" class="empty-state">
                    <strong>没有匹配结果</strong>
                    <button v-if="model.hasActiveFilters" class="btn" type="button"
                        @click="actions.handleAction('reset-filters')">清除筛选</button>
                </div>
            </div>
        </section>
        <button type="button" class="column-resizer detail-resizer" aria-label="调整列表和详情列宽"
            @pointerdown="actions.startMailColumnResize('list-detail', $event)"></button>

        <aside class="mail-detail-panel panel" aria-label="邮件详情">
            <div class="panel-head">
                <div>
                    <h2>{{ model.currentRail.title }}</h2>
                    <p>{{ model.currentRail.subtitle }}</p>
                </div>
            </div>
            <div class="inner-pad detail-pane-body">
                <div v-if="model.currentRail.empty" class="empty-state reader-empty">
                    <strong>{{ model.currentRail.title }}</strong>
                    <span>{{ model.currentRail.subtitle }}</span>
                </div>
                <template v-else>
                    <div v-if="model.currentMail" class="mail-reader-actions">
                        <button type="button" class="btn mobile-only" @click="actions.closeMailDetail">返回列表</button>
                        <button type="button" class="btn" :disabled="!model.canGoPrevMail"
                            @click="actions.selectAdjacentMail(-1)">上一封</button>
                        <button type="button" class="btn" :disabled="!model.canGoNextMail"
                            @click="actions.selectAdjacentMail(1)">下一封</button>
                        <button type="button" class="btn" @click="actions.copyCurrent">复制收件地址</button>
                        <button type="button" class="btn danger" @click="actions.deleteCurrentMail">删除</button>
                    </div>
                    <dl v-if="model.currentMail" class="mail-summary">
                        <div>
                            <dt>发件人</dt>
                            <dd>{{ model.currentMail.sender }}</dd>
                        </div>
                        <div>
                            <dt>收件人</dt>
                            <dd>{{ model.currentMail.to }}</dd>
                        </div>
                        <div>
                            <dt>时间</dt>
                            <dd>{{ model.currentMail.fullTime || model.currentMail.time }}</dd>
                        </div>
                    </dl>
                    <div v-if="model.currentRail.tags?.length" class="tag-row rail-tags">
                        <span v-for="tag in model.currentRail.tags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                    <section class="body-section">
                        <div class="body-section-head">
                            <strong>正文</strong>
                            <div class="render-toggle" role="group" aria-label="正文显示模式">
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'html' }"
                                    :disabled="!model.currentRail.mail?.html"
                                    @click="model.ui.mailRenderMode = 'html'">HTML</button>
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'text' }"
                                    :disabled="!model.currentRail.mail?.text"
                                    @click="model.ui.mailRenderMode = 'text'">文本</button>
                                <button type="button" :class="{ 'is-active': model.ui.mailRenderMode === 'raw' }"
                                    :disabled="!model.currentRail.mail?.raw"
                                    @click="model.ui.mailRenderMode = 'raw'">原始</button>
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
                        <p v-else class="mail-body text-fallback">当前记录没有可展示正文。</p>
                    </section>
                    <section v-if="model.currentRail.mail?.attachments?.length" class="attachment-section">
                        <div class="body-section-head">
                            <strong>附件</strong>
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
                        <summary>技术信息</summary>
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
