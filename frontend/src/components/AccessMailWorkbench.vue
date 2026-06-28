<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, ArrowBackIosNewFilled, ArrowForwardIosFilled, InboxRound } from '@vicons/material'

import { useGlobalState } from '../store'
import { utcToLocalDate } from '../utils'
import { processItem } from '../utils/email-parser'
import MailContentRenderer from './MailContentRenderer.vue'
import AiExtractInfo from './AiExtractInfo.vue'

const props = defineProps({
  title: {
    type: String,
    default: '收件箱',
  },
  description: {
    type: String,
    default: '',
  },
  addressOptions: {
    type: Array,
    default: () => [],
  },
  addressFilter: {
    type: String,
    default: '',
  },
  showAddressFilter: {
    type: Boolean,
    default: false,
  },
  showEMailTo: {
    type: Boolean,
    default: true,
  },
  fetchMailData: {
    type: Function,
    required: true,
  },
  deleteMail: {
    type: Function,
    default: async () => {},
  },
  updateMailReadState: {
    type: Function,
    default: async () => {},
  },
  enableUserDeleteEmail: {
    type: Boolean,
    default: false,
  },
  showReply: {
    type: Boolean,
    default: false,
  },
  showSaveS3: {
    type: Boolean,
    default: false,
  },
  saveToS3: {
    type: Function,
    default: async () => {},
  },
})

const emit = defineEmits(['update:addressFilter'])
const message = useMessage()
const { t } = useScopedI18n('components.MailBox')
const { autoRefresh, configAutoRefreshInterval, useUTCDate, loading } = useGlobalState()

const rawData = ref([])
const curMail = ref(null)
const page = ref(1)
const pageSize = ref(20)
const count = ref(0)
const localFilterKeyword = ref('')
const isRefreshing = ref(false)
const timer = ref(null)
const autoRefreshInterval = ref(configAutoRefreshInterval.value)
const multiActionMode = ref(false)
const showMultiActionDownload = ref(false)
const showMultiActionDelete = ref(false)
const multiActionDownloadZip = ref({})
const multiActionDeleteProgress = ref({ percentage: 0, tip: '0/0' })
const detailPanelRef = ref(null)

const selectedAddress = computed({
  get: () => props.addressFilter || '',
  set: (value) => emit('update:addressFilter', value || ''),
})

const data = computed(() => {
  const keyword = localFilterKeyword.value.trim().toLowerCase()
  if (!keyword) return rawData.value
  return rawData.value.filter((mail) => [
    mail.subject || '',
    mail.text || '',
    mail.message || '',
    mail.source || '',
    mail.address || '',
  ].some((value) => String(value).toLowerCase().includes(keyword)))
})

const selectedCount = computed(() => data.value.filter((item) => item.checked).length)
const unreadCount = computed(() => data.value.filter((item) => item.unread).length)
const rangeLabel = computed(() => {
  if (!count.value) return '0 / 0'
  const start = (page.value - 1) * pageSize.value + 1
  const end = Math.min(page.value * pageSize.value, count.value)
  return `${start}-${end} / ${count.value}`
})

const canGoPrevMail = computed(() => {
  if (!curMail.value) return false
  const currentIndex = data.value.findIndex((mail) => mail.id === curMail.value.id)
  return currentIndex > 0 || page.value > 1
})

const canGoNextMail = computed(() => {
  if (!curMail.value) return false
  const currentIndex = data.value.findIndex((mail) => mail.id === curMail.value.id)
  return currentIndex < data.value.length - 1 || count.value > page.value * pageSize.value
})

const compactWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim()
const stripHtmlForPreview = (value) => compactWhitespace(String(value || '').replace(/<[^>]*>/g, ' '))
const mailPreview = (row) => stripHtmlForPreview(row.text || row.message || '').slice(0, 180)
const mailPrimaryAddress = (row) => compactWhitespace(row.source)
const mailSecondaryAddress = (row) => props.showEMailTo ? compactWhitespace(row.address) : ''

const mailItemClass = (row) => [
  curMail.value && row.id === curMail.value.id ? 'is-selected' : '',
  row.unread ? 'is-unread' : '',
].filter(Boolean).join(' ')

const markMailRead = async (row) => {
  if (!row || row.unread === false || row.is_read === true) return
  try {
    const result = await props.updateMailReadState(row.id, true)
    row.read_at = result?.read_at || row.read_at || new Date().toISOString()
    row.is_read = true
    row.unread = false
  } catch (error) {
    console.error(error)
    message.warning(t('markReadFailed'))
  }
}

const refresh = async ({ keepPage = true } = {}) => {
  try {
    if (!keepPage) page.value = 1
    isRefreshing.value = true
    loading.value = true
    const { results, count: totalCount } = await props.fetchMailData(
      pageSize.value,
      (page.value - 1) * pageSize.value,
    )
    rawData.value = await Promise.all((results || []).map(async (item) => {
      item.checked = false
      return await processItem(item)
    }))
    count.value = Number.isFinite(Number(totalCount)) ? Number(totalCount) : rawData.value.length
    const selectedId = curMail.value?.id
    curMail.value = data.value.find((mail) => mail.id === selectedId) || data.value[0] || null
  } catch (error) {
    console.error(error)
    message.error(error.message || 'error')
  } finally {
    isRefreshing.value = false
    loading.value = false
  }
}

const backFirstPageAndRefresh = async () => {
  await refresh({ keepPage: false })
}

const clickRow = async (row) => {
  if (multiActionMode.value) {
    row.checked = !row.checked
    return
  }
  curMail.value = row
  await markMailRead(row)
  await nextTick()
  if (typeof window !== 'undefined' && window.innerWidth <= 1180) {
    detailPanelRef.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }
}

const prevMail = async () => {
  if (!canGoPrevMail.value) return
  const currentIndex = data.value.findIndex((mail) => mail.id === curMail.value.id)
  if (currentIndex > 0) {
    curMail.value = data.value[currentIndex - 1]
    await markMailRead(curMail.value)
  } else if (page.value > 1) {
    page.value--
    await refresh()
    if (data.value.length > 0) {
      curMail.value = data.value[data.value.length - 1]
      await markMailRead(curMail.value)
    }
  }
}

const nextMail = async () => {
  if (!canGoNextMail.value) return
  const currentIndex = data.value.findIndex((mail) => mail.id === curMail.value.id)
  if (currentIndex < data.value.length - 1) {
    curMail.value = data.value[currentIndex + 1]
    await markMailRead(curMail.value)
  } else if (count.value > page.value * pageSize.value) {
    page.value++
    await refresh()
    if (data.value.length > 0) {
      curMail.value = data.value[0]
      await markMailRead(curMail.value)
    }
  }
}

const deleteCurrentMail = async () => {
  if (!curMail.value) return
  try {
    await props.deleteMail(curMail.value.id)
    message.success(t('success'))
    curMail.value = null
    await refresh()
  } catch (error) {
    message.error(error.message || 'error')
  }
}

const saveToS3Proxy = async (filename, blob) => {
  if (!curMail.value) return
  await props.saveToS3(curMail.value.id, filename, blob)
}

const multiActionModeClick = (enabled) => {
  data.value.forEach((item) => {
    item.checked = false
  })
  multiActionMode.value = enabled
}

const multiActionSelectAll = (checked) => {
  data.value.forEach((item) => {
    item.checked = checked
  })
}

const multiActionDeleteMail = async () => {
  try {
    const selectedMails = data.value.filter((item) => item.checked)
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'))
      return
    }
    isRefreshing.value = true
    multiActionDeleteProgress.value = { percentage: 0, tip: `0/${selectedMails.length}` }
    for (const [index, mail] of selectedMails.entries()) {
      await props.deleteMail(mail.id)
      multiActionDeleteProgress.value = {
        percentage: Math.floor(((index + 1) / selectedMails.length) * 100),
        tip: `${index + 1}/${selectedMails.length}`,
      }
    }
    showMultiActionDelete.value = true
    message.success(t('success'))
    await refresh()
  } catch (error) {
    message.error(error.message || 'error')
  } finally {
    isRefreshing.value = false
  }
}

const multiActionDownload = async () => {
  try {
    const selectedMails = data.value.filter((item) => item.checked)
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'))
      return
    }
    isRefreshing.value = true
    const JSZipModule = await import('jszip')
    const zip = new JSZipModule.default()
    for (const mail of selectedMails) {
      zip.file(`${mail.id}.eml`, mail.raw)
    }
    multiActionDownloadZip.value = {
      url: URL.createObjectURL(await zip.generateAsync({ type: 'blob' })),
      filename: `mails-${new Date().toISOString().replace(/:/g, '-')}.zip`,
    }
    showMultiActionDownload.value = true
  } catch (error) {
    message.error(error.message || 'error')
  } finally {
    isRefreshing.value = false
  }
}

const setupAutoRefresh = (enabled) => {
  autoRefreshInterval.value = configAutoRefreshInterval.value
  clearInterval(timer.value)
  timer.value = null
  if (!enabled) return
  timer.value = setInterval(async () => {
    if (isRefreshing.value) return
    autoRefreshInterval.value--
    if (autoRefreshInterval.value <= 0) {
      autoRefreshInterval.value = configAutoRefreshInterval.value
      await backFirstPageAndRefresh()
    }
  }, 1000)
}

watch(autoRefresh, setupAutoRefresh, { immediate: true })

watch([page, pageSize], async ([newPage, newPageSize], [oldPage, oldPageSize]) => {
  if (newPage !== oldPage || newPageSize !== oldPageSize) await refresh()
})

watch(() => props.addressFilter, async () => {
  await backFirstPageAndRefresh()
})

onMounted(async () => {
  await refresh()
})

onBeforeUnmount(() => {
  clearInterval(timer.value)
})
</script>

<template>
  <div class="access-mail-workbench">
    <section class="mail-command-surface">
      <div class="command-copy">
        <h2>{{ title }}</h2>
        <p>{{ description || '按发件人、主题、摘要和时间快速定位邮件。' }}</p>
      </div>
      <div class="command-controls">
        <n-select
          v-if="showAddressFilter"
          v-model:value="selectedAddress"
          class="address-filter"
          :options="addressOptions"
          clearable
          filterable
          placeholder="全部地址"
        />
        <n-input
          v-model:value="localFilterKeyword"
          class="keyword-filter"
          clearable
          placeholder="搜索当前页邮件"
        />
        <n-button :loading="isRefreshing" type="primary" @click="backFirstPageAndRefresh">
          同步
        </n-button>
      </div>
    </section>

    <section class="mail-workbench-grid">
      <aside class="mail-facets">
        <div class="facet-card">
          <span>当前页</span>
          <strong>{{ data.length }}</strong>
          <p>{{ rangeLabel }}</p>
        </div>
        <div class="facet-card">
          <span>未读</span>
          <strong>{{ unreadCount }}</strong>
          <p>{{ autoRefresh ? `自动同步 ${autoRefreshInterval}s` : '手动同步' }}</p>
        </div>
        <div class="facet-actions">
          <n-switch v-model:value="autoRefresh" size="small" :round="false">
            <template #checked>自动同步</template>
            <template #unchecked>手动同步</template>
          </n-switch>
          <n-button v-if="!multiActionMode" tertiary @click="multiActionModeClick(true)">
            {{ t('multiAction') }}
          </n-button>
          <template v-else>
            <n-button tertiary @click="multiActionModeClick(false)">
              {{ t('cancelMultiAction') }}
            </n-button>
            <n-button tertiary @click="multiActionSelectAll(true)">
              {{ t('selectAll') }}
            </n-button>
            <n-button tertiary @click="multiActionSelectAll(false)">
              {{ t('unselectAll') }}
            </n-button>
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail">
              <template #trigger>
                <n-button tertiary type="error" :disabled="selectedCount === 0">{{ t('delete') }}</n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
            <n-button tertiary type="info" :disabled="selectedCount === 0" @click="multiActionDownload">
              <template #icon>
                <n-icon :component="CloudDownloadRound" />
              </template>
              {{ t('downloadMail') }}
            </n-button>
          </template>
        </div>
      </aside>

      <section class="mail-list-panel">
        <div class="panel-head">
          <div>
            <span>邮件列表</span>
            <b>{{ count }} 封</b>
          </div>
          <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="count"
            :page-sizes="[20, 50, 100]"
            size="small"
            show-size-picker
          />
        </div>

        <div class="mail-list">
          <button
            v-for="row in data"
            :key="row.id"
            type="button"
            class="mail-row"
            :class="[mailItemClass(row), { 'has-checkbox': multiActionMode }]"
            @click="clickRow(row)"
          >
            <n-checkbox v-if="multiActionMode" v-model:checked="row.checked" @click.stop />
            <span v-if="row.unread" class="unread-dot" aria-label="未读" />
            <div class="mail-row-body">
              <div class="mail-row-head">
                <strong>{{ row.subject }}</strong>
                <time>{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
              </div>
              <div class="mail-row-meta">
                <span class="mail-pill">ID {{ row.id }}</span>
                <span>{{ showEMailTo ? `FROM: ${mailPrimaryAddress(row)}` : mailPrimaryAddress(row) }}</span>
                <span v-if="mailSecondaryAddress(row)">TO: {{ mailSecondaryAddress(row) }}</span>
              </div>
              <p v-if="mailPreview(row)">{{ mailPreview(row) }}</p>
              <AiExtractInfo :metadata="row.metadata" compact />
            </div>
          </button>

          <n-empty v-if="!isRefreshing && data.length === 0" class="empty-list" :description="t('emptyInbox')" />
          <n-skeleton v-if="isRefreshing && data.length === 0" text :repeat="8" />
        </div>
      </section>

      <section ref="detailPanelRef" class="mail-detail-panel">
        <div class="detail-toolbar">
          <n-button text size="small" :disabled="!canGoPrevMail" @click="prevMail">
            <template #icon>
              <n-icon><ArrowBackIosNewFilled /></n-icon>
            </template>
            {{ t('prevMail') }}
          </n-button>
          <n-button text size="small" icon-placement="right" :disabled="!canGoNextMail" @click="nextMail">
            <template #icon>
              <n-icon><ArrowForwardIosFilled /></n-icon>
            </template>
            {{ t('nextMail') }}
          </n-button>
        </div>

        <article v-if="curMail" class="detail-card">
          <header class="detail-head">
            <div>
              <span>邮件详情</span>
              <h2>{{ curMail.subject }}</h2>
            </div>
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteCurrentMail">
              <template #trigger>
                <n-button tertiary type="error" size="small">{{ t('delete') }}</n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
          </header>
          <MailContentRenderer
            :mail="curMail"
            :showEMailTo="showEMailTo"
            :enableUserDeleteEmail="false"
            :showReply="showReply"
            :showSaveS3="showSaveS3"
            :onDelete="deleteCurrentMail"
            :onSaveToS3="saveToS3Proxy"
          />
        </article>

        <div v-else class="empty-detail">
          <n-icon :component="InboxRound" :size="56" />
          <h2>{{ count === 0 ? t('emptyInbox') : t('pleaseSelectMail') }}</h2>
          <p>选择一封邮件后在这里阅读正文、元数据和附件。</p>
        </div>
      </section>
    </section>

    <n-modal v-model:show="showMultiActionDownload" preset="dialog" :title="t('downloadMail')">
      <n-tag type="info">{{ multiActionDownloadZip.filename }}</n-tag>
      <n-button
        tag="a"
        target="_blank"
        tertiary
        type="info"
        size="small"
        :download="multiActionDownloadZip.filename"
        :href="multiActionDownloadZip.url"
      >
        <n-icon :component="CloudDownloadRound" />
        {{ t('downloadMail') }} zip
      </n-button>
    </n-modal>

    <n-modal v-model:show="showMultiActionDelete" preset="dialog" :title="`${t('delete')} ${t('success')}`" negative-text="OK">
      <n-space justify="center">
        <n-progress type="circle" status="error" :percentage="multiActionDeleteProgress.percentage">
          <span>{{ multiActionDeleteProgress.tip }}</span>
        </n-progress>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.access-mail-workbench {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.mail-command-surface {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.6fr);
  gap: 14px;
  align-items: center;
  min-width: 0;
  border-radius: 8px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.06),
    0 1px 2px -1px rgba(15, 23, 42, 0.08),
    0 16px 48px -34px rgba(15, 23, 42, 0.5);
}

.command-copy h2,
.detail-head h2,
.empty-detail h2 {
  margin: 0;
  color: #020617;
  font-weight: 760;
  line-height: 1.2;
  text-wrap: balance;
}

.command-copy h2 {
  font-size: 18px;
}

.command-copy p,
.empty-detail p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
  text-wrap: pretty;
}

.command-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.address-filter {
  flex: 1 1 220px;
  min-width: 180px;
}

.keyword-filter {
  flex: 1 1 240px;
  min-width: 180px;
}

.mail-workbench-grid {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(320px, 0.92fr) minmax(460px, 1.38fr);
  grid-template-areas: "facets list detail";
  gap: 12px;
  min-width: 0;
  min-height: min(760px, calc(100dvh - 190px));
}

.mail-facets,
.mail-list-panel,
.mail-detail-panel,
.detail-card,
.empty-detail {
  min-width: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.06),
    0 1px 2px -1px rgba(15, 23, 42, 0.08),
    0 16px 48px -34px rgba(15, 23, 42, 0.48);
}

.mail-facets {
  grid-area: facets;
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 12px;
}

.facet-card {
  border-radius: 7px;
  padding: 12px;
  background: #f8fafc;
}

.facet-card span,
.panel-head span,
.detail-head span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}

.facet-card strong {
  display: block;
  margin-top: 4px;
  color: #0f172a;
  font-size: 25px;
  font-weight: 780;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.facet-card p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
}

.facet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.mail-list-panel,
.mail-detail-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.mail-list-panel {
  grid-area: list;
}

.mail-detail-panel {
  grid-area: detail;
}

.panel-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 54px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.panel-head b {
  color: #0f172a;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.mail-list {
  min-height: 0;
  overflow: auto;
}

.mail-row {
  display: grid;
  position: relative;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  width: 100%;
  border: 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  padding: 12px 12px 12px 24px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition-property: background-color, box-shadow, scale;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

.mail-row.has-checkbox {
  grid-template-columns: auto 8px minmax(0, 1fr);
  padding-left: 10px;
}

.mail-row:not(.has-checkbox) .mail-row-body {
  grid-column: 1;
}

.mail-row:active {
  scale: 0.99;
}

.mail-row:hover,
.mail-row.is-selected {
  background: #eef6ff;
}

.mail-row.is-selected {
  box-shadow: inset 3px 0 0 #0f6fd9;
}

.mail-row:not(.is-unread) .unread-dot {
  visibility: hidden;
}

.unread-dot {
  position: absolute;
  top: 18px;
  left: 10px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #0f6fd9;
}

.mail-row.has-checkbox .unread-dot {
  position: static;
  margin-top: 5px;
}

.mail-row-body {
  min-width: 0;
}

.mail-row-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
}

.mail-row-head strong {
  overflow: hidden;
  display: -webkit-box;
  color: #0f172a;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-wrap: pretty;
}

.mail-row.is-unread .mail-row-head strong {
  font-weight: 780;
}

.mail-row-head time {
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mail-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  min-width: 0;
  margin-top: 6px;
  color: #475569;
  font-size: 12px;
  line-height: 1.35;
}

.mail-row-meta span:not(.mail-pill) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 1px 7px;
  background: #eef2ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.mail-row p {
  overflow: hidden;
  display: -webkit-box;
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-wrap: pretty;
}

.empty-list {
  margin: 48px 12px;
}

.detail-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.detail-card {
  min-height: 0;
  overflow: auto;
  border-radius: 0 0 8px 8px;
  box-shadow: none;
}

.detail-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  padding: 18px 18px 10px;
}

.detail-head h2 {
  margin-top: 3px;
  font-size: 20px;
}

.detail-card :deep(.mail-content-renderer) {
  padding: 0 18px 18px;
}

.empty-detail {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 360px;
  padding: 24px;
  color: #64748b;
  text-align: center;
}

.empty-detail h2 {
  font-size: 18px;
}

@media (max-width: 1180px) {
  .mail-workbench-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "facets"
      "detail"
      "list";
    min-height: 0;
  }

  .mail-facets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .facet-actions {
    grid-column: 1 / -1;
  }

  .mail-detail-panel {
    order: 2;
  }

  .mail-list-panel {
    order: 3;
  }
}

@media (max-width: 720px) {
  .mail-command-surface,
  .panel-head,
  .detail-head {
    grid-template-columns: 1fr;
  }

  .command-controls {
    justify-content: flex-start;
  }

  .address-filter,
  .keyword-filter {
    flex-basis: 100%;
  }

  .mail-facets {
    grid-template-columns: 1fr;
  }

  .mail-row {
    padding-right: 10px;
  }

  .mail-row-head {
    grid-template-columns: 1fr;
    gap: 3px;
  }

  .mail-row-head time {
    order: -1;
  }

  .mail-row-meta span:not(.mail-pill) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .detail-card :deep(.mail-content-renderer) {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
