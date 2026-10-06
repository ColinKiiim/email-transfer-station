<script setup>
import { watch, onMounted, ref, computed } from "vue";
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { useIsMobile } from '../utils/composables'
import { utcToLocalDate } from '../utils';
import { SendRound } from '@vicons/material'
import ShadowHtmlComponent from './ShadowHtmlComponent.vue'

const message = useMessage()
const isMobile = useIsMobile()

const props = defineProps({
  enableUserDeleteEmail: {
    type: Boolean,
    default: false,
    required: false
  },
  showEMailFrom: {
    type: Boolean,
    default: false
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
})

const { isDark, mailboxSplitSize, loading, useUTCDate } = useGlobalState()
const data = ref([])

const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

const curMail = ref(null);
const showCode = ref(false)

const multiActionMode = ref(false)
const showMultiActionDelete = ref(false)
const multiActionDeleteProgress = ref({ percentage: 0, tip: '0/0' })

const { t } = useScopedI18n('components.SendBox')

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
    data.value = (results || []).map((item) => {
      try {
        const rawData = JSON.parse(item.raw);
        if (rawData.version == "v2") {
          item.to_mail = rawData.to_name ? `${rawData.to_name} <${rawData.to_mail}>` : rawData.to_mail;
          item.subject = rawData.subject;
          item.is_html = rawData.is_html;
          item.content = rawData.content;
          item.raw = JSON.stringify(rawData, null, 2);
        } else {
          item.to_mail = rawData?.personalizations?.map(
            (p) => p.to?.map((t) => t.email).join(',')
          ).join(';');
          item.subject = rawData.subject;
          item.is_html = (rawData.content?.[0]?.type != 'text/plain');
          item.content = rawData.content?.[0]?.value;
          item.raw = JSON.stringify(rawData, null, 2);
        }
      } catch (error) {
        console.log(error);
      }
      return item;
    });
    if (totalCount > 0) {
      count.value = totalCount;
    }
    if (!isMobile.value && !curMail.value && data.value.length > 0) {
      curMail.value = data.value[0];
    }
  } catch (error) {
    message.error(error.message || "error");
    console.error(error);
  }
};

const clickRow = async (row) => {
  if (multiActionMode.value) {
    row.checked = !row.checked;
    return;
  }
  curMail.value = row;
};

const mailItemClass = (row) => {
  return curMail.value && row.id == curMail.value.id ? 'mail-row-active' : '';
};

const onSpiltSizeChange = (size) => {
  mailboxSplitSize.value = size;
}

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

const showMultiActionMode = computed(() => {
  return props.enableUserDeleteEmail;
});

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

onMounted(async () => {
  await refresh();
});
</script>

<template>
  <div class="sendbox-wrapper">
    <div v-if="!isMobile" class="sendbox-desktop">
      <div class="sendbox-toolbar">
        <div class="toolbar-left">
          <template v-if="multiActionMode">
            <n-button size="small" @click="multiActionModeClick(false)" tertiary>
              {{ t('cancelMultiAction') }}
            </n-button>
            <n-button size="small" @click="multiActionSelectAll(true)" tertiary>
              {{ t('selectAll') }}
            </n-button>
            <n-button size="small" @click="multiActionSelectAll(false)" tertiary :disabled="selectedCount === 0">
              {{ t('unselectAll') }}
            </n-button>
            <n-tag v-if="selectedCount > 0" size="small" type="info" :bordered="false" round>
              {{ t('selectedCount', { count: selectedCount }) }}
            </n-tag>
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail" :disabled="selectedCount === 0">
              <template #trigger>
                <n-button size="small" tertiary type="error" :disabled="selectedCount === 0">{{ t('delete') }}</n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
          </template>
          <template v-else>
            <n-button v-if="showMultiActionMode" size="small" @click="multiActionModeClick(true)" type="primary" tertiary>
              {{ t('multiAction') }}
            </n-button>
            <n-button size="small" @click="refresh" type="primary" tertiary>
              {{ t('refresh') }}
            </n-button>
          </template>
        </div>
        <div class="toolbar-right">
          <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
            :page-sizes="[20, 50, 100]" show-size-picker size="small" />
        </div>
      </div>

      <n-split direction="horizontal" :max="0.75" :min="0.25" :default-size="mailboxSplitSize"
        :on-update:size="onSpiltSizeChange" class="sendbox-split">
        <template #1>
          <div class="sendbox-list-scroll">
            <n-empty v-if="data.length === 0" class="empty-list" :description="t('emptySent')" />
            <n-list v-else hoverable clickable class="sendbox-list">
              <n-list-item v-for="row in data" :key="row.id" @click="() => clickRow(row)"
                class="sendbox-mail-row" :class="mailItemClass(row)">
                <div class="mail-row-content">
                  <div v-if="multiActionMode" class="row-checkbox">
                    <n-checkbox v-model:checked="row.checked" @click.stop />
                  </div>
                  <div class="row-main">
                    <div class="row-head">
                      <span class="row-recipient" :title="row.to_mail">
                        <strong>TO:</strong> {{ row.to_mail }}
                      </span>
                      <span class="row-meta">
                        <span class="row-id">#{{ row.id }}</span>
                        <span class="row-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</span>
                      </span>
                    </div>
                    <div class="row-body">
                      <span class="row-subject">{{ row.subject || '(无主题)' }}</span>
                      <span class="row-preview" v-if="row.content">
                        - {{ row.content.replace(/<[^>]*>/g, '').slice(0, 80) }}
                      </span>
                    </div>
                  </div>
                </div>
              </n-list-item>
            </n-list>
          </div>
        </template>
        <template #2>
          <div v-if="curMail" class="sendbox-detail-panel">
            <div class="detail-head">
              <div class="detail-header-info">
                <h2 class="detail-subject">{{ curMail.subject || '(无主题)' }}</h2>
                <div class="detail-meta-row">
                  <span class="meta-tag"><strong>ID:</strong> #{{ curMail.id }}</span>
                  <span class="meta-tag"><strong>时间:</strong> {{ utcToLocalDate(curMail.created_at, useUTCDate) }}</span>
                  <span class="meta-tag" v-if="curMail.address"><strong>发件人:</strong> {{ curMail.address }}</span>
                  <span class="meta-tag"><strong>收件人:</strong> {{ curMail.to_mail }}</span>
                </div>
              </div>
              <div class="detail-actions">
                <n-button size="small" tertiary type="info" @click="showCode = !showCode">
                  {{ t('showCode') }}
                </n-button>
                <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteMail">
                  <template #trigger>
                    <n-button tertiary type="error" size="small">{{ t('delete') }}</n-button>
                  </template>
                  {{ t('deleteMailTip') }}
                </n-popconfirm>
                <n-button size="small" quaternary @click="curMail = null">
                  ✕
                </n-button>
              </div>
            </div>
            <div class="detail-body-card">
              <pre v-if="showCode" class="raw-code">{{ curMail.raw }}</pre>
              <pre v-else-if="!curMail.is_html" class="plain-body">{{ curMail.content }}</pre>
              <ShadowHtmlComponent v-else :htmlContent="curMail.content || ''" :isDark="isDark" />
            </div>
          </div>
          <div class="empty-detail" v-else>
            <n-result status="info" :title="count === 0 ? t('emptySent') : t('pleaseSelectMail')">
              <template #icon>
                <n-icon :component="SendRound" :size="72" />
              </template>
            </n-result>
          </div>
        </template>
      </n-split>
    </div>

    <!-- Mobile view -->
    <div class="sendbox-mobile" v-else>
      <div class="mobile-toolbar">
        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count" simple size="small" />
        <n-button @click="refresh" size="small" type="primary" tertiary>
          {{ t('refresh') }}
        </n-button>
      </div>
      <div class="sendbox-list-scroll">
        <n-empty v-if="data.length === 0" class="empty-list" :description="t('emptySent')" />
        <n-list v-else hoverable clickable class="sendbox-list">
          <n-list-item v-for="row in data" :key="row.id" @click="() => clickRow(row)" class="sendbox-mail-row">
            <div class="row-main">
              <div class="row-head">
                <span class="row-recipient"><strong>TO:</strong> {{ row.to_mail }}</span>
                <span class="row-meta">
                  <span class="row-id">#{{ row.id }}</span>
                </span>
              </div>
              <div class="row-body">
                <span class="row-subject">{{ row.subject || '(无主题)' }}</span>
              </div>
            </div>
          </n-list-item>
        </n-list>
      </div>
      <n-drawer v-model:show="curMail" width="100%" placement="bottom" style="height: 82vh;">
        <n-drawer-content :title="curMail ? curMail.subject : ''" closable>
          <div v-if="curMail" class="mobile-detail-content">
            <div class="detail-meta-row" style="margin-bottom: 12px;">
              <span class="meta-tag"><strong>ID:</strong> #{{ curMail.id }}</span>
              <span class="meta-tag"><strong>时间:</strong> {{ utcToLocalDate(curMail.created_at, useUTCDate) }}</span>
              <span class="meta-tag"><strong>收件人:</strong> {{ curMail.to_mail }}</span>
            </div>
            <div style="margin-bottom: 14px; display: flex; gap: 8px;">
              <n-button size="small" tertiary type="info" @click="showCode = !showCode">
                {{ t('showCode') }}
              </n-button>
              <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteMail">
                <template #trigger>
                  <n-button tertiary type="error" size="small">{{ t('delete') }}</n-button>
                </template>
                {{ t('deleteMailTip') }}
              </n-popconfirm>
            </div>
            <div class="detail-body-card">
              <pre v-if="showCode" class="raw-code">{{ curMail.raw }}</pre>
              <pre v-else-if="!curMail.is_html" class="plain-body">{{ curMail.content }}</pre>
              <ShadowHtmlComponent v-else :htmlContent="curMail.content || ''" :isDark="isDark" />
            </div>
          </div>
        </n-drawer-content>
      </n-drawer>
    </div>
  </div>
</template>

<style scoped>
.sendbox-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sendbox-desktop {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.sendbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--ets-surface-card);
  border: 1px solid var(--ets-border);
  border-radius: var(--ets-radius-md);
  box-shadow: var(--ets-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sendbox-split {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--ets-border);
  border-radius: var(--ets-radius-md);
  background: var(--ets-surface);
  overflow: hidden;
}

.sendbox-list-scroll {
  overflow-y: auto;
  height: 100%;
  background: var(--ets-surface);
}

.sendbox-mail-row {
  border-left: 3px solid transparent;
  padding: 10px 14px;
  cursor: pointer;
  transition: background-color var(--ets-motion-fast), border-left-color var(--ets-motion-fast);
}

.sendbox-mail-row:hover {
  background-color: var(--ets-hover);
}

.mail-row-active {
  border-left: 3px solid var(--ets-brand) !important;
  background-color: var(--ets-selected, #e8f0fe) !important;
}

html.dark .mail-row-active {
  background-color: var(--ets-selected, #1c3550) !important;
}

.mail-row-content {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.row-recipient {
  font-size: 13px;
  color: var(--ets-text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--ets-text-muted);
  font-family: var(--ets-font-mono, monospace);
  flex-shrink: 0;
}

.row-body {
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-subject {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ets-text);
  flex-shrink: 0;
}

.row-preview {
  font-size: 12.5px;
  color: var(--ets-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sendbox-detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px;
  box-sizing: border-box;
  text-align: left;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--ets-border);
}

.detail-subject {
  font-size: 18px;
  font-weight: 700;
  color: var(--ets-text-strong);
  margin: 0 0 8px 0;
}

.detail-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12.5px;
  color: var(--ets-text-muted);
}

.meta-tag {
  background: var(--ets-surface-alt);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--ets-border);
}

.detail-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.detail-body-card {
  flex: 1;
  background: var(--ets-surface-card);
  border: 1px solid var(--ets-border);
  border-radius: var(--ets-radius-md);
  padding: 16px;
}

.plain-body,
.raw-code {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--ets-text);
  font-size: 13.5px;
  line-height: 1.6;
}

.empty-detail {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--ets-text-muted);
}

.mobile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}
</style>
