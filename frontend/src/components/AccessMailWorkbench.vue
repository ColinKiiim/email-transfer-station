<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, InboxRound } from '@vicons/material'

import { useGlobalState } from '../store'
import { utcToLocalDate } from '../utils'
import { processItem, revokeMailObjectUrls, revokeObjectUrl } from '../utils/email-parser'
import MailContentRenderer from './MailContentRenderer.vue'
import AiExtractInfo from './AiExtractInfo.vue'

const props = defineProps({
  title: {
    type: String,
    default: '',
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
const { t: tw } = useScopedI18n('components.AccessMailWorkbench')
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
    const nextData = await Promise.all((results || []).map(async (item) => {
      item.checked = false
      return await processItem(item)
    }))
    revokeMailObjectUrls(rawData.value)
    rawData.value = nextData
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
    revokeObjectUrl(multiActionDownloadZip.value.url)
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
  revokeMailObjectUrls(rawData.value)
  revokeObjectUrl(multiActionDownloadZip.value.url)
})
</script>

<template>
  <div class="access-mail-workbench">
    <section class="mail-command-surface">
      <div class="command-copy">
        <span class="command-section-label">{{ title }}</span>
        <div class="filter-chips-row">
          <button
            type="button"
            class="user-filter-chip"
            :class="{ 'is-active': localFilterKeyword === '__unread__' }"
            @click="localFilterKeyword = (localFilterKeyword === '__unread__' ? '' : '__unread__')"
          >
            <span class="chip-dot"></span>
            <span>{{ tw('unread') }} ({{ unreadCount }})</span>
          </button>
          <div class="auto-sync-chip" :title="autoRefresh ? `自动同步开启（${autoRefreshInterval}s）` : '手动同步模式'">
            <n-switch v-model:value="autoRefresh" size="small" :round="true" />
            <span>{{ autoRefresh ? `${autoRefreshInterval}s` : tw('manualSync') }}</span>
          </div>
          <n-button v-if="!multiActionMode" size="tiny" tertiary @click="multiActionModeClick(true)">
            {{ t('multiAction') }}
          </n-button>
          <template v-else>
            <n-button size="tiny" tertiary @click="multiActionModeClick(false)">
              {{ t('cancelMultiAction') }}
            </n-button>
            <n-button size="tiny" tertiary @click="multiActionSelectAll(true)">
              {{ t('selectAll') }}
            </n-button>
            <n-button size="tiny" tertiary @click="multiActionSelectAll(false)">
              {{ t('unselectAll') }}
            </n-button>
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail">
              <template #trigger>
                <n-button size="tiny" tertiary type="error" :disabled="selectedCount === 0">{{ t('delete') }}</n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
            <n-button size="tiny" tertiary type="info" :disabled="selectedCount === 0" @click="multiActionDownload">
              <template #icon>
                <n-icon :component="CloudDownloadRound" />
              </template>
              {{ t('downloadMail') }}
            </n-button>
          </template>
        </div>
      </div>
      <div class="command-controls">
        <n-select
          v-if="showAddressFilter"
          v-model:value="selectedAddress"
          class="address-filter"
          :options="addressOptions"
          clearable
          filterable
          size="small"
          :placeholder="tw('allAddresses')"
        />
        <n-input
          v-if="localFilterKeyword !== '__unread__'"
          v-model:value="localFilterKeyword"
          class="keyword-filter"
          clearable
          size="small"
          :placeholder="tw('searchCurrentPage')"
        />
        <n-button :loading="isRefreshing" type="primary" size="small" @click="backFirstPageAndRefresh">
          {{ tw('sync') }}
        </n-button>
      </div>
    </section>

    <section class="mail-workbench-grid">
      <section class="mail-list-panel">
        <div class="panel-head">
          <div>
            <span>{{ tw('mailList') }}</span>
            <b>{{ tw('mailCount', { total: count }) }}</b>
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
            :class="[mailItemClass(row), { 'is-unread': row.unread, 'has-checkbox': multiActionMode }]"
            @click="clickRow(row)"
          >
            <n-checkbox v-if="multiActionMode" v-model:checked="row.checked" @click.stop />
            <span class="user-mail-sender">{{ mailPrimaryAddress(row) }}</span>
            <div class="user-mail-main">
              <strong class="user-mail-subject">{{ row.subject }}</strong>
              <span v-if="mailPreview(row)" class="user-mail-sep">-</span>
              <span v-if="mailPreview(row)" class="user-mail-preview">{{ mailPreview(row) }}</span>
            </div>
            <time class="user-mail-time">{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
          </button>

          <n-empty v-if="!isRefreshing && data.length === 0" class="empty-list" :description="t('emptyInbox')" />
          <n-skeleton v-if="isRefreshing && data.length === 0" text :repeat="8" />
        </div>
      </section>

      <section ref="detailPanelRef" class="mail-detail-panel">
        <article v-if="curMail" class="detail-card">
          <header class="detail-head">
            <div>
              <span>{{ tw('mailDetail') }}</span>
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
          <p>{{ tw('emptyDetailHint') }}</p>
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: 52px;
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--ets-surface);
  border: 1px solid var(--ets-border);
  box-shadow: var(--ets-shadow-card);
  box-sizing: border-box;
}

.command-copy {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.command-section-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--ets-text);
  white-space: nowrap;
}

.filter-chips-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.user-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--ets-border);
  border-radius: 6px;
  background: var(--ets-surface-alt);
  color: var(--ets-text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 120ms ease;
}

.user-filter-chip .chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ets-brand, #3b82f6);
}

.user-filter-chip:hover {
  background: var(--ets-hover);
  color: var(--ets-text);
}

.user-filter-chip.is-active {
  background: var(--ets-brand-soft, rgba(59, 130, 246, 0.14));
  color: var(--ets-brand, #3b82f6);
  border-color: rgba(59, 130, 246, 0.4);
  font-weight: 600;
}

.auto-sync-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--ets-surface-alt);
  border: 1px solid var(--ets-border);
  color: var(--ets-text-muted);
  font-size: 12px;
}

.command-copy p,
.empty-detail p {
  margin: 4px 0 0;
  color: var(--ets-text-muted);
  font-size: 12px;
  line-height: 1.45;
  text-wrap: pretty;
}

.command-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.address-filter {
  width: 220px;
  min-width: 160px;
}

.keyword-filter {
  width: 200px;
  min-width: 140px;
}

.mail-workbench-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.95fr) minmax(460px, 1.45fr);
  grid-template-areas: "list detail";
  gap: 12px;
  min-width: 0;
  min-height: min(760px, calc(100dvh - 160px));
}

.mail-list-panel,
.mail-detail-panel,
.detail-card,
.empty-detail {
  min-width: 0;
  border-radius: 8px;
  background: var(--ets-surface);
  border: 1px solid var(--ets-border);
  box-shadow: var(--ets-shadow-card);
}

.mail-list-panel,
.mail-detail-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.mail-detail-panel {
  grid-template-rows: minmax(0, 1fr);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--ets-border);
  background: var(--ets-surface);
  box-sizing: border-box;
}

.panel-head span {
  font-size: 13px;
  font-weight: 600;
  color: var(--ets-text-muted);
}

.panel-head b {
  color: var(--ets-text);
  font-size: 13px;
  font-weight: 700;
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}

.mail-list {
  min-height: 0;
  overflow: auto;
}

.mail-row {
  display: grid;
  position: relative;
  grid-template-columns: minmax(130px, 160px) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: 48px;
  border: 0;
  border-bottom: 1px solid var(--ets-border);
  padding: 10px 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: all 120ms ease;
}

.mail-row.has-checkbox {
  grid-template-columns: auto minmax(130px, 160px) minmax(0, 1fr) auto;
}

.mail-row:active {
  scale: 0.99;
}

.mail-row:hover,
.mail-row.is-selected {
  background: var(--ets-selected);
}

.mail-row.is-selected {
  box-shadow: inset 3px 0 0 var(--ets-brand);
}

.user-mail-sender {
  overflow: hidden;
  color: var(--ets-text-muted);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-row.is-unread .user-mail-sender {
  color: var(--ets-text-strong);
  font-weight: 700;
}

.user-mail-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.user-mail-subject {
  flex-shrink: 0;
  max-width: 60%;
  overflow: hidden;
  color: var(--ets-text);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-row.is-unread .user-mail-subject {
  color: var(--ets-text-strong);
  font-weight: 700;
}

.user-mail-sep {
  color: var(--ets-text-muted);
  opacity: 0.6;
  font-size: 12px;
}

.user-mail-preview {
  overflow: hidden;
  color: var(--ets-text-muted);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.user-mail-time {
  color: var(--ets-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mail-row.is-unread .user-mail-time {
  color: var(--ets-text-strong);
  font-weight: 650;
}

.empty-list {
  margin: 48px 12px;
}

.detail-card {
  overflow: auto;
  border-radius: 8px;
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
  color: var(--ets-text-muted);
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
