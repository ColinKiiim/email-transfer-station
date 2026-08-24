<script setup>
import { ref, computed, onMounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NInput, NModal, useMessage, useNotification } from 'naive-ui'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword } from '../utils'
import Turnstile from '../components/Turnstile.vue'
import ProductBrand from '../components/ProductBrand.vue'
import ProductSurfaceLinks from '../components/ProductSurfaceLinks.vue'
import AppUtilityMenu from '../components/AppUtilityMenu.vue'

const PRODUCT_TITLE = 'Email Transfer Station'

const message = useMessage()
const notification = useNotification()

const {
    isTelegram, showAdminPage,
    showAuth, auth, loading, openSettings, userSettings
} = useGlobalState()
const route = useRoute()
const router = useRouter()

const showUserEntry = computed(() => !isTelegram.value);
const { t, locale } = useScopedI18n('views.Header')

const surfaceItems = computed(() => {
    const items = [];
    if (showUserEntry.value) {
        items.push({
            id: 'user',
            label: t('user') || '用户',
            to: getRouterPathWithLang('/user', locale.value)
        });
    }
    if (showAdminPage.value) {
        items.push({
            id: 'admin',
            label: t('admin') || '管理',
            to: getRouterPathWithLang('/admin', locale.value)
        });
    }
    return items;
});

const cfToken = ref('')
const turnstileRef = ref(null)

const authFunc = async () => {
    try {
        await api.fetch('/open_api/site_login', {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(auth.value),
                cf_token: cfToken.value
            })
        });
        location.reload()
    } catch (error) {
        message.error(error.message || "error");
        turnstileRef.value?.refresh?.();
    }
}

useHead({
    title: () => openSettings.value.title || PRODUCT_TITLE,
    meta: [
        { name: "description", content: openSettings.value.description || PRODUCT_TITLE },
    ]
});

const onLogoClick = async () => {
    if (route.path !== '/' && route.path !== `/${locale.value}/` && route.path !== `/${locale.value}`) {
        await router.push(getRouterPathWithLang('/', locale.value));
    }
}

onMounted(async () => {
    await api.getOpenSettings(message, notification);
    // make sure user_id is fetched
    if (!userSettings.value.user_id) await api.getUserSettings(message);
});
</script>

<template>
    <div>
        <header class="app-topbar">
            <button type="button" class="header-brand-button" :aria-label="openSettings.title || PRODUCT_TITLE"
                @click="onLogoClick">
                <ProductBrand class="header-product-brand" compact :context-label="t('mailboxContext') || '邮箱访问'" />
            </button>
            <div class="header-top-actions">
                <ProductSurfaceLinks :items="surfaceItems" />
                <AppUtilityMenu />
            </div>
        </header>
        <n-modal v-model:show="showAuth" :closable="false" :closeOnEsc="false" :maskClosable="false" preset="dialog"
            :title="t('accessHeader')">
            <p>{{ t('accessTip') }}</p>
            <n-input v-model:value="auth" type="password" show-password-on="click" @keyup.enter="authFunc" />
            <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
            <template #action>
                <n-button :loading="loading" @click="authFunc" type="primary">
                    {{ t('ok') }}
                </n-button>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
.app-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    height: 60px;
    min-height: 60px;
    padding: 0 24px;
    background: var(--ets-surface);
    border-bottom: 1px solid var(--ets-border);
    box-sizing: border-box;
}

.header-top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.header-brand-button {
    display: block;
    max-width: min(360px, 38vw);
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
}

.header-brand-button:focus-visible {
    border-radius: var(--ets-radius-sm);
    outline: 2px solid var(--ets-focus-ring);
    outline-offset: 3px;
}

.header-product-brand {
    max-width: 100%;
}
</style>
