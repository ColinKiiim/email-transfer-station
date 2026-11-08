<script setup>
import { computed, defineAsyncComponent, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useScopedI18n } from '@/i18n/app'
import { useRoute } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { putBlobToSignedUrl } from '../utils/s3-upload'

import AddressBar from './index/AddressBar.vue';
import AppShell from '../components/AppShell.vue';
import AppUtilityMenu from '../components/AppUtilityMenu.vue';
import ProductSurfaceLinks from '../components/ProductSurfaceLinks.vue';
import AccessMailWorkbench from '../components/AccessMailWorkbench.vue';
import { getRouterPathWithLang } from '../utils';
import SendBox from '../components/SendBox.vue';
import AutoReply from './index/AutoReply.vue';
import AccountSettings from './index/AccountSettings.vue';
import Appearance from './common/Appearance.vue';
import Webhook from './index/Webhook.vue';
import Attachment from './index/Attachment.vue';
import About from './common/About.vue';
import SimpleIndex from './index/SimpleIndex.vue';

const { loading, settings, openSettings, indexTab, useSimpleIndex, isTelegram, showAdminPage } = useGlobalState()
const message = useMessage()
const route = useRoute()


const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./index/SendMail.vue')
    .finally(() => loading.value = false);
});

const { t, locale } = useScopedI18n('views.Index')

// Signed-in address mailbox: same shell and navigation pattern as /user and /admin.
const navIcons = {
  mailbox: ['M4 6h16v12H4z', 'm4 7 8 6 8-6'],
  sendbox: ['M4 12 20 4l-5 16-3-7z', 'M12 13l8-9'],
  sendmail: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  accountSettings: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  appearance: ['M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2H17a4 4 0 0 0 4-4c0-4.4-4-7.4-9-7.4z', 'M7.5 10.5h.01M10.5 7.5h.01M15.5 7.5h.01'],
  auto_reply: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  webhook: ['M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2', 'm6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06', 'm12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8'],
  s3_attachment: ['M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5'],
  about: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16v-4M12 8h.01'],
}
const navGroups = computed(() => [
  {
    id: 'mail',
    label: t('navGroupMail'),
    items: [
      { id: 'mailbox', label: t('mailbox'), icon: navIcons.mailbox },
      ...(openSettings.value.enableSendMail ? [
        { id: 'sendbox', label: t('sendbox'), icon: navIcons.sendbox },
        { id: 'sendmail', label: t('sendmail'), icon: navIcons.sendmail },
      ] : []),
    ],
  },
  {
    id: 'settings',
    label: t('navGroupSettings'),
    items: [
      { id: 'accountSettings', label: t('accountSettings'), icon: navIcons.accountSettings },
      ...(openSettings.value.enableAutoReply ? [{ id: 'auto_reply', label: t('auto_reply'), icon: navIcons.auto_reply }] : []),
      ...(openSettings.value.enableWebhook ? [{ id: 'webhook', label: t('webhookSettings'), icon: navIcons.webhook }] : []),
      ...(openSettings.value.isS3Enabled ? [{ id: 's3_attachment', label: t('s3Attachment'), icon: navIcons.s3_attachment }] : []),
      { id: 'appearance', label: t('appearance'), icon: navIcons.appearance },
      ...(openSettings.value.enableIndexAbout ? [{ id: 'about', label: t('about'), icon: navIcons.about }] : []),
    ],
  },
])
const availableTabs = computed(() => navGroups.value.flatMap((group) => group.items.map((item) => item.id)))
const activeTab = computed(() => (availableTabs.value.includes(indexTab.value) ? indexTab.value : 'mailbox'))
const pageTitle = computed(() => navGroups.value.flatMap((group) => group.items).find((item) => item.id === activeTab.value)?.label || '')
const sidebarCollapsed = useStorage('ets-index-sidebar-collapsed', false)
const surfaceItems = computed(() => [
  ...(!isTelegram.value ? [{ id: 'user', label: t('user'), to: getRouterPathWithLang('/user', locale.value) }] : []),
  ...(showAdminPage.value ? [{ id: 'admin', label: t('admin'), to: getRouterPathWithLang('/admin', locale.value) }] : []),
])

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
  <div v-if="useSimpleIndex" class="index-layout">
    <div class="index-simple-wrapper">
      <SimpleIndex />
    </div>
  </div>

  <div v-else-if="!settings.address" class="index-layout">
    <div class="index-workbench-wrapper">
      <AddressBar class="index-address-bar" />
    </div>
  </div>

  <AppShell
    v-else
    class="index-shell"
    :nav-groups="navGroups"
    :active-id="activeTab"
    :collapsed="sidebarCollapsed"
    :brand-context="t('brandContext')"
    :nav-label="t('mainNav')"
    :toggle-label="t('toggleSidebar')"
    @select="indexTab = $event"
    @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
  >
    <template #search>
      <AddressBar class="index-topbar-address" />
    </template>

    <template #actions>
      <ProductSurfaceLinks :items="surfaceItems" :aria-label="t('surfaceLinksLabel')" />
      <button class="shell-btn is-icon" type="button" :aria-label="t('enterSimpleMode')" :title="t('enterSimpleMode')"
        @click="useSimpleIndex = true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
        </svg>
      </button>
      <AppUtilityMenu />
    </template>

    <template v-if="activeTab === 'mailbox'">
      <div v-if="showMailIdQuery" class="shell-toolbar">
        <n-input-group class="index-mail-id-query">
          <n-input v-model:value="mailIdQuery" size="small" />
          <n-button size="small" type="primary" secondary @click="queryMail">
            {{ t('query') }}
          </n-button>
        </n-input-group>
      </div>
      <AccessMailWorkbench
        :key="mailBoxKey"
        :show-e-mail-to="false"
        :show-reply="openSettings.enableSendMail"
        :show-save-s3="openSettings.isS3Enabled"
        :save-to-s3="saveToS3"
        :enable-user-delete-email="openSettings.enableUserDeleteEmail"
        :fetch-mail-data="fetchMailData"
        :delete-mail="deleteMail"
        :update-mail-read-state="updateMailReadState"
      />
    </template>

    <template v-else>
      <div class="shell-toolbar">
        <h2 class="shell-toolbar-title">{{ pageTitle }}</h2>
      </div>
      <div class="shell-page">
        <div :class="activeTab === 'sendbox' ? 'index-page-wide' : 'shell-page-narrow'">
          <SendBox v-if="activeTab === 'sendbox'" :fetchMailData="fetchSenboxData"
            :enableUserDeleteEmail="openSettings.enableUserDeleteEmail" :deleteMail="deleteSenboxMail" />
          <SendMail v-else-if="activeTab === 'sendmail'" />
          <AccountSettings v-else-if="activeTab === 'accountSettings'" />
          <Appearance v-else-if="activeTab === 'appearance'" :showUseSimpleIndex="true" />
          <AutoReply v-else-if="activeTab === 'auto_reply'" />
          <Webhook v-else-if="activeTab === 'webhook'" />
          <Attachment v-else-if="activeTab === 's3_attachment'" />
          <About v-else-if="activeTab === 'about'" />
        </div>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.index-layout {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.index-workbench-wrapper {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.index-page-wide {
  max-width: 1200px;
}

.index-mail-id-query {
  max-width: 360px;
}

/* Address switcher sits in the top bar like a search field. */
.index-topbar-address {
  width: min(560px, 100%);
}

.index-topbar-address :deep(.address-toolbar-wrapper),
.index-topbar-address :deep(.address-toolbar-panel) {
  margin: 0;
  border: 0;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.index-topbar-address :deep(.address-row) {
  flex-wrap: nowrap !important;
  justify-content: flex-start !important;
  gap: 6px !important;
}

.index-topbar-address :deep(.address-select) {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 340px;
}

/* Quiet top-bar buttons, like the rest of the shell. */
.index-topbar-address :deep(.n-button) {
  --n-text-color: var(--ets-text-muted) !important;
  --n-text-color-hover: var(--ets-text) !important;
  --n-text-color-pressed: var(--ets-text) !important;
  --n-text-color-focus: var(--ets-text) !important;
  --n-color: transparent !important;
  --n-color-hover: var(--ets-hover) !important;
  --n-color-pressed: var(--ets-surface-sunken) !important;
  --n-color-focus: var(--ets-hover) !important;
}

.index-topbar-address :deep(.n-button .n-icon) {
  margin-right: 4px;
}

@media (max-width: 640px) {
  .index-topbar-address {
    width: 100%;
  }

  .index-topbar-address :deep(.address-select) {
    max-width: none;
  }
}
</style>
