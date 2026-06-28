<script setup>
import { watch, onMounted, ref, onBeforeUnmount, computed } from "vue";
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { CloudDownloadRound, ArrowBackIosNewFilled, ArrowForwardIosFilled, InboxRound } from '@vicons/material'
import { useIsMobile } from '../utils/composables'
import { processItem } from '../utils/email-parser'
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
    rawData.value = await Promise.all(results.map(async (item) => {
      item.checked = false;
      return await processItem(item);
    }));
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

const mailItemClass = (row) => {
  return [
    curMail.value && row.id == curMail.value.id ? (isDark.value ? 'overlay overlay-dark-backgroud' : 'overlay overlay-light-backgroud') : '',
    row.unread ? 'mail-unread' : '',
  ].filter(Boolean).join(' ');
};

const compactWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const stripHtmlForPreview = (value) => compactWhitespace(String(value || '').replace(/<[^>]*>/g, ' '));

const mailPreview = (row) => {
  return stripHtmlForPreview(row.text || row.message || '').slice(0, 180);
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
})
</script>

<template>
  <div>
    <div v-if="!isMobile" class="left">
      <div style="margin-bottom: 10px;">
        <n-space v-if="multiActionMode" align="center">
          <n-button @click="multiActionModeClick(false)" tertiary>
            {{ t('cancelMultiAction') }}
          </n-button>
          <n-button @click="multiActionSelectAll(true)" tertiary>
            {{ t('selectAll') }}
          </n-button>
          <n-button @click="multiActionSelectAll(false)" tertiary>
            {{ t('unselectAll') }}
          </n-button>
          <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail">
            <template #trigger>
              <n-button tertiary type="error">{{ t('delete') }}</n-button>
            </template>
            {{ t('deleteMailTip') }}
          </n-popconfirm>
          <n-button @click="multiActionDownload" tertiary type="info">
            <template #icon>
              <n-icon :component="CloudDownloadRound" />
            </template>
            {{ t('downloadMail') }}
          </n-button>
        </n-space>
        <n-space v-else align="center">
          <n-button @click="multiActionModeClick(true)" type="primary" tertiary>
            {{ t('multiAction') }}
          </n-button>
          <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" :page-sizes="[20, 50, 100]"
            show-size-picker />
          <n-switch v-model:value="autoRefresh" :round="false">
            <template #checked>
              {{ t('refreshAfter', { msg: autoRefreshInterval }) }}
            </template>
            <template #unchecked>
              {{ t('autoRefresh') }}
            </template>
          </n-switch>
          <n-button @click="backFirstPageAndRefresh" type="primary" tertiary>
            {{ t('refresh') }}
          </n-button>
          <n-input v-if="showFilterInput" v-model:value="localFilterKeyword"
            :placeholder="t('keywordQueryTip')" style="width: 200px; display: flex; align-items: center;"
            clearable />
        </n-space>
      </div>
      <n-split class="left" direction="horizontal" :max="0.75" :min="0.25" :default-size="mailboxSplitSize"
        :on-update:size="onSpiltSizeChange">
        <template #1>
          <div style="overflow: auto; min-height: 60vh; max-height: 100vh;">
            <n-list hoverable clickable>
              <n-list-item v-for="row in data" v-bind:key="row.id" @click="() => clickRow(row)"
                :class="mailItemClass(row)">
                <template #prefix v-if="multiActionMode">
                  <n-checkbox v-model:checked="row.checked" />
                </template>
                <div class="mail-list-row">
                  <div class="mail-row-header">
                    <strong class="mail-row-title">{{ row.subject }}</strong>
                    <time class="mail-row-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
                  </div>
                  <div class="mail-row-address-line">
                    <span v-if="row.unread" class="mail-row-pill unread-pill">{{ t('unread') }}</span>
                    <span class="mail-row-pill">ID {{ row.id }}</span>
                    <span class="mail-row-address">
                      {{ showEMailTo ? "FROM: " + mailPrimaryAddress(row) : mailPrimaryAddress(row) }}
                    </span>
                    <span v-if="mailSecondaryAddress(row)" class="mail-row-address muted-address">
                      TO: {{ mailSecondaryAddress(row) }}
                    </span>
                  </div>
                  <p v-if="mailPreview(row)" class="mail-row-snippet">{{ mailPreview(row) }}</p>
                  <AiExtractInfo :metadata="row.metadata" compact />
                </div>
              </n-list-item>
            </n-list>
          </div>
        </template>
        <template #2>
          <div v-if="curMail" style="margin: 8px;">
            <n-flex justify="space-between">
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
            </n-flex>
          </div>
          <n-card :bordered="false" embedded v-if="curMail" class="mail-item" :title="curMail.subject"
            style="overflow: auto; max-height: 100vh;">
            <MailContentRenderer :mail="curMail" :showEMailTo="showEMailTo"
              :enableUserDeleteEmail="enableUserDeleteEmail" :showReply="showReply" :showSaveS3="showSaveS3"
              :onDelete="deleteMail" :onReply="replyMail" :onForward="forwardMail" :onSaveToS3="saveToS3Proxy" />
          </n-card>
          <n-card :bordered="false" embedded class="mail-item" v-else>
            <n-result status="info" :title="count === 0 ? t('emptyInbox') : t('pleaseSelectMail')">
              <template #icon>
                <n-icon :component="InboxRound" :size="100" />
              </template>
            </n-result>
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
          <n-list-item v-for="row in data" v-bind:key="row.id" @click="() => clickRow(row)"
            :class="mailItemClass(row)">
            <div class="mail-list-row">
              <div class="mail-row-header">
                <strong class="mail-row-title">{{ row.subject }}</strong>
                <time class="mail-row-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</time>
              </div>
              <div class="mail-row-address-line">
                <span v-if="row.unread" class="mail-row-pill unread-pill">{{ t('unread') }}</span>
                <span class="mail-row-pill">ID {{ row.id }}</span>
                <span class="mail-row-address">
                  {{ showEMailTo ? "FROM: " + mailPrimaryAddress(row) : mailPrimaryAddress(row) }}
                </span>
                <span v-if="mailSecondaryAddress(row)" class="mail-row-address muted-address">
                  TO: {{ mailSecondaryAddress(row) }}
                </span>
              </div>
              <p v-if="mailPreview(row)" class="mail-row-snippet">{{ mailPreview(row) }}</p>
              <AiExtractInfo :metadata="row.metadata" compact />
            </div>
          </n-list-item>
        </n-list>
      </div>
      <n-drawer v-model:show="curMail" width="100%" placement="bottom" :trap-focus="false" :block-scroll="false"
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

.overlay {
  position: relative;
  z-index: 0;
}

.overlay-dark-backgroud {
  background-color: rgba(255, 255, 255, 0.08);
}

.overlay-light-backgroud {
  background-color: #f3f6fb;
}

.mail-item {
  height: 100%;
}

:deep(.n-list .n-list-item) {
  padding: 0;
}

.mail-list-row {
  width: 100%;
  min-width: 0;
  padding: 13px 16px;
}

.mail-row-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.mail-row-title {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: #111827;
  font-size: 15px;
  font-weight: 620;
  line-height: 1.35;
  text-wrap: pretty;
}

.mail-row-date {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mail-row-address-line {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  min-width: 0;
  margin-top: 6px;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.35;
}

.mail-row-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 1px 7px;
  background: #eef2ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 560;
  font-variant-numeric: tabular-nums;
}

.unread-pill {
  background: #fff7ed;
  color: #c2410c;
}

.mail-row-address {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted-address {
  color: #6b7280;
}

.mail-row-snippet {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.45;
  text-wrap: pretty;
}

.mobile-mailbox-toolbar {
  padding: 0 10px;
}

.mobile-mail-list {
  overflow: auto;
  min-height: 45vh;
  max-height: 72vh;
}

.mail-unread :deep(.n-thing-header__title) {
  font-weight: 650;
}

.mail-unread .mail-row-title {
  font-weight: 720;
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}

@media (max-width: 640px) {
  .mail-list-row {
    padding: 12px 14px;
  }

  .mail-row-header {
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
  }

  .mail-row-date {
    order: -1;
  }

  .mail-row-address {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
