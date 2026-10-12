<script setup>
import { watch, onMounted, ref, onBeforeUnmount, computed } from "vue";
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { CloudDownloadRound, ArrowBackIosNewFilled, ArrowForwardIosFilled, InboxRound } from '@vicons/material'
import { useIsMobile } from '../utils/composables'
import { formatSenderDisplay, processItem, revokeMailObjectUrls, revokeObjectUrl, stripHtmlForPreview } from '../utils/email-parser'
import { utcToLocalDate } from '../utils';
import { buildReplyModel, buildForwardModel } from '../utils/mail-actions'
import MailContentRenderer from "./MailContentRenderer.vue";
import AiExtractInfo from "./AiExtractInfo.vue";

const message = useMessage()
const isMobile = useIsMobile()

const props = defineProps({
  enableUserDeleteEmail: {
    type: Boolean,
    default: false,
    required: false
  },
  showEMailTo: {
    type: Boolean,
    default: true,
    required: false
  },
  fetchMailData: {
    type: Function,
    default: () => { },
    required: true
  },
  deleteMail: {
    type: Function,
    default: () => { },
    required: false
  },
  updateMailReadState: {
    type: Function,
    default: async () => { },
    required: false
  },
  showReply: {
    type: Boolean,
    default: false,
    required: false
  },
  showSaveS3: {
    type: Boolean,
    default: false,
    required: false
  },
  saveToS3: {
    type: Function,
    default: (mail_id, filename, blob) => { },
    required: false
  },
  showFilterInput: {
    type: Boolean,
    default: false,
    required: false
  },
})

const localFilterKeyword = ref('')

const {
  isDark, mailboxSplitSize, indexTab, loading, useUTCDate,
  autoRefresh, configAutoRefreshInterval, sendMailModel
} = useGlobalState()
const autoRefreshInterval = ref(configAutoRefreshInterval.value)
const rawData = ref([])
const timer = ref(null)

const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

// Computed property for filtered data (only filter current page)
const data = computed(() => {
  if (!localFilterKeyword.value || localFilterKeyword.value.trim() === '') {
    return rawData.value;
  }
  const keyword = localFilterKeyword.value.toLowerCase();
  return rawData.value.filter(mail => {
    // Search in subject, text, message fields
    const searchFields = [
      mail.subject || '',
      mail.text || '',
      mail.message || ''
    ].map(field => field.toLowerCase());
    return searchFields.some(field => field.includes(keyword));
  });
})

const canGoPrevMail = computed(() => {
  if (!curMail.value) return false
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)
  return currentIndex > 0 || page.value > 1
})

const canGoNextMail = computed(() => {
  if (!curMail.value) return false
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)
  return currentIndex < data.value.length - 1 || count.value > page.value * pageSize.value
})

const prevMail = async () => {
  if (!canGoPrevMail.value) return
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)

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
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)

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

const curMail = ref(null);

const multiActionMode = ref(false)
const showMultiActionDownload = ref(false)
const showMultiActionDelete = ref(false)
const multiActionDownloadZip = ref({})
const multiActionDeleteProgress = ref({ percentage: 0, tip: '0/0' })

const { t } = useScopedI18n('components.MailBox')

const setupAutoRefresh = async (autoRefresh) => {
  // auto refresh every configAutoRefreshInterval seconds
  autoRefreshInterval.value = configAutoRefreshInterval.value;
  if (autoRefresh) {
    clearInterval(timer.value);
    timer.value = setInterval(async () => {
      if (loading.value) return;
      autoRefreshInterval.value--;
      if (autoRefreshInterval.value <= 0) {
        autoRefreshInterval.value = configAutoRefreshInterval.value;
        await backFirstPageAndRefresh();
      }
    }, 1000)
  } else {
    clearInterval(timer.value)
    timer.value = null
  }
}

watch(autoRefresh, async (autoRefresh, old) => {
  setupAutoRefresh(autoRefresh)
}, { immediate: true })

watch([page, pageSize], async ([page, pageSize], [oldPage, oldPageSize]) => {
  if (page !== oldPage || pageSize !== oldPageSize) {
    await refresh();
  }
})

const refresh = async () => {
  try {
    const { results, count: totalCount } = await props.fetchMailData(
      pageSize.value, (page.value - 1) * pageSize.value
    );
    loading.value = true;
    const nextData = await Promise.all((results || []).map(async (item) => {
      item.checked = false;
      return await processItem(item);
    }));
    revokeMailObjectUrls(rawData.value);
    rawData.value = nextData;
    count.value = Number.isFinite(Number(totalCount)) ? Number(totalCount) : rawData.value.length;
    const selectedId = curMail.value?.id;
    curMail.value = data.value.find((mail) => mail.id === selectedId) || null;
    if (!isMobile.value && !curMail.value && data.value.length > 0) {
      curMail.value = data.value[0];
    }
  } catch (error) {
    message.error(error.message || "error");
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const backFirstPageAndRefresh = async () => {
  page.value = 1;
  await refresh();
}

const isRowSelected = (row) => Boolean(curMail.value && curMail.value.id == row.id);

const handleRowKey = (event, row) => {
  if (event.target !== event.currentTarget) return;

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    clickRow(row);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const next = event.currentTarget.nextElementSibling;
    if (next && typeof next.focus === 'function') next.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const prev = event.currentTarget.previousElementSibling;
    if (prev && typeof prev.focus === 'function') prev.focus();
  }
};

const clickRow = async (row) => {
  if (multiActionMode.value) {
    row.checked = !row.checked;
    return;
  }
  curMail.value = row;
  await markMailRead(row);
};

const markMailRead = async (row) => {
  if (!row || row.unread === false || row.is_read === true) return;
  try {
    const result = await props.updateMailReadState(row.id, true);
    row.read_at = result?.read_at || row.read_at || new Date().toISOString();
    row.is_read = true;
    row.unread = false;
  } catch (error) {
    console.error(error);
    message.warning(t('markReadFailed'));
  }
};

const mailSenderDisplay = (row) => formatSenderDisplay(row.source) || row.source || 'Unknown Sender';

const mailItemClass = (row) => {
  return [
    curMail.value && row.id == curMail.value.id ? 'mail-row-active' : '',
    row.unread ? 'mail-unread' : '',
  ].filter(Boolean).join(' ');
};

const compactWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const mailPreview = (row) => {
  return stripHtmlForPreview(row.text || row.message || '', 180);
};

const mailPrimaryAddress = (row) => compactWhitespace(row.source);

const mailSecondaryAddress = (row) => props.showEMailTo ? compactWhitespace(row.address) : '';

const deleteMail = async () => {
  try {
    await props.deleteMail(curMail.value.id);
    message.success(t("success"));
    curMail.value = null;
    await refresh();
  } catch (error) {
    message.error(error.message || "error");
  }
};

const replyMail = async () => {
  Object.assign(sendMailModel.value, buildReplyModel(curMail.value, t('reply')));
  indexTab.value = 'sendmail';
};

const forwardMail = async () => {
  Object.assign(sendMailModel.value, buildForwardModel(curMail.value, t('forwardMail')));
  indexTab.value = 'sendmail';
};

const onSpiltSizeChange = (size) => {
  mailboxSplitSize.value = size;
}

const saveToS3Proxy = async (filename, blob) => {
  await props.saveToS3(curMail.value.id, filename, blob);
}

const multiActionModeClick = (enableMulti) => {
  if (enableMulti) {
    data.value.forEach((item) => {
      item.checked = false;
    });
    multiActionMode.value = true;
  } else {
    multiActionMode.value = false;
    data.value.forEach((item) => {
      item.checked = false;
    });
  }
}

const multiActionSelectAll = (checked) => {
  data.value.forEach((item) => {
    item.checked = checked;
  });
}

const selectedCount = computed(() => data.value.filter((item) => item.checked).length)

const multiActionMarkRead = async (read = true) => {
  try {
    loading.value = true;
    const selectedMails = data.value.filter((item) => item.checked);
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'));
      return;
    }
    for (const mail of selectedMails) {
      const result = await props.updateMailReadState(mail.id, read);
      if (read) {
        mail.read_at = result?.read_at || mail.read_at || new Date().toISOString();
        mail.is_read = true;
        mail.unread = false;
      } else {
        mail.read_at = result?.read_at !== undefined ? result.read_at : null;
        mail.is_read = false;
        mail.unread = true;
      }
    }
    message.success(t("success"));
  } catch (error) {
    message.error(error.message || "error");
  } finally {
    loading.value = false;
  }
}

const multiActionDeleteMail = async () => {
  try {
    loading.value = true;
    const selectedMails = data.value.filter((item) => item.checked);
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'));
      return;
    }
    multiActionDeleteProgress.value = {
      percentage: 0,
      tip: `0/${selectedMails.length}`
    };
    for (const [index, mail] of selectedMails.entries()) {
      await props.deleteMail(mail.id);
      showMultiActionDelete.value = true;
      multiActionDeleteProgress.value = {
        percentage: Math.floor((index + 1) / selectedMails.length * 100),
        tip: `${index + 1}/${selectedMails.length}`
      };
    }
    message.success(t("success"));
    await refresh();
  } catch (error) {
    message.error(error.message || "error");
  } finally {
    loading.value = false;
    showMultiActionDelete.value = true;
  }
}

const multiActionDownload = async () => {
  try {
    loading.value = true;
    const selectedMails = data.value.filter((item) => item.checked);
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'));
      return;
    }
    const JSZipModlue = await import('jszip');
    const JSZip = JSZipModlue.default;
    const zip = new JSZip();
    for (const mail of selectedMails) {
      zip.file(`${mail.id}.eml`, mail.raw);
    }
    revokeObjectUrl(multiActionDownloadZip.value.url);
    multiActionDownloadZip.value = {
      url: URL.createObjectURL(await zip.generateAsync({ type: "blob" })),
      filename: `mails-${new Date().toISOString().replace(/:/g, '-')}.zip`
    }
    showMultiActionDownload.value = true;
  } catch (error) {
    message.error(error.message || "error");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await refresh();
});

onBeforeUnmount(() => {
  clearInterval(timer.value)
  revokeMailObjectUrls(rawData.value)
  revokeObjectUrl(multiActionDownloadZip.value.url)
})
</script>

<template>
  <div>
    <div v-if="!isMobile" class="left">
      <div class="mailbox-toolbar-wrap">
        <div v-if="multiActionMode" class="mailbox-toolbar multi-mode">
          <div class="toolbar-actions-left">
            <n-button @click="multiActionModeClick(false)" secondary size="small">
              {{ t('cancelMultiAction') }}
            </n-button>
            <n-button @click="multiActionSelectAll(true)" secondary size="small">
              {{ t('selectAll') }}
            </n-button>
            <n-button @click="multiActionSelectAll(false)" secondary size="small" :disabled="selectedCount === 0">
              {{ t('unselectAll') }}
            </n-button>
            <n-button @click="multiActionMarkRead(true)" secondary size="small" :disabled="selectedCount === 0">
              {{ t('markAsRead') }}
            </n-button>
            <n-button @click="multiActionMarkRead(false)" secondary size="small" :disabled="selectedCount === 0">
              {{ t('markAsUnread') }}
            </n-button>
            <n-tag v-if="selectedCount > 0" size="small" type="info" :bordered="false" round>
              {{ t('selectedCount', { count: selectedCount }) }}
            </n-tag>
          </div>
          <div class="toolbar-actions-right">
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail" :disabled="selectedCount === 0">
              <template #trigger>
                <n-button tertiary type="error" size="small" :disabled="selectedCount === 0">{{ t('delete') }}</n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
            <n-button @click="multiActionDownload" secondary type="info" size="small" :disabled="selectedCount === 0">
              <template #icon>
                <n-icon :component="CloudDownloadRound" />
              </template>
              {{ t('downloadMail') }}
            </n-button>
          </div>
        </div>
        <div v-else class="mailbox-toolbar">
          <div class="toolbar-actions-left">
            <n-button @click="multiActionModeClick(true)" secondary size="small">
              {{ t('multiAction') }}
            </n-button>
            <n-button @click="backFirstPageAndRefresh" secondary size="small" :loading="loading">
              {{ t('refresh') }}
            </n-button>
            <div class="auto-refresh-control">
              <n-switch v-model:value="autoRefresh" size="small" :round="false" />
              <span class="auto-refresh-label">
                {{ autoRefresh ? t('refreshAfter', { msg: autoRefreshInterval }) : t('autoRefresh') }}
              </span>
            </div>
          </div>
          <div class="toolbar-actions-right">
            <n-input
              v-if="showFilterInput"
              v-model:value="localFilterKeyword"
              :placeholder="t('keywordQueryTip')"
              size="small"
              class="mail-search-input"
              clearable
            />
            <n-pagination
              v-model:page="page"
              v-model:page-size="pageSize"
              :item-count="count"
              :page-sizes="[20, 50, 100]"
              size="small"
              show-size-picker
            />
          </div>
        </div>
      </div>
      <div v-if="!curMail" class="desktop-fullwidth-stream">
        <n-list hoverable clickable>
          <n-list-item
            v-for="row in data"
            :key="row.id"
            role="button"
            :tabindex="0"
            :aria-pressed="isRowSelected(row)"
            :aria-label="`${row.unread ? t('unread') + ' ' : ''}${row.subject || '(无主题)'}`"
            :class="mailItemClass(row)"
            @click="() => clickRow(row)"
            @keydown="handleRowKey($event, row)"
          >
            <template #prefix v-if="multiActionMode">
              <n-checkbox v-model:checked="row.checked" class="mail-select-checkbox" @click.stop />
            </template>
            <div class="mail-list-row">
              <div class="mail-row-header">
                <div class="mail-row-sender-wrap">
                  <span v-if="row.unread" class="mail-unread-dot" :title="t('unread')" />
                  <span class="mail-row-sender" :title="mailPrimaryAddress(row)">
                    {{ mailSenderDisplay(row) }}
                  </span>
                  <span v-if="mailSecondaryAddress(row)" class="mail-row-address muted-address">
                    TO: {{ mailSecondaryAddress(row) }}
                  </span>
                </div>
                <div class="mail-row-right">
                  <span class="mail-row-id">#{{ row.id }}</span>
                  <time class="mail-row-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
                </div>
              </div>
              <div class="mail-row-main">
                <strong class="mail-row-title">{{ row.subject || '(无主题)' }}</strong>
                <span v-if="mailPreview(row)" class="mail-row-sep">-</span>
                <span v-if="mailPreview(row)" class="mail-row-snippet">{{ mailPreview(row) }}</span>
              </div>
              <AiExtractInfo :metadata="row.metadata" compact />
            </div>
          </n-list-item>
        </n-list>
        <div v-if="count === 0" style="padding: 48px 16px; text-align: center;">
          <n-result status="info" :title="t('emptyInbox')">
            <template #icon>
              <n-icon :component="InboxRound" :size="80" />
            </template>
          </n-result>
        </div>
      </div>
      <n-split v-else class="left" direction="horizontal" :max="0.75" :min="0.25" :default-size="mailboxSplitSize"
        :on-update:size="onSpiltSizeChange">
        <template #1>
          <div class="desktop-mail-list-pane">
            <n-list hoverable clickable>
              <n-list-item
                v-for="row in data"
                :key="row.id"
                role="button"
                :tabindex="0"
                :aria-pressed="isRowSelected(row)"
                :aria-label="`${row.unread ? t('unread') + ' ' : ''}${row.subject || '(无主题)'}`"
                :class="mailItemClass(row)"
                @click="() => clickRow(row)"
                @keydown="handleRowKey($event, row)"
              >
                <template #prefix v-if="multiActionMode">
                  <n-checkbox v-model:checked="row.checked" class="mail-select-checkbox" @click.stop />
                </template>
                <div class="mail-list-row">
                  <div class="mail-row-header">
                    <div class="mail-row-sender-wrap">
                      <span v-if="row.unread" class="mail-unread-dot" :title="t('unread')" />
                      <span class="mail-row-sender" :title="mailPrimaryAddress(row)">
                        {{ mailSenderDisplay(row) }}
                      </span>
                      <span v-if="mailSecondaryAddress(row)" class="mail-row-address muted-address">
                        TO: {{ mailSecondaryAddress(row) }}
                      </span>
                    </div>
                    <div class="mail-row-right">
                      <span class="mail-row-id">#{{ row.id }}</span>
                      <time class="mail-row-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
                    </div>
                  </div>
                  <div class="mail-row-main">
                    <strong class="mail-row-title">{{ row.subject || '(无主题)' }}</strong>
                    <span v-if="mailPreview(row)" class="mail-row-sep">-</span>
                    <span v-if="mailPreview(row)" class="mail-row-snippet">{{ mailPreview(row) }}</span>
                  </div>
                  <AiExtractInfo :metadata="row.metadata" compact />
                </div>
              </n-list-item>
            </n-list>
          </div>
        </template>
        <template #2>
          <div class="split-detail-header">
            <n-flex justify="space-between" align="center">
              <n-button @click="curMail = null" size="small" quaternary>
                ✕ {{ t('backToList') || '关闭详情' }}
              </n-button>
              <n-space size="small">
                <n-button @click="prevMail" :disabled="!canGoPrevMail" text size="small">
                  <template #icon>
                    <n-icon>
                      <ArrowBackIosNewFilled />
                    </n-icon>
                  </template>
                  {{ t('prevMail') }}
                </n-button>
                <n-button @click="nextMail" :disabled="!canGoNextMail" text size="small" icon-placement="right">
                  <template #icon>
                    <n-icon>
                      <ArrowForwardIosFilled />
                    </n-icon>
                  </template>
                  {{ t('nextMail') }}
                </n-button>
              </n-space>
            </n-flex>
          </div>
          <n-card :bordered="false" embedded class="mail-item" :title="curMail.subject"
            style="overflow: auto; max-height: calc(100vh - 140px);">
            <MailContentRenderer :mail="curMail" :showEMailTo="showEMailTo"
              :enableUserDeleteEmail="enableUserDeleteEmail" :showReply="showReply" :showSaveS3="showSaveS3"
              :onDelete="deleteMail" :onReply="replyMail" :onForward="forwardMail" :onSaveToS3="saveToS3Proxy" />
          </n-card>
        </template>
      </n-split>
    </div>
    <div class="left" v-else>
      <n-space class="mobile-mailbox-toolbar" justify="start" align="center" :wrap="true">
        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" simple size="small" />
        <n-switch v-model:value="autoRefresh" size="small" :round="false">
          <template #checked>
            {{ t('refreshAfter', { msg: autoRefreshInterval }) }}
          </template>
          <template #unchecked>
            {{ t('autoRefresh') }}
          </template>
        </n-switch>
        <n-button @click="backFirstPageAndRefresh" tertiary size="small" type="primary">
          {{ t('refresh') }}
        </n-button>
      </n-space>
      <div v-if="showFilterInput" style="padding: 0 10px; margin-top: 8px; margin-bottom: 10px;">
        <n-input v-model:value="localFilterKeyword"
          :placeholder="t('keywordQueryTip')" size="small" clearable />
      </div>
      <div class="mobile-mail-list">
        <n-list hoverable clickable>
          <n-list-item
            v-for="row in data"
            :key="row.id"
            role="button"
            :tabindex="0"
            :aria-pressed="isRowSelected(row)"
            :aria-label="`${row.unread ? t('unread') + ' ' : ''}${row.subject || '(无主题)'}`"
            :class="mailItemClass(row)"
            @click="() => clickRow(row)"
            @keydown="handleRowKey($event, row)"
          >
            <div class="mail-list-row">
              <div class="mail-row-header">
                <div class="mail-row-sender-wrap">
                  <span v-if="row.unread" class="mail-unread-dot" :title="t('unread')" />
                  <span class="mail-row-sender" :title="mailPrimaryAddress(row)">
                    {{ mailSenderDisplay(row) }}
                  </span>
                  <span v-if="mailSecondaryAddress(row)" class="mail-row-address muted-address">
                    TO: {{ mailSecondaryAddress(row) }}
                  </span>
                </div>
                <div class="mail-row-right">
                  <span class="mail-row-id">#{{ row.id }}</span>
                  <time class="mail-row-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
                </div>
              </div>
              <div class="mail-row-main">
                <strong class="mail-row-title">{{ row.subject || '(无主题)' }}</strong>
                <span v-if="mailPreview(row)" class="mail-row-sep">-</span>
                <span v-if="mailPreview(row)" class="mail-row-snippet">{{ mailPreview(row) }}</span>
              </div>
              <AiExtractInfo :metadata="row.metadata" compact />
            </div>
          </n-list-item>
        </n-list>
      </div>
      <n-drawer v-model:show="curMail" width="100%" placement="bottom"
        style="height: min(86vh, 720px);">
        <n-drawer-content :title="curMail ? curMail.subject : ''" closable>
          <n-card :bordered="false" embedded style="overflow: auto;">
            <MailContentRenderer :mail="curMail" :showEMailTo="showEMailTo"
              :enableUserDeleteEmail="enableUserDeleteEmail" :showReply="showReply" :showSaveS3="showSaveS3"
              :useUTCDate="useUTCDate" :onDelete="deleteMail" :onReply="replyMail" :onForward="forwardMail"
              :onSaveToS3="saveToS3Proxy" />
          </n-card>
        </n-drawer-content>
      </n-drawer>
    </div>
    <n-modal v-model:show="showMultiActionDownload" preset="dialog" :title="t('downloadMail')">
      <n-tag type="info">
        {{ multiActionDownloadZip.filename }}
      </n-tag>
      <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="multiActionDownloadZip.filename"
        :href="multiActionDownloadZip.url">
        <n-icon :component="CloudDownloadRound" />
        {{ t('downloadMail') + " zip" }}
      </n-button>
    </n-modal>
    <n-modal v-model:show="showMultiActionDelete" preset="dialog" :title="t('delete') + t('success')"
      negative-text="OK">
      <n-space justify="center">
        <n-progress type="circle" status="error" :percentage="multiActionDeleteProgress.percentage">
          <span style="text-align: center">
            {{ multiActionDeleteProgress.tip }}
          </span>
        </n-progress>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.left {
  text-align: left;
}

.center {
  text-align: center;
}

.mailbox-toolbar-wrap {
  margin-bottom: 12px;
}

.mailbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 12px;
  background: var(--ets-surface-card, #ffffff);
  border: 1px solid var(--ets-border, #e5e7eb);
  border-radius: var(--ets-radius-md, 8px);
}

.mailbox-toolbar.multi-mode {
  background: var(--ets-brand-soft, #f0f7ff);
  border-color: var(--ets-brand, #2563eb);
}

.toolbar-actions-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-actions-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.auto-refresh-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
}

.auto-refresh-label {
  font-size: 12.5px;
  color: var(--ets-text-muted, #6b7280);
  user-select: none;
}

.mail-search-input {
  width: 180px;
}

.split-detail-header {
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--ets-surface-card, #ffffff);
  border: 1px solid var(--ets-border, #e5e7eb);
  border-radius: var(--ets-radius-md, 8px);
}

.mail-item {
  height: 100%;
}

:deep(.n-list .n-list-item) {
  padding: 0;
  outline: none;
  position: relative;
  transition: background-color var(--ets-motion-fast, 150ms) ease,
              box-shadow var(--ets-motion-fast, 150ms) ease;
}

:deep(.n-list .n-list-item:focus-visible) {
  outline: 2px solid var(--ets-brand, #2563eb);
  outline-offset: -2px;
  z-index: 2;
}

:deep(.mail-select-checkbox) {
  --n-border: 1px solid var(--ets-border-strong);
}

:deep(.mail-select-checkbox:not(.n-checkbox--checked):not(:hover) .n-checkbox-box__border) {
  border-color: var(--ets-border-strong);
}

.mail-list-row {
  width: 100%;
  min-width: 0;
  padding: 11px 14px;
  border-bottom: 1px solid var(--ets-border, #f3f4f6);
  box-sizing: border-box;
}

.mail-row-active {
  background-color: var(--ets-selected, rgba(37, 99, 235, 0.08)) !important;
}

.mail-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.mail-row-sender-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.mail-unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--ets-brand, #2563eb);
  box-shadow: 0 0 0 2px var(--ets-brand-soft, rgba(37, 99, 235, 0.2));
  flex-shrink: 0;
  display: inline-block;
}

.mail-row-sender {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ets-text-strong, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.mail-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mail-row-id {
  font-size: 11px;
  color: var(--ets-text-muted, #9ca3af);
  font-variant-numeric: tabular-nums;
}

.mail-row-date {
  color: var(--ets-text-muted, #6b7280);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mail-row-address {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ets-text-muted, #6b7280);
  font-size: 11.5px;
}

.muted-address {
  color: var(--ets-text-muted, #6b7280);
  font-weight: 400;
}

.mail-row-main {
  margin-top: 4px;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  text-wrap: pretty;
}

.mail-row-title {
  color: var(--ets-text-strong, #111827);
  font-size: 13.5px;
  font-weight: 580;
  line-height: 1.35;
}

.mail-row-sep {
  margin: 0 5px;
  color: var(--ets-text-muted, #9ca3af);
  opacity: 0.7;
}

.mail-row-snippet {
  color: var(--ets-text-muted, #6b7280);
  font-size: 12.5px;
  line-height: 1.4;
}

.desktop-fullwidth-stream,
.desktop-mail-list-pane {
  overflow: auto;
  min-height: 60vh;
  max-height: calc(100vh - 160px);
  min-width: min(100%, 320px);
}

.mobile-mailbox-toolbar {
  padding: 0 10px;
}

.mobile-mail-list {
  overflow: auto;
  min-height: 45vh;
  max-height: 72vh;
}

.mail-unread .mail-row-title {
  font-weight: 700;
  color: var(--ets-text-strong, #111827);
}

.mail-unread .mail-row-sender {
  font-weight: 700;
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}

@media (max-width: 640px) {
  .mail-list-row {
    padding: 10px 12px;
  }

  .mail-row-header {
    flex-wrap: wrap;
    gap: 2px 8px;
  }

  .mail-row-date {
    font-size: 11px;
  }

  .mail-row-sender {
    max-width: 180px;
  }
}
</style>
