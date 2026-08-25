<script setup>
import { computed, defineAsyncComponent, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRoute } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { useIsMobile } from '../utils/composables'
import { FullscreenExitOutlined } from '@vicons/material'
import { putBlobToSignedUrl } from '../utils/s3-upload'

import AddressBar from './index/AddressBar.vue';
import MailBox from '../components/MailBox.vue';
import SendBox from '../components/SendBox.vue';
import AutoReply from './index/AutoReply.vue';
import AccountSettings from './index/AccountSettings.vue';
import Appearance from './common/Appearance.vue';
import Webhook from './index/Webhook.vue';
import Attachment from './index/Attachment.vue';
import About from './common/About.vue';
import SimpleIndex from './index/SimpleIndex.vue';

const { loading, settings, openSettings, indexTab, globalTabplacement, useSimpleIndex } = useGlobalState()
const message = useMessage()
const route = useRoute()
const isMobile = useIsMobile()

const isLeftPlacement = computed(() => !isMobile.value && globalTabplacement.value === 'left' && Boolean(settings.value.address))

const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./index/SendMail.vue')
    .finally(() => loading.value = false);
});

const { t } = useScopedI18n('views.Index')

const fetchMailData = async (limit, offset) => {
  const mailId = Number(mailIdQuery.value)
  if (Number.isInteger(mailId) && mailId > 0) {
    const singleMail = await api.fetch(`/api/mail/${mailId}`);
    if (singleMail) return { results: [singleMail], count: 1 };
    return { results: [], count: 0 };
  }
  if (showMailIdQuery.value) {
    return { results: [], count: 0 };
  }
  return await api.fetch(`/api/mails?limit=${limit}&offset=${offset}`);
};

const deleteMail = async (curMailId) => {
  await api.fetch(`/api/mails/${curMailId}`, { method: 'DELETE' });
};

const updateMailReadState = async (curMailId, read = true) => {
  return await api.fetch(`/api/mails/${curMailId}/read_state`, {
    method: 'PATCH',
    body: JSON.stringify({ read })
  });
};

const deleteSenboxMail = async (curMailId) => {
  await api.fetch(`/api/sendbox/${curMailId}`, { method: 'DELETE' });
};

const fetchSenboxData = async (limit, offset) => {
  return await api.fetch(`/api/sendbox?limit=${limit}&offset=${offset}`);
};

const saveToS3 = async (mail_id, filename, blob) => {
  try {
    const { url } = await api.fetch(`/api/attachment/put_url`, {
      method: 'POST',
      body: JSON.stringify({ key: `${mail_id}/${filename}` })
    });
    await putBlobToSignedUrl(url, blob);
    message.success(t('saveToS3Success'));
  } catch (error) {
    console.error(error);
    message.error(error.message || "save to s3 error");
  }
}

const mailBoxKey = ref("")
const mailIdQuery = ref("")
const showMailIdQuery = ref(false)

const queryMail = () => {
  mailBoxKey.value = Date.now();
}

watch(
  () => route.query.mail_id,
  (mailId) => {
    const normalizedMailId = Array.isArray(mailId) ? mailId[0] : mailId;
    showMailIdQuery.value = typeof normalizedMailId === 'string' && normalizedMailId.length > 0;
    mailIdQuery.value = showMailIdQuery.value ? normalizedMailId : "";
    queryMail();
  },
  { immediate: true }
)
</script>

<template>
  <div class="index-layout" :class="{ 'index-left-layout': isLeftPlacement }">
    <div v-if="useSimpleIndex" class="index-simple-wrapper">
      <SimpleIndex />
    </div>
    <div v-else class="index-workbench-wrapper">
      <AddressBar class="index-address-bar" />
      <n-tabs v-if="settings.address" type="card" v-model:value="indexTab" :placement="globalTabplacement" class="index-tabs">
        <template #prefix v-if="!isMobile">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                @click="useSimpleIndex = true"
                quaternary
                circle
                size="small"
                :aria-label="t('enterSimpleMode')"
                class="index-simple-btn"
              >
                <template #icon>
                  <n-icon>
                    <FullscreenExitOutlined />
                  </n-icon>
                </template>
              </n-button>
            </template>
            {{ t('enterSimpleMode') }}
          </n-tooltip>
        </template>
        <n-tab-pane name="mailbox" :tab="t('mailbox')">
          <div v-if="showMailIdQuery" style="margin-bottom: 10px;">
            <n-input-group>
              <n-input v-model:value="mailIdQuery" />
              <n-button @click="queryMail" type="primary" tertiary>
                {{ t('query') }}
              </n-button>
            </n-input-group>
          </div>
          <MailBox :key="mailBoxKey" :showEMailTo="false" :showReply="openSettings.enableSendMail" :showSaveS3="openSettings.isS3Enabled"
            :saveToS3="saveToS3" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
            :fetchMailData="fetchMailData" :deleteMail="deleteMail" :updateMailReadState="updateMailReadState"
            :showFilterInput="true" />
        </n-tab-pane>
        <n-tab-pane v-if="openSettings.enableSendMail" name="sendbox" :tab="t('sendbox')">
          <SendBox :fetchMailData="fetchSenboxData" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
            :deleteMail="deleteSenboxMail" />
        </n-tab-pane>
        <n-tab-pane v-if="openSettings.enableSendMail" name="sendmail" :tab="t('sendmail')">
          <SendMail />
        </n-tab-pane>
        <n-tab-pane name="accountSettings" :tab="t('accountSettings')">
          <AccountSettings />
        </n-tab-pane>
        <n-tab-pane name="appearance" :tab="t('appearance')">
          <Appearance :showUseSimpleIndex="true" />
        </n-tab-pane>
        <n-tab-pane v-if="openSettings.enableAutoReply" name="auto_reply" :tab="t('auto_reply')">
          <AutoReply />
        </n-tab-pane>
        <n-tab-pane v-if="openSettings.enableWebhook" name="webhook" :tab="t('webhookSettings')">
          <Webhook />
        </n-tab-pane>
        <n-tab-pane v-if="openSettings.isS3Enabled" name="s3_attachment" :tab="t('s3Attachment')">
          <Attachment />
        </n-tab-pane>
        <n-tab-pane v-if="openSettings.enableIndexAbout" name="about" :tab="t('about')">
          <About />
        </n-tab-pane>
      </n-tabs>
    </div>
  </div>
</template>

<style scoped>
.index-layout {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.index-workbench-wrapper {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.index-left-layout {
  text-align: left;
}

.index-left-layout .index-workbench-wrapper {
  display: grid;
  grid-template-columns: minmax(180px, auto) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
}

.index-left-layout .index-tabs {
  display: contents;
}

.index-left-layout :deep(.n-tabs-nav--left) {
  grid-column: 1;
  grid-row: 1 / -1;
  background: var(--ets-surface);
  border-right: 1px solid var(--ets-border);
  padding: 12px 10px 16px 10px;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.index-left-layout :deep(.n-tabs-nav__prefix) {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.index-left-layout :deep(.n-tabs-tab) {
  width: 100%;
  justify-content: flex-start;
  box-sizing: border-box;
}

.index-left-layout .index-address-bar {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  padding: 0 16px;
  box-sizing: border-box;
}

.index-left-layout :deep(.n-tab-pane) {
  grid-column: 2;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: 0 16px 16px 16px;
  box-sizing: border-box;
}
</style>
