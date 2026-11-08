<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound } from '@vicons/material'

import { useGlobalState } from '../store'
import { utcToLocalDate } from '../utils'
import { formatMailListTime, formatMailReaderTime } from '../admin/admin-formatters'
import { buildReplyModel, buildForwardModel } from '../utils/mail-actions'
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
  badge: {
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
const { t: tw, locale } = useScopedI18n('components.AccessMailWorkbench')
const { autoRefresh, configAutoRefreshInterval, useUTCDate, loading, sendMailModel, indexTab } = useGlobalState()

const rawData = ref([])
const curMail = ref(null)
const page = ref(1)
const pageSize = ref(20)
const count = ref(0)
const localFilterKeyword = ref('')
const isRefreshing = ref(false)
const isLoaded = ref(false)
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
const readerRef = ref(null)

const isBusy = computed(() => isRefreshing.value || isBatchOperating.value || isRowActionBusy.value)

const selectedAddress = computed({
  // Naive treats '' as a chosen value and hides the placeholder; null means "all addresses".
  get: () => props.addressFilter || null,
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
const compactWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim()
// The HTML part keeps block boundaries (each tag becomes a space); parsed text can glue a heading to the next line.
const mailPreview = (row) => stripHtmlForPreview(row.message || row.text || '', 180)
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
    curMail.value = data.value.find((mail) => mail.id === selectedId) || null
  } catch (error) {
    console.error(error)
    message.error(error.message || 'error')
  } finally {
    isRefreshing.value = false
    isLoaded.value = true
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
  readerRef.value?.scrollTo?.({ top: 0 })
}

const closeReader = () => {
  curMail.value = null
}

const currentIndex = computed(() => (curMail.value ? data.value.findIndex((mail) => mail.id === curMail.value.id) : -1))
const positionLabel = computed(() => (currentIndex.value >= 0
  ? tw('positionLabel', { index: currentIndex.value + 1, total: data.value.length })
  : ''))
const openAdjacent = async (step) => {
  const next = data.value[currentIndex.value + step]
  if (next) await clickRow(next)
}

const pageCount = computed(() => Math.max(1, Math.ceil((count.value || 0) / pageSize.value)))
const canPrevPage = computed(() => page.value > 1)
const canNextPage = computed(() => page.value < pageCount.value || (rawData.value.length >= pageSize.value && !count.value))
const pagerLabel = computed(() => {
  if (!count.value) return tw('mailCount', { total: 0 })
  const start = (page.value - 1) * pageSize.value + 1
  const end = Math.min(page.value * pageSize.value, count.value)
  return tw('rangeLabel', { start, end, total: count.value })
})

const listTime = (row) => (useUTCDate.value
  ? utcToLocalDate(row.created_at, true)
  : formatMailListTime(row.created_at, locale.value))
const readerTime = (row) => (useUTCDate.value
  ? utcToLocalDate(row.created_at, true)
  : formatMailReaderTime(row.created_at, locale.value))
const senderInitial = (row) => (mailSenderDisplay(row) || '?').trim().charAt(0).toUpperCase()

const copyRecipient = async (value) => {
  try {
    await navigator.clipboard.writeText(value)
    message.success(tw('copied'))
  } catch (error) {
    message.error(error.message || 'error')
  }
}

const onWindowKeydown = (event) => {
  if (event.key !== 'Escape' || !curMail.value) return
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  closeReader()
}

const handleRowKey = (event, row) => {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    clickRow(row, { shiftKey: event.shiftKey })
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const sibling = event.key === 'ArrowDown'
      ? event.currentTarget.nextElementSibling
      : event.currentTarget.previousElementSibling
    if (sibling && typeof sibling.focus === 'function') sibling.focus()
  }
}

// Reply / forward prefill the compose page of the address mailbox.
const replyMail = () => {
  if (!curMail.value) return
  Object.assign(sendMailModel.value, buildReplyModel(curMail.value, t('reply')))
  indexTab.value = 'sendmail'
}

const forwardMail = () => {
  if (!curMail.value) return
  Object.assign(sendMailModel.value, buildForwardModel(curMail.value, t('forwardMail')))
  indexTab.value = 'sendmail'
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
  window.addEventListener('keydown', onWindowKeydown)
  await refresh()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  clearInterval(timer.value)
  revokeMailObjectUrls(rawData.value)
  revokeObjectUrl(multiActionDownloadZip.value.url)
})
</script>

<template>
  <div class="mail-workbench" :class="{ 'is-reading': !!curMail }">
    <!-- One toolbar row, same order as the admin inbox: selection, refresh, scope filters, search; pager trailing. -->
    <div class="mw-toolbar" role="toolbar" :aria-label="tw('listLabel')">
      <template v-if="!multiActionMode">
        <div class="mw-toolbar-lead">
          <h2 v-if="title" class="mw-title">
            <span>{{ title }}</span>
            <span v-if="badge" class="mw-badge">{{ badge }}</span>
          </h2>
          <button type="button" class="mw-btn mw-select-toggle" :disabled="isBusy" @click="multiActionModeClick(true)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
            <span>{{ t('multiAction') }}</span>
          </button>
          <button type="button" class="mw-btn is-icon mw-refresh" :class="{ 'is-spinning': isRefreshing }"
            :aria-label="tw('refresh')" :title="tw('refresh')" :disabled="isBusy" @click="backFirstPageAndRefresh">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" /></svg>
          </button>
          <n-select
            v-if="showAddressFilter"
            v-model:value="selectedAddress"
            class="mw-address"
            :options="addressOptions"
            clearable
            filterable
            size="small"
            :placeholder="tw('allAddresses')"
          />
          <button type="button" class="mw-chip" :class="{ 'is-active': localFilterKeyword === '__unread__' }"
            :aria-pressed="localFilterKeyword === '__unread__'" :title="tw('unreadFilter')"
            @click="localFilterKeyword = (localFilterKeyword === '__unread__' ? '' : '__unread__')">
            <span class="mw-chip-dot" aria-hidden="true"></span>
            <span>{{ tw('unread') }}</span>
            <span class="mw-chip-count">{{ unreadCount }}</span>
          </button>
          <label v-if="localFilterKeyword !== '__unread__'" class="mw-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
            <input v-model="localFilterKeyword" type="search" :placeholder="tw('searchCurrentPage')" :aria-label="tw('searchCurrentPage')" />
          </label>
        </div>
      </template>

      <template v-else>
        <div class="mw-toolbar-lead">
          <button type="button" class="mw-btn" :disabled="isBusy" @click="multiActionModeClick(false)">
            <span>{{ t('cancelMultiAction') }}</span>
          </button>
          <span class="mw-selection-count">{{ t('selectedCount', { count: selectedCount }) }}</span>
          <button type="button" class="mw-btn" :disabled="isBusy" @click="multiActionSelectAll(true)">{{ t('selectAll') }}</button>
          <button type="button" class="mw-btn" :disabled="isBusy" @click="multiActionSelectAll(false)">{{ t('unselectAll') }}</button>
          <span class="mw-separator" aria-hidden="true"></span>
          <button type="button" class="mw-btn" :disabled="selectedCount === 0 || isBusy" @click="multiActionMarkRead(true)">{{ t('markAsRead') }}</button>
          <button type="button" class="mw-btn" :disabled="selectedCount === 0 || isBusy" @click="multiActionMarkRead(false)">{{ t('markAsUnread') }}</button>
          <button type="button" class="mw-btn" :disabled="selectedCount === 0 || isBusy" @click="multiActionDownload">{{ t('downloadMail') }}</button>
          <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail">
            <template #trigger>
              <button type="button" class="mw-btn is-destructive" :disabled="selectedCount === 0 || isBusy">{{ t('delete') }}</button>
            </template>
            {{ t('deleteMailTip') }}
          </n-popconfirm>
        </div>
      </template>

      <div class="mw-toolbar-trail">
        <label class="mw-autosync"
          :title="autoRefresh ? tw('autoSyncCountdown', { seconds: autoRefreshInterval }) : tw('autoSyncOff')">
          <n-switch v-model:value="autoRefresh" size="small" :aria-label="tw('autoSync')" />
          <span>{{ autoRefresh ? `${autoRefreshInterval}s` : tw('autoSync') }}</span>
        </label>
        <div class="mw-pager">
          <span class="mw-range">{{ pagerLabel }}</span>
          <button type="button" class="mw-btn is-icon mw-prev-page" :aria-label="tw('previousPage')" :title="tw('previousPage')"
            :disabled="!canPrevPage || isBusy" @click="page -= 1">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button type="button" class="mw-btn is-icon mw-next-page" :aria-label="tw('nextPage')" :title="tw('nextPage')"
            :disabled="!canNextPage || isBusy" @click="page += 1">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="mw-body">
      <div class="mw-list" role="list" :aria-label="tw('listLabel')">
        <div
          v-for="row in data"
          :key="row.id"
          class="mail-row"
          role="listitem"
          tabindex="0"
          :aria-current="curMail && row.id === curMail.id ? 'true' : undefined"
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
          <span v-else class="mail-row-dot" aria-hidden="true"></span>
          <span class="mail-row-sender" :title="mailPrimaryAddress(row)">{{ mailSenderDisplay(row) }}</span>
          <span class="mail-row-main">
            <strong class="mail-row-subject">{{ row.subject }}</strong>
            <span v-if="mailPreview(row)" class="mail-row-preview">{{ mailPreview(row) }}</span>
          </span>
          <span v-if="mailSecondaryAddress(row) && !selectedAddress && addressOptions.length > 1" class="mail-row-to">
            {{ mailSecondaryAddress(row) }}
          </span>
          <time class="mail-row-time" :datetime="row.created_at">{{ listTime(row) }}</time>
          <span class="mail-row-actions" role="toolbar" :aria-label="tw('rowActions')">
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
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteSingleMail(row)">
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
          </span>
        </div>

        <n-empty v-if="isLoaded && !isRefreshing && data.length === 0" class="empty-list" :description="t('emptyInbox')" />
        <div v-if="(!isLoaded || isRefreshing) && data.length === 0" class="mw-skeleton">
          <n-skeleton text :repeat="8" />
        </div>
      </div>

      <section v-if="curMail" ref="readerRef" class="mw-reader" :aria-label="curMail.subject">
        <div class="mw-reader-toolbar" role="toolbar">
          <button type="button" class="mw-btn is-icon" :aria-label="t('backToList')" :title="t('backToList')" @click="closeReader">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          </button>
          <button type="button" class="mw-btn is-icon" :aria-label="t('markAsUnread')" :title="t('markAsUnread')"
            :disabled="isBusy" @click="applyMailReadState(curMail, false)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          </button>
          <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteCurrentMail">
            <template #trigger>
              <button type="button" class="mw-btn is-icon is-destructive" :aria-label="t('delete')" :title="t('delete')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            </template>
            {{ t('deleteMailTip') }}
          </n-popconfirm>
          <span class="mw-toolbar-spacer"></span>
          <span class="mw-range">{{ positionLabel }}</span>
          <button type="button" class="mw-btn is-icon" :aria-label="tw('newerMail')" :title="tw('newerMail')"
            :disabled="currentIndex <= 0" @click="openAdjacent(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button type="button" class="mw-btn is-icon" :aria-label="tw('olderMail')" :title="tw('olderMail')"
            :disabled="currentIndex < 0 || currentIndex + 1 >= data.length" @click="openAdjacent(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        <div class="mw-reader-body">
          <h2 class="mw-reader-subject">{{ curMail.subject }}</h2>
          <div class="mw-sender">
            <span class="mw-avatar" aria-hidden="true">{{ senderInitial(curMail) }}</span>
            <div class="mw-sender-body">
              <div class="mw-sender-row">
                <span class="mw-sender-identity">
                  <strong>{{ mailSenderDisplay(curMail) }}</strong>
                  <span v-if="mailSenderDisplay(curMail) !== mailPrimaryAddress(curMail)">{{ mailPrimaryAddress(curMail) }}</span>
                </span>
                <time :datetime="curMail.created_at">{{ readerTime(curMail) }}</time>
              </div>
              <div v-if="showEMailTo && curMail.address" class="mw-recipient">
                <span>{{ tw('sentTo', { address: curMail.address }) }}</span>
                <button type="button" class="mw-copy" :aria-label="tw('copyRecipient')" :title="tw('copyRecipient')"
                  @click="copyRecipient(curMail.address)">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
              </div>
            </div>
          </div>
          <MailContentRenderer
            :mail="curMail"
            :showEMailTo="showEMailTo"
            :showMetaBar="false"
            :showActions="true"
            :enableUserDeleteEmail="false"
            :showReply="showReply"
            :showSaveS3="showSaveS3"
            :onDelete="deleteCurrentMail"
            :onReply="replyMail"
            :onForward="forwardMail"
            :onSaveToS3="saveToS3Proxy"
          />
        </div>
      </section>
    </div>

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
/*
 * Same structure and metrics as the admin inbox: one 48px toolbar, a full-width
 * message list, and a reader that opens beside the list (or over it on phones).
 */
.mail-workbench {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--ets-surface);
  color: var(--ets-text);
}

.mail-workbench svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- Toolbar ---------- */

.mw-toolbar {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 6px 12px 6px 16px;
  border-bottom: 1px solid var(--ets-divider);
}

.mw-toolbar-lead,
.mw-toolbar-trail,
.mw-pager {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.mw-toolbar-trail {
  gap: 12px;
}

.mw-title {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  max-width: 260px;
  margin: 0 6px 0 0;
  color: var(--ets-text);
  font-size: var(--text-title3);
  font-weight: 600;
  line-height: var(--text-title3-lh);
}

.mw-title > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mw-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 1px 8px;
  background: var(--ets-surface-sunken);
  color: var(--ets-text-muted);
  font-size: var(--text-footnote);
  font-weight: 600;
  line-height: 18px;
}

.mw-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  height: var(--ets-control-sm);
  min-width: var(--ets-control-sm);
  border: 0;
  border-radius: var(--ets-radius-md);
  padding: 0 10px;
  background: transparent;
  color: var(--ets-text-muted);
  font: 500 var(--text-callout) / 1 var(--ets-font-ui);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--ets-motion-fast) ease, color var(--ets-motion-fast) ease;
}

.mw-btn:hover:not(:disabled) {
  background: var(--ets-hover);
  color: var(--ets-text);
}

.mw-btn:active:not(:disabled) {
  background: var(--ets-surface-sunken);
}

.mw-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mw-btn.is-icon {
  width: var(--ets-control-sm);
  padding: 0;
}

.mw-btn.is-destructive:hover:not(:disabled) {
  color: var(--ets-danger);
}

.mw-btn.is-spinning svg {
  animation: mw-spin 0.9s linear infinite;
}

@keyframes mw-spin {
  to { transform: rotate(360deg); }
}

.mw-address {
  width: 220px;
}

.mw-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: var(--ets-control-sm);
  border: 1px solid var(--ets-border);
  border-radius: 999px;
  padding: 0 10px;
  background: transparent;
  color: var(--ets-text-muted);
  font: 500 var(--text-callout) / 1 var(--ets-font-ui);
  cursor: pointer;
}

.mw-chip:hover {
  background: var(--ets-hover);
}

.mw-chip.is-active {
  border-color: transparent;
  background: var(--ets-selected);
  color: var(--ets-on-brand-soft);
}

.mw-chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--ets-brand);
}

.mw-chip-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.mw-search {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  width: 220px;
  height: var(--ets-control-sm);
  border-radius: var(--ets-radius-md);
  padding: 0 10px;
  background: var(--ets-surface-sunken);
  color: var(--ets-text-subtle);
}

.mw-search:focus-within {
  outline: 2px solid var(--ets-focus-ring);
  outline-offset: 0;
}

.mw-search svg {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
}

.mw-search input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--ets-text);
  font: var(--text-callout) / 1 var(--ets-font-ui);
  outline: none;
}

.mw-search input::-webkit-search-cancel-button {
  cursor: pointer;
}

.mw-selection-count {
  padding: 0 4px;
  color: var(--ets-text);
  font-size: var(--text-callout);
  font-weight: 600;
  white-space: nowrap;
}

.mw-separator {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--ets-border);
}

.mw-autosync {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--ets-text-muted);
  font-size: var(--text-callout);
  white-space: nowrap;
  cursor: pointer;
}

.mw-range {
  color: var(--ets-text-muted);
  font-size: var(--text-subheadline);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ---------- List + reader ---------- */

.mw-body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.mail-workbench.is-reading .mw-body {
  grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
}

.mw-list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.mail-workbench.is-reading .mw-list {
  border-right: 1px solid var(--ets-divider);
}

.mail-row {
  position: relative;
  display: grid;
  grid-template-columns: 22px minmax(120px, 200px) minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px solid var(--ets-divider);
  padding: 0 16px 0 12px;
  background: var(--ets-surface);
  color: var(--ets-text);
  font-size: var(--text-callout);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--ets-motion-fast) ease;
}

.mail-row:hover {
  background: var(--ets-hover);
}

.mail-row.is-checked {
  background: color-mix(in srgb, var(--ets-selected) 60%, var(--ets-surface));
}

.mail-row.is-selected {
  background: var(--ets-selected);
}

.mail-row-select-cell {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  cursor: pointer;
}

.mail-row-checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--ets-brand);
  cursor: pointer;
}

.mail-row-dot {
  justify-self: center;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: transparent;
}

.mail-row.is-unread .mail-row-dot {
  background: var(--ets-brand);
}

.mail-row-sender,
.mail-row-subject,
.mail-row-preview,
.mail-row-to {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-row-sender {
  color: var(--ets-text);
  font-weight: 400;
}

.mail-row-main {
  display: flex;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
  overflow: hidden;
}

.mail-row-subject {
  flex: 0 1 auto;
  max-width: 75%;
  color: var(--ets-text);
  font-weight: 400;
}

.mail-row-preview {
  flex: 1 1 0;
  min-width: 0;
  color: var(--ets-text-muted);
}

.mail-row.is-unread .mail-row-sender,
.mail-row.is-unread .mail-row-subject {
  font-weight: 600;
}

.mail-row-to {
  max-width: 180px;
  border-radius: 999px;
  padding: 1px 8px;
  background: var(--ets-surface-sunken);
  color: var(--ets-text-muted);
  font-size: var(--text-footnote);
}

.mail-row-time {
  min-width: 52px;
  color: var(--ets-text-muted);
  font-size: var(--text-subheadline);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.mail-row.is-unread .mail-row-time {
  color: var(--ets-text);
  font-weight: 600;
}

/* Hover actions replace the time on pointer devices (admin and Apple Mail behaviour). */
.mail-row-actions {
  position: absolute;
  top: 50%;
  right: 12px;
  display: flex;
  gap: 2px;
  border-radius: var(--ets-radius-md);
  padding: 2px;
  background: var(--ets-surface);
  box-shadow: var(--ets-shadow-raised);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity var(--ets-motion-fast) ease;
}

@media (hover: hover) {
  .mail-row:hover .mail-row-actions,
  .mail-row:focus-within .mail-row-actions {
    opacity: 1;
    pointer-events: auto;
  }
}

.user-mail-action-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--ets-radius-sm);
  padding: 0;
  background: transparent;
  color: var(--ets-text-muted);
  cursor: pointer;
}

.user-mail-action-btn svg {
  width: 16px;
  height: 16px;
}

.user-mail-action-btn:hover:not(:disabled) {
  background: var(--ets-hover);
  color: var(--ets-text);
}

.user-mail-action-btn.is-danger:hover:not(:disabled) {
  color: var(--ets-danger);
}

.user-mail-action-btn:disabled {
  opacity: 0.4;
}

/* Split view: rows become three-line cells like a Mail message list. */
.mail-workbench.is-reading .mail-row {
  grid-template-columns: 12px minmax(0, 1fr) auto;
  grid-template-areas:
    "dot sender time"
    ". main main";
  gap: 2px 8px;
  align-items: baseline;
  padding: 10px 12px;
}

.mail-workbench.is-reading .mail-row-dot,
.mail-workbench.is-reading .mail-row-select-cell {
  grid-area: dot;
  align-self: center;
}

.mail-workbench.is-reading .mail-row-sender { grid-area: sender; }
.mail-workbench.is-reading .mail-row-time { grid-area: time; }

.mail-workbench.is-reading .mail-row-main {
  display: grid;
  grid-area: main;
  gap: 2px;
}

.mail-workbench.is-reading .mail-row-subject {
  max-width: none;
}

.mail-workbench.is-reading .mail-row-to {
  display: none;
}

.empty-list {
  padding: 64px 16px;
}

.mw-skeleton {
  padding: 16px;
}

.mw-reader {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.mw-reader-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 4px;
  align-items: center;
  min-height: 44px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--ets-divider);
  background: var(--ets-surface);
}

.mw-toolbar-spacer {
  flex: 1 1 auto;
}

.mw-reader-body {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 20px 24px 32px;
}

.mw-reader-subject {
  margin: 0;
  color: var(--ets-text);
  font-size: var(--text-title1);
  font-weight: 600;
  line-height: var(--text-title1-lh);
  overflow-wrap: anywhere;
}

.mw-sender {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.mw-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--ets-brand);
  color: var(--ets-brand-contrast);
  font-size: var(--text-title3);
  font-weight: 600;
}

.mw-sender-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.mw-sender-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  justify-content: space-between;
}

.mw-sender-identity {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: baseline;
  min-width: 0;
}

.mw-sender-identity strong {
  color: var(--ets-text);
  font-size: var(--text-body);
  font-weight: 600;
}

.mw-sender-identity span,
.mw-sender-row time,
.mw-recipient {
  color: var(--ets-text-muted);
  font-size: var(--text-subheadline);
}

.mw-sender-row time {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mw-recipient {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.mw-recipient > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mw-copy {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: var(--ets-radius-sm);
  padding: 0;
  background: transparent;
  color: var(--ets-text-subtle);
  cursor: pointer;
}

.mw-copy svg {
  width: 14px;
  height: 14px;
}

.mw-copy:hover {
  background: var(--ets-hover);
  color: var(--ets-brand);
}

/* ---------- Narrow layouts ---------- */

@media (max-width: 1100px) {
  .mail-workbench.is-reading .mw-body {
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  }

  .mw-autosync span {
    display: none;
  }
}

/* Phones: list and reader are two screens (list → detail → back). */
@media (max-width: 760px) {
  .mw-toolbar {
    padding: 8px 12px;
  }

  /* Flatten the groups so the controls can be ordered into two rows:
     actions + pager first, then the filters. */
  .mw-toolbar-lead,
  .mw-toolbar-trail,
  .mw-pager {
    display: contents;
  }

  .mw-title {
    order: 0;
    flex: 1 0 100%;
    max-width: none;
  }

  .mw-select-toggle {
    order: 1;
    width: var(--ets-control-sm);
    padding: 0;
  }

  .mw-select-toggle span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .mw-refresh { order: 2; }
  .mw-chip { order: 3; }
  .mw-autosync { display: none; }

  .mw-range {
    order: 4;
    margin-left: auto;
  }

  .mw-prev-page { order: 5; }
  .mw-next-page { order: 6; }

  .mw-address,
  .mw-search {
    order: 7;
    flex: 1 1 100%;
    width: auto;
  }

  .mw-search {
    order: 8;
  }

  .mail-workbench.is-reading .mw-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .mail-workbench.is-reading .mw-list,
  .mail-workbench.is-reading .mw-toolbar {
    display: none;
  }

  .mail-row,
  .mail-workbench .mail-row {
    grid-template-columns: 12px minmax(0, 1fr) auto;
    grid-template-areas:
      "dot sender time"
      ". main main";
    gap: 2px 8px;
    align-items: baseline;
    padding: 10px 16px 10px 10px;
  }

  .mail-row-dot,
  .mail-row-select-cell {
    grid-area: dot;
    align-self: center;
  }

  .mail-row-sender { grid-area: sender; }
  .mail-row-time { grid-area: time; }

  .mail-row-main {
    display: grid;
    grid-area: main;
    gap: 2px;
  }

  .mail-row-subject {
    max-width: none;
  }

  .mail-row-preview {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
  }

  .mail-row-to {
    display: none;
  }

  .mail-row-actions {
    display: none;
  }

  .mw-reader-body {
    padding: 16px 16px 32px;
  }

  .mw-reader-toolbar .mw-btn.is-icon {
    width: 44px;
    height: 44px;
  }
}

/* Smallest phones: arrows and the unread count carry the position; the labels would wrap. */
@media (max-width: 420px) {
  .mw-range {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mw-btn.is-spinning svg {
    animation: none;
  }
}
</style>
