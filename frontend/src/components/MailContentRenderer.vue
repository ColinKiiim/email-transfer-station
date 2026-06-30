<script setup>
import DOMPurify from "dompurify";
import { computed, ref } from "vue";
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, ReplyFilled, ForwardFilled, FullscreenRound } from '@vicons/material'
import ShadowHtmlComponent from "./ShadowHtmlComponent.vue";
import AiExtractInfo from "./AiExtractInfo.vue";
import { getDownloadEmlUrl } from '../utils/email-parser';
import { utcToLocalDate } from '../utils';
import { useGlobalState } from '../store';

const { preferShowTextMail, useIframeShowMail, useUTCDate, isDark } = useGlobalState();

const { t } = useScopedI18n('components.MailContentRenderer')

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
  // 回调函数 props
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
});

const showTextMail = ref(preferShowTextMail.value);
const showAttachments = ref(false);
const curAttachments = ref([]);
const attachmentLoding = ref(false);
const showFullscreen = ref(false);

const removeInsecureMedia = (html) => {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('[src], [srcset], [poster], [style]').forEach((element) => {
    for (const attr of ['src', 'poster']) {
      const value = element.getAttribute(attr);
      if (value && /^http:\/\//i.test(value.trim())) {
        element.removeAttribute(attr);
        element.setAttribute('data-removed-insecure-media', attr);
      }
    }
    const srcset = element.getAttribute('srcset');
    if (srcset && /(^|,\s*)http:\/\//i.test(srcset)) {
      element.removeAttribute('srcset');
      element.setAttribute('data-removed-insecure-media', 'srcset');
    }
    const style = element.getAttribute('style');
    if (style && /url\(\s*['"]?http:\/\//i.test(style)) {
      element.removeAttribute('style');
      element.setAttribute('data-removed-insecure-media', 'style');
    }
  });
  return template.innerHTML;
};

const safeMessage = computed(() => removeInsecureMedia(DOMPurify.sanitize(String(props.mail.message || ''), {
  ADD_ATTR: ['target', 'rel'],
})));
const iframeRenderGuardStyle = `<style>
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
  }
  a {
    overflow-wrap: anywhere;
  }
</style>`;
const iframeMessage = computed(() => `${safeMessage.value}${iframeRenderGuardStyle}`);
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
    <!-- 邮件信息标签 -->
    <n-space v-if="showMetaBar" class="mail-meta-bar">
      <n-tag type="info" class="mail-meta-chip">
        ID: {{ mail.id }}
      </n-tag>
      <n-tag type="info" class="mail-meta-chip">
        {{ utcToLocalDate(mail.created_at, useUTCDate) }}
      </n-tag>
      <n-tag type="info" class="mail-meta-chip mail-meta-address">
        FROM: {{ mail.source }}
      </n-tag>
      <n-tag v-if="showEMailTo" type="info" class="mail-meta-chip mail-meta-address">
        TO: {{ mail.address }}
      </n-tag>

      <!-- 操作按钮 -->
      <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="handleDelete">
        <template #trigger>
          <n-button tertiary type="error" size="small">{{ t('delete') }}</n-button>
        </template>
        {{ t('deleteMailTip') }}
      </n-popconfirm>

      <n-button v-if="mail.attachments && mail.attachments.length > 0" size="small" tertiary type="info"
        @click="handleViewAttachments">
        {{ t('attachments') }}
      </n-button>

      <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="mail.id + '.eml'"
        :href="getDownloadEmlUrl(mail.raw)">
        <template #icon>
          <n-icon :component="CloudDownloadRound" />
        </template>
        {{ t('downloadMail') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleReply">
        <template #icon>
          <n-icon :component="ReplyFilled" />
        </template>
        {{ t('reply') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleForward">
        <template #icon>
          <n-icon :component="ForwardFilled" />
        </template>
        {{ t('forward') }}
      </n-button>

      <n-button v-if="hasHtmlMessage && textMessage" size="small" tertiary type="info"
        @click="showTextMail = !showTextMail">
        {{ showTextMail ? t('showHtmlMail') : t('showTextMail') }}
      </n-button>

      <n-button size="small" tertiary type="info" @click="showFullscreen = true">
        <template #icon>
          <n-icon :component="FullscreenRound" />
        </template>
        {{ t('fullscreen') }}
      </n-button>
    </n-space>

    <!-- AI 提取信息 -->
    <AiExtractInfo v-if="showMetaBar" :metadata="mail.metadata" />

    <!-- 邮件内容 -->
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

  <n-drawer v-model:show="showFullscreen" width="100%" placement="bottom" :trap-focus="false" :block-scroll="false"
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
  gap: 10px;
}

.mail-meta-bar {
  align-items: flex-start;
  gap: 8px 10px !important;
}

.mail-meta-chip {
  max-width: 100%;
  font-variant-numeric: tabular-nums;
}

.mail-meta-chip :deep(.n-tag__content) {
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.mail-meta-address {
  flex: 1 1 260px;
}

.mail-content-renderer :deep(.n-button) {
  min-height: 32px;
}

.mail-content {
  margin-top: 10px;
  flex: 1;
}

.mail-render-alert {
  margin-bottom: 10px;
}

.mail-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
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
  background-color: #fff;
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
  .mail-meta-bar {
    gap: 7px !important;
  }

  .mail-meta-address {
    flex-basis: 100%;
  }

  .mail-content {
    margin-top: 6px;
  }
}
</style>
