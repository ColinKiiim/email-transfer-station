<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useScopedI18n } from '@/i18n/app'
import { useMessage } from 'naive-ui'
import { CloudDownloadRound, ReplyFilled, ForwardFilled, FullscreenRound } from '@vicons/material'
import ShadowHtmlComponent from "./ShadowHtmlComponent.vue";
import AiExtractInfo from "./AiExtractInfo.vue";
import { getDownloadEmlUrl } from '../utils/email-parser';
import { utcToLocalDate } from '../utils';
import { useGlobalState } from '../store';
import { sanitizeMailHtml } from '../security/safe-html';

const { preferShowTextMail, useIframeShowMail, useUTCDate, isDark } = useGlobalState();

const { t } = useScopedI18n('components.MailContentRenderer')
const message = useMessage()

const props = defineProps({
  mail: {
    type: Object,
    required: true
  },
  showEMailTo: {
    type: Boolean,
    default: true
  },
  showMetaBar: {
    type: Boolean,
    default: true
  },
  enableUserDeleteEmail: {
    type: Boolean,
    default: false
  },
  showReply: {
    type: Boolean,
    default: false
  },
  showSaveS3: {
    type: Boolean,
    default: false
  },
  onDelete: {
    type: Function,
    default: () => { }
  },
  onReply: {
    type: Function,
    default: () => { }
  },
  onForward: {
    type: Function,
    default: () => { }
  },
  onSaveToS3: {
    type: Function,
    default: () => { }
  }
})

const getSenderInitial = (sender) => {
  if (!sender) return '✉'
  const clean = String(sender).replace(/^["'<]|["'>]$/g, '').trim()
  const first = clean.charAt(0)
  return first.toUpperCase() || '✉'
}

const downloadUrl = ref('')
watch(
  () => props.mail?.raw,
  (raw) => {
    if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value)
    downloadUrl.value = raw ? getDownloadEmlUrl(raw) : ''
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value)
});

const showTextMail = ref(preferShowTextMail.value);
const showAttachments = ref(false);
const curAttachments = ref([]);
const attachmentLoding = ref(false);
const showFullscreen = ref(false);

const safeMessage = computed(() => sanitizeMailHtml(props.mail.message));
const iframeRenderGuardStyle = computed(() => `<style>
  html, body {
    margin: 0;
    max-width: 100%;
    background-color: ${isDark.value ? '#1e2129' : '#ffffff'};
    color: ${isDark.value ? '#e6edf3' : '#202124'};
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
  }
  *, *::before, *::after {
    box-sizing: border-box;
  }
  img {
    max-width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
  }
  table {
    max-width: 100% !important;
  }
  pre, code {
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  a {
    color: ${isDark.value ? '#60a5fa' : '#2563eb'};
    max-width: 100%;
    overflow-wrap: break-word;
    word-break: normal;
  }
</style>`);
const iframeMessage = computed(() => `${safeMessage.value}${iframeRenderGuardStyle.value}`);
const hasHtmlMessage = computed(() => !!props.mail.messageIsHtml && safeMessage.value.trim().length > 0);
const textMessage = computed(() => String(
  props.mail.text || (!props.mail.messageIsHtml ? props.mail.message : '') || ''
));
const hasTextMessage = computed(() => textMessage.value.trim().length > 0);
const showPlainText = computed(() => !props.mail.parseFailed && (
  (showTextMail.value && hasTextMessage.value) || !hasHtmlMessage.value
));

const handleDelete = () => {
  props.onDelete();
};

const copyRecipientAddress = async () => {
  const address = String(props.mail.address || '').trim()
  if (!address || !navigator.clipboard?.writeText) {
    message.error(t('copyFailed'))
    return
  }
  try {
    await navigator.clipboard.writeText(address)
    message.success(t('copySuccess'))
  } catch (error) {
    message.error(error?.message || t('copyFailed'))
  }
}

const handleViewAttachments = () => {
  curAttachments.value = props.mail.attachments;
  showAttachments.value = true;
};

const handleReply = () => {
  props.onReply();
};

const handleForward = () => {
  props.onForward();
};

const handleSaveToS3 = async (filename, blob) => {
  attachmentLoding.value = true;
  try {
    await props.onSaveToS3(filename, blob);
  } finally {
    attachmentLoding.value = false;
  }
};
</script>

<template>
  <div class="mail-content-renderer">
    <!-- Gmail-Style Sender Card & Action Toolbar -->
    <div v-if="showMetaBar" class="mail-header-card">
      <div class="mail-sender-profile">
        <div class="sender-avatar">
          {{ getSenderInitial(mail.source) }}
        </div>
        <div class="sender-details">
          <div class="sender-headline">
            <strong class="sender-name">{{ mail.source }}</strong>
            <time class="sender-timestamp">{{ utcToLocalDate(mail.created_at, useUTCDate) }}</time>
            <span class="mail-id-tag">#{{ mail.id }}</span>
          </div>
          <div v-if="showEMailTo" class="recipient-line">
            <span class="recipient-label">{{ t('recipient') || '收件人' }}:</span>
            <span class="recipient-address">{{ mail.address }}</span>
            <button type="button" class="mail-copy-button" :aria-label="t('copyRecipient')"
              :title="t('copyRecipient')" @click.stop="copyRecipientAddress">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Action Toolbar -->
      <div class="mail-action-toolbar">
        <div class="action-group-main">
          <n-button v-if="showReply" size="small" tertiary type="primary" @click="handleReply">
            <template #icon>
              <n-icon :component="ReplyFilled" />
            </template>
            {{ t('reply') }}
          </n-button>
          <n-button v-if="showReply" size="small" tertiary type="primary" @click="handleForward">
            <template #icon>
              <n-icon :component="ForwardFilled" />
            </template>
            {{ t('forward') }}
          </n-button>
          <n-button v-if="mail.attachments && mail.attachments.length > 0" size="small" tertiary type="info"
            @click="handleViewAttachments">
            📎 {{ t('attachments') }} ({{ mail.attachments.length }})
          </n-button>
          <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="mail.id + '.eml'"
            :href="downloadUrl">
            <template #icon>
              <n-icon :component="CloudDownloadRound" />
            </template>
            {{ t('downloadMail') }}
          </n-button>
        </div>

        <div class="action-group-secondary">
          <n-button v-if="hasHtmlMessage && textMessage" size="small" tertiary
            @click="showTextMail = !showTextMail">
            {{ showTextMail ? t('showHtmlMail') : t('showTextMail') }}
          </n-button>
          <n-button size="small" tertiary @click="showFullscreen = true">
            <template #icon>
              <n-icon :component="FullscreenRound" />
            </template>
            {{ t('fullscreen') }}
          </n-button>
          <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="handleDelete">
            <template #trigger>
              <n-button tertiary type="error" size="small">{{ t('delete') }}</n-button>
            </template>
            {{ t('deleteMailTip') }}
          </n-popconfirm>
        </div>
      </div>
    </div>

    <!-- AI 提取信息 -->
    <AiExtractInfo :metadata="mail.metadata" />

    <!-- 邮件正文 -->
    <div class="mail-content" :class="{ 'dark-mode': isDark }">
      <n-alert v-if="mail.parseFailed" type="warning" :bordered="false" class="mail-render-alert">
        {{ t('parseFailed') }}
      </n-alert>
      <pre v-if="showPlainText" class="mail-text">{{ textMessage }}</pre>
      <iframe v-else-if="useIframeShowMail" :srcdoc="iframeMessage" class="mail-iframe" sandbox=""
        referrerpolicy="no-referrer">
      </iframe>
      <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="safeMessage" :isDark="isDark" class="mail-html" />
    </div>
  </div>

  <!-- 全屏抽屉 -->
  <n-drawer v-model:show="showFullscreen" width="100%" placement="top" :trap-focus="false" :block-scroll="false"
    style="height: 100vh;">
    <n-drawer-content :title="mail.subject" closable>
      <div class="fullscreen-mail-content" :class="{ 'dark-mode': isDark }">
        <n-alert v-if="mail.parseFailed" type="warning" :bordered="false" class="mail-render-alert">
          {{ t('parseFailed') }}
        </n-alert>
        <pre v-if="showPlainText" class="mail-text">{{ textMessage }}</pre>
        <iframe v-else-if="useIframeShowMail" :srcdoc="iframeMessage" class="mail-iframe" sandbox=""
          referrerpolicy="no-referrer">
        </iframe>
        <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="safeMessage" :isDark="isDark" class="mail-html" />
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- 附件模态框 -->
  <n-modal v-model:show="showAttachments" preset="dialog" title="Dialog">
    <template #header>
      <div>{{ t('attachments') }}</div>
    </template>
    <n-spin v-model:show="attachmentLoding">
      <n-list hoverable clickable>
        <n-list-item v-for="row in curAttachments" v-bind:key="row.id">
          <n-thing class="center" :title="row.filename">
            <template #description>
              <n-space>
                <n-tag type="info">
                  Size: {{ row.size }}
                </n-tag>
                <n-button v-if="showSaveS3" @click="handleSaveToS3(row.filename, row.blob)" ghost type="info"
                  size="small">
                  {{ t('saveToS3') }}
                </n-button>
              </n-space>
            </template>
          </n-thing>
          <template #suffix>
            <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="row.filename"
              :href="row.url">
              <n-icon :component="CloudDownloadRound" />
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </n-spin>
  </n-modal>
</template>

<style scoped>
.mail-content-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mail-header-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  background: var(--ets-surface-alt, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--ets-border);
  border-radius: 10px;
}

.mail-sender-profile {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sender-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #ffffff;
  font-weight: 700;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
}

.sender-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sender-headline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.sender-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ets-text, #e2e8f0);
  word-break: break-all;
}

.sender-timestamp {
  font-size: 12px;
  color: var(--ets-text-muted, #94a3b8);
}

.mail-id-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ets-surface-sunken, rgba(0, 0, 0, 0.2));
  color: var(--ets-text-muted, #94a3b8);
  font-family: var(--ets-font-mono, monospace);
}

.recipient-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--ets-text-muted, #94a3b8);
  flex-wrap: wrap;
}

.recipient-label {
  font-weight: 500;
}

.recipient-address {
  color: var(--ets-text, #cbd5e1);
  word-break: break-all;
}

.mail-copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  padding: 0;
  background: transparent;
  color: var(--ets-text-muted, #94a3b8);
  cursor: pointer;
  transition: all 120ms ease;
}

.mail-copy-button:hover {
  background: var(--ets-surface, rgba(255, 255, 255, 0.08));
  color: #60a5fa;
}

.mail-copy-button svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.mail-action-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--ets-border);
}

.action-group-main,
.action-group-secondary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.mail-content {
  margin-top: 4px;
  flex: 1;
}

.mail-render-alert {
  margin-bottom: 10px;
}

.mail-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  padding: 16px;
  border-radius: 8px;
  background: var(--ets-surface-sunken, rgba(0, 0, 0, 0.15));
  border: 1px solid var(--ets-border);
  font-family: inherit;
  font-size: inherit;
  line-height: 1.6;
}

.dark-mode .mail-text {
  color: #e0e0e0;
}

.mail-iframe {
  width: 100%;
  height: 100%;
  border: none;
  min-height: 400px;
}

.dark-mode .mail-iframe {
  background-color: #181b22;
}

.mail-html {
  width: 100%;
  height: 100%;
}

.center {
  text-align: center;
}

.fullscreen-mail-content {
  height: calc(100vh - 120px);
  overflow: auto;
}

.fullscreen-mail-content .mail-iframe {
  min-height: calc(100vh - 120px);
}

@media (max-width: 640px) {
  .mail-action-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .action-group-main,
  .action-group-secondary {
    justify-content: flex-start;
  }
}
</style>
