<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, InboxRound } from '@vicons/material'

import { useGlobalState } from '../store'
import { utcToLocalDate } from '../utils'
import { formatSenderDisplay, processItem, revokeMailObjectUrls, revokeObjectUrl, stripHtmlForPreview } from '../utils/email-parser'
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
const isBatchOperating = ref(false)
const isRowActionBusy = ref(false)
const timer = ref(null)
const autoRefreshInterval = ref(configAutoRefreshInterval.value)
const multiActionMode = ref(false)
const lastSelectedMailId = ref(null)
const showMultiActionDownload = ref(false)
const showMultiActionDelete = ref(false)
const multiActionDownloadZip = ref({})
const multiActionDeleteProgress = ref({ percentage: 0, tip: '0/0' })
const detailPanelRef = ref(null)

const isBusy = computed(() => isRefreshing.value || isBatchOperating.value || isRowActionBusy.value)

const selectedAddress = computed({
  get: () => props.addressFilter || '',
  set: (value) => emit('update:addressFilter', value || ''),
})

const data = computed(() => {
  const keyword = localFilterKeyword.value.trim().toLowerCase()
  if (!keyword) return rawData.value
  if (keyword === '__unread__') {
    return rawData.value.filter((mail) => mail.unread)
  }
  return rawData.value.filter((mail) => [
    mail.subject || '',
    mail.text || '',
    mail.message || '',
    mail.source || '',
    mail.address || '',
  ].some((value) => String(value).toLowerCase().includes(keyword)))
})

const selectedCount = computed(() => data.value.filter((item) => item.checked).length)
const unreadCount = computed(() => rawData.value.filter((item) => item.unread).length)
const rangeLabel = computed(() => {
  if (!count.value) return '0 / 0'
  const start = (page.value - 1) * pageSize.value + 1
  const end = Math.min(page.value * pageSize.value, count.value)
  return `${start}-${end} / ${count.value}`
})

const compactWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim()
const mailPreview = (row) => stripHtmlForPreview(row.text || row.message || '', 180)
const mailPrimaryAddress = (row) => compactWhitespace(row.source)
const mailSenderDisplay = (row) => formatSenderDisplay(row.source) || mailPrimaryAddress(row)
const mailSecondaryAddress = (row) => props.showEMailTo ? compactWhitespace(row.address) : ''

const mailItemClass = (row) => [
  curMail.value && row.id === curMail.value.id ? 'is-selected' : '',
  row.unread ? 'is-unread' : '',
  row.checked ? 'is-checked' : '',
].filter(Boolean).join(' ')

const updateSingleMailReadState = async (row, read = true) => {
  if (!row || typeof props.updateMailReadState !== 'function') return false
  const result = await props.updateMailReadState(row.id, read)
  if (result && typeof result === 'object' && result.success === false) {
    throw new Error('Failed to update mail read state')
  }
  if (read) {
    row.read_at = result?.read_at || row.read_at || new Date().toISOString()
    row.is_read = true
    row.unread = false
  } else {
    row.read_at = result?.read_at !== undefined ? result.read_at : null
    row.is_read = false
    row.unread = true
  }
  return true
}

const applyMailReadState = async (row, read = true) => {
  if (!row) return false
  if (read && row.unread === false && row.is_read === true) return true
  if (!read && row.unread === true && row.is_read === false) return true
  if (isBusy.value) return false

  try {
    isRowActionBusy.value = true
    return await updateSingleMailReadState(row, read)
  } catch (error) {
    console.error(error)
    message.warning(t('markReadFailed'))
    return false
  } finally {
    isRowActionBusy.value = false
  }
}

const toggleRowSelection = (row, { shiftKey = false } = {}) => {
  if (!row?.id) return
  const isCurrentlyChecked = !!row.checked
  const shouldCheck = !isCurrentlyChecked

  if (shiftKey && lastSelectedMailId.value && data.value.some((r) => r.id === lastSelectedMailId.value)) {
    const lastIdx = data.value.findIndex((r) => r.id === lastSelectedMailId.value)
    const currIdx = data.value.findIndex((r) => r.id === row.id)
    if (lastIdx !== -1 && currIdx !== -1) {
      const start = Math.min(lastIdx, currIdx)
      const end = Math.max(lastIdx, currIdx)
      for (let i = start; i <= end; i += 1) {
        data.value[i].checked = shouldCheck
      }
    }
  } else {
    row.checked = shouldCheck
  }
  lastSelectedMailId.value = row.id
}

const refresh = async ({ keepPage = true } = {}) => {
  try {
    if (!keepPage) page.value = 1
    isRefreshing.value = true
    loading.value = true
    lastSelectedMailId.value = null
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
    const parsedTotal = Number.isFinite(Number(totalCount)) ? Number(totalCount) : null
    if (page.value === 1) {
      count.value = parsedTotal !== null ? parsedTotal : rawData.value.length
    } else if (parsedTotal !== null && parsedTotal > 0) {
      count.value = parsedTotal
    }
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

const clickRow = async (row, { shiftKey = false } = {}) => {
  if (multiActionMode.value) {
    toggleRowSelection(row, { shiftKey })
    return
  }
  curMail.value = row
  await applyMailReadState(row, true)
  await nextTick()
  if (typeof window !== 'undefined' && window.innerWidth <= 1180) {
    detailPanelRef.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }
}

const handleRowKey = (event, row) => {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    clickRow(row, { shiftKey: event.shiftKey })
  }
}

const deleteSingleMail = async (row) => {
  if (!props.enableUserDeleteEmail || !row || isBusy.value) return
  try {
    isRowActionBusy.value = true
    await props.deleteMail(row.id)
    message.success(t('success'))
    if (curMail.value?.id === row.id) {
      curMail.value = null
    }
    await refresh()
  } catch (error) {
    message.error(error.message || 'error')
  } finally {
    isRowActionBusy.value = false
  }
}

const deleteCurrentMail = async () => {
  if (!props.enableUserDeleteEmail || !curMail.value) return
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
  lastSelectedMailId.value = null
  multiActionMode.value = enabled
}

const multiActionSelectAll = (checked) => {
  data.value.forEach((item) => {
    item.checked = checked
  })
  lastSelectedMailId.value = null
}

const multiActionMarkRead = async (read = true) => {
  if (isBusy.value) return
  const selectedMails = data.value.filter((item) => item.checked)
  if (selectedMails.length === 0) {
    message.error(t('pleaseSelectMail'))
    return
  }

  isBatchOperating.value = true
  isRefreshing.value = true
  let failCount = 0
  let successCount = 0

  try {
    for (const mail of selectedMails) {
      try {
        await updateSingleMailReadState(mail, read)
        successCount++
      } catch (err) {
        console.error(err)
        failCount++
      }
    }
    if (failCount > 0) {
      message.warning(t('markReadFailed'))
    } else {
      message.success(t('success'))
    }
  } finally {
    isBatchOperating.value = false
    isRefreshing.value = false
  }
}

const multiActionDeleteMail = async () => {
  if (!props.enableUserDeleteEmail) return
  try {
    const selectedMails = data.value.filter((item) => item.checked)
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'))
      return
    }
    isRefreshing.value = true
    isBatchOperating.value = true
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
    isBatchOperating.value = false
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
    isBatchOperating.value = true
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
    isBatchOperating.value = false
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
          <n-button v-if="!multiActionMode" size="tiny" tertiary @click="multiActionModeClick(true)">
            {{ t('multiAction') }}
          </n-button>
          <template v-else>
            <n-button size="tiny" tertiary :disabled="isBusy" @click="multiActionModeClick(false)">
              {{ t('cancelMultiAction') }}
            </n-button>
            <n-button size="tiny" tertiary :disabled="isBusy" @click="multiActionSelectAll(true)">
              {{ t('selectAll') }}
            </n-button>
            <n-button size="tiny" tertiary :disabled="isBusy" @click="multiActionSelectAll(false)">
              {{ t('unselectAll') }}
            </n-button>
            <n-button size="tiny" tertiary :disabled="selectedCount === 0 || isBusy" @click="multiActionMarkRead(true)">
              {{ t('markAsRead') }}
            </n-button>
            <n-button size="tiny" tertiary :disabled="selectedCount === 0 || isBusy" @click="multiActionMarkRead(false)">
              {{ t('markAsUnread') }}
            </n-button>
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail">
              <template #trigger>
                <n-button size="tiny" tertiary type="error" :disabled="selectedCount === 0 || isBusy">{{ t('delete') }}</n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
            <n-button size="tiny" tertiary type="info" :disabled="selectedCount === 0 || isBusy" @click="multiActionDownload">
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
        <div
          class="auto-sync-chip"
          :title="autoRefresh ? tw('autoSyncCountdown', { seconds: autoRefreshInterval }) : tw('autoSyncOff')"
          :aria-label="autoRefresh ? tw('autoSyncCountdown', { seconds: autoRefreshInterval }) : tw('autoSyncOff')"
        >
          <n-switch v-model:value="autoRefresh" size="small" :round="true" :aria-label="tw('autoSync')" />
          <span class="auto-sync-label">{{ autoRefresh ? `${autoRefreshInterval}s` : tw('autoSync') }}</span>
        </div>
        <n-button
          :loading="isRefreshing"
          type="primary"
          size="small"
          :aria-label="tw('sync')"
          @click="backFirstPageAndRefresh"
        >
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

        <div class="mail-list" role="list">
          <div
            v-for="row in data"
            :key="row.id"
            class="mail-row"
            role="listitem"
            tabindex="0"
            :class="[mailItemClass(row), { 'has-checkbox': multiActionMode }]"
            @click="clickRow(row, { shiftKey: $event.shiftKey })"
            @keydown="handleRowKey($event, row)"
          >
            <label
              v-if="multiActionMode"
              class="mail-row-select-cell"
              @click.stop.prevent="toggleRowSelection(row, { shiftKey: $event.shiftKey })"
            >
              <input
                type="checkbox"
                class="mail-row-checkbox"
                :checked="row.checked"
                :aria-label="tw('selectRow', { subject: row.subject || '' })"
                tabindex="0"
                @keydown.space.stop.prevent="toggleRowSelection(row, { shiftKey: $event.shiftKey })"
                @keydown.enter.stop.prevent="toggleRowSelection(row, { shiftKey: $event.shiftKey })"
              />
            </label>
            <div class="mail-row-content">
              <div class="mail-row-header">
                <span class="user-mail-sender" :title="mailPrimaryAddress(row)">{{ mailSenderDisplay(row) }}</span>
                <div class="user-mail-header-right">
                  <time class="user-mail-time">{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
                  <div class="user-mail-row-actions" role="toolbar" :aria-label="tw('rowActions')">
                    <button
                      v-if="row.unread"
                      type="button"
                      class="user-mail-action-btn"
                      :title="t('markAsRead')"
                      :aria-label="t('markAsRead')"
                      :disabled="isBusy"
                      @click.stop.prevent="applyMailReadState(row, true)"
                      @keydown.space.stop.prevent="applyMailReadState(row, true)"
                      @keydown.enter.stop.prevent="applyMailReadState(row, true)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6z" />
                        <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
                      </svg>
                    </button>
                    <button
                      v-else
                      type="button"
                      class="user-mail-action-btn"
                      :title="t('markAsUnread')"
                      :aria-label="t('markAsUnread')"
                      :disabled="isBusy"
                      @click.stop.prevent="applyMailReadState(row, false)"
                      @keydown.space.stop.prevent="applyMailReadState(row, false)"
                      @keydown.enter.stop.prevent="applyMailReadState(row, false)"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m3 7 9 6 9-6" />
                      </svg>
                    </button>
                    <n-popconfirm
                      v-if="enableUserDeleteEmail"
                      @positive-click="deleteSingleMail(row)"
                    >
                      <template #trigger>
                        <button
                          type="button"
                          class="user-mail-action-btn is-danger"
                          :title="t('delete')"
                          :aria-label="t('delete')"
                          :disabled="isBusy"
                          @click.stop
                          @keydown.space.stop
                          @keydown.enter.stop
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </template>
                      {{ t('deleteMailTip') }}
                    </n-popconfirm>
                  </div>
                </div>
              </div>
              <div class="mail-row-main">
                <strong class="user-mail-subject" :title="row.subject">{{ row.subject }}</strong>
                <span v-if="mailPreview(row)" class="user-mail-sep">-</span>
                <span v-if="mailPreview(row)" class="user-mail-preview">{{ mailPreview(row) }}</span>
              </div>
            </div>
          </div>

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
  white-space: nowrap;
  flex-shrink: 0;
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
  flex-wrap: wrap;
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
  display: flex;
  align-items: flex-start;
  gap: 10px;
  position: relative;
  width: 100%;
  min-height: 54px;
  border-bottom: 1px solid var(--ets-border);
  padding: 10px 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, box-shadow 120ms ease;
  box-sizing: border-box;
  outline: none;
}

.mail-row:focus-visible {
  outline: 2px solid var(--ets-focus-ring, #3b82f6);
  outline-offset: -2px;
}

.mail-row:hover,
.mail-row.is-selected {
  background: var(--ets-selected);
}

.mail-row.is-selected {
  box-shadow: inset 3px 0 0 var(--ets-brand);
}

.mail-row-select-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.mail-row-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--ets-brand, #3b82f6);
}

.mail-row-checkbox:focus-visible {
  outline: 2px solid var(--ets-focus-ring, #3b82f6);
  outline-offset: 2px;
}

.mail-row-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.mail-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.user-mail-sender {
  overflow: hidden;
  color: var(--ets-text-muted);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.mail-row.is-unread .user-mail-sender {
  color: var(--ets-text-strong);
  font-weight: 700;
}

.user-mail-header-right {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  min-height: 28px;
}

.user-mail-time {
  flex-shrink: 0;
  color: var(--ets-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  transition: opacity 120ms ease, visibility 120ms ease;
}

.mail-row.is-unread .user-mail-time {
  color: var(--ets-text-strong);
  font-weight: 650;
}

.user-mail-row-actions {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 120ms ease, visibility 120ms ease;
}

.user-mail-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ets-text-muted);
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 120ms ease, color 120ms ease;
}

.user-mail-action-btn svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.user-mail-action-btn:hover:not(:disabled) {
  background: var(--ets-hover, rgba(255, 255, 255, 0.08));
  color: var(--ets-text);
}

.user-mail-action-btn.is-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.user-mail-action-btn:focus-visible {
  outline: 2px solid var(--ets-focus-ring, #3b82f6);
  outline-offset: 1px;
  color: var(--ets-text);
}

.user-mail-action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mail-row:hover .user-mail-time,
.mail-row:focus .user-mail-time,
.mail-row:focus-within .user-mail-time {
  opacity: 0;
  visibility: hidden;
}

.mail-row:hover .user-mail-row-actions,
.mail-row:focus .user-mail-row-actions,
.mail-row:focus-within .user-mail-row-actions {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.mail-row-main {
  display: flex;
  align-items: baseline;
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
  flex-shrink: 0;
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
  min-width: 0;
  flex: 1;
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

@media (prefers-reduced-motion: reduce) {
  .user-mail-time,
  .user-mail-row-actions,
  .user-mail-action-btn,
  .user-filter-chip,
  .mail-row {
    transition: none !important;
  }
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

  .mail-detail-panel {
    order: 2;
  }

  .mail-list-panel {
    order: 3;
  }
}

@media (max-width: 720px) {
  .mail-command-surface {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .panel-head {
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 8px 12px;
    min-height: auto;
  }

  .panel-head :deep(.n-pagination) {
    flex-wrap: wrap;
    gap: 6px;
    max-width: 100%;
  }

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

  .mail-row {
    padding-right: 10px;
  }

  .user-mail-subject {
    max-width: 50%;
  }

  .detail-card :deep(.mail-content-renderer) {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
