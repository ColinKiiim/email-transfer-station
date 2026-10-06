<script setup>
import { computed, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'
import { User, ExchangeAlt } from '@vicons/fa'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import Login from '../common/Login.vue'
import AuthCardShell from '../../components/AuthCardShell.vue'
import TelegramAddress from './TelegramAddress.vue'
import LocalAddress from './LocalAddress.vue'
import AddressManagement from '../user/AddressManagement.vue'
import { getRouterPathWithLang } from '../../utils'
import AddressSelect from '../../components/AddressSelect.vue'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const router = useRouter()

const {
    jwt, settings, openSettings, showAddressCredential, userJwt,
    isTelegram, addressPassword
} = useGlobalState()

const { locale, t } = useScopedI18n('views.index.AddressBar')

const showAddressManage = ref(false)
const showUserEntry = computed(() => !isTelegram.value)

const onUserLogin = async () => {
    await router.push(getRouterPathWithLang("/user", locale.value))
}

watch(
    () => openSettings.value.fetched,
    async (fetched) => {
        if (fetched) await api.getSettings();
    },
    { immediate: true }
);
</script>

<template>
    <div>
        <div v-if="!settings.fetched && jwt" class="center">
            <n-card :bordered="false" embedded style="max-width: 600px; width: 100%;">
                <n-skeleton text :repeat="4" />
            </n-card>
        </div>
        <div v-else-if="settings.address" class="address-toolbar-wrapper">
            <div class="address-toolbar-panel">
                <AddressSelect>
                    <template #actions>
                        <n-button class="address-manage" size="small" tertiary type="primary"
                            @click="showAddressManage = true">
                            <n-icon :component="ExchangeAlt" />
                            {{ t('addressManage') }}
                        </n-button>
                    </template>
                </AddressSelect>
            </div>
        </div>
        <div v-else-if="isTelegram">
            <TelegramAddress />
        </div>
        <div v-else-if="userJwt" class="center">
            <n-card :bordered="false" embedded style="max-width: 900px; width: 100%;">
                <AddressManagement />
            </n-card>
        </div>
        <AuthCardShell
            v-else
            :title="t('mailboxAccess')"
        >
            <template v-if="jwt" #alert>
                <n-alert type="warning" :show-icon="false" :bordered="false" closable style="margin-bottom: 14px;">
                    <span>{{ t('fetchAddressError') }}</span>
                </n-alert>
            </template>
            <Login />
            <template v-if="showUserEntry" #footer>
                <button type="button" class="auth-aux-link" @click="onUserLogin">
                    <n-icon :component="User" />
                    <span>{{ t('userLogin') || '前往用户中心登录' }} &rarr;</span>
                </button>
            </template>
        </AuthCardShell>
        <AddressCredentialModal v-model:show="showAddressCredential" :address="settings.address" :jwt="jwt"
            :address-password="addressPassword" />
        <n-modal v-model:show="showAddressManage" preset="card" :title="t('addressManage')"
            style="width: 720px;">
            <TelegramAddress v-if="isTelegram" />
            <AddressManagement v-else-if="userJwt" />
            <LocalAddress v-else />
        </n-modal>
    </div>
</template>

<style scoped>
.address-toolbar-wrapper {
    width: 100%;
    padding: 8px 16px 4px;
    box-sizing: border-box;
}

.address-toolbar-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    margin: 0 auto;
    max-width: 900px;
    background: var(--ets-surface);
    border: 1px solid var(--ets-border);
    border-radius: var(--ets-radius-lg, 12px);
    box-shadow: var(--ets-shadow-card);
    transition: all var(--ets-motion-fast, 120ms);
}

.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
    margin: 20px;
}

.address-manage {
    flex: 0 0 auto;
    white-space: nowrap;
}

.auth-center-shell {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: calc(100vh - var(--ets-header-height, 56px) - 40px);
    padding: 24px 16px;
    box-sizing: border-box;
}

.auth-card {
    width: min(100%, 460px);
    border-radius: var(--ets-radius-lg, 12px);
    padding: 32px 28px;
    background: var(--ets-surface);
    border: 1px solid var(--ets-border);
    box-shadow: var(--ets-shadow-overlay, 0 12px 32px -8px rgba(11, 22, 38, 0.16));
    text-align: center;
}

.auth-brand-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--ets-radius-md, 8px);
    background: var(--ets-brand-soft);
    color: var(--ets-brand);
    margin-bottom: 12px;
    box-shadow: var(--ets-shadow-card);
}

.auth-brand-badge svg {
    width: 24px;
    height: 24px;
}

.auth-card-header h2 {
    margin: 0;
    color: var(--ets-text-strong);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
}

.auth-card-header p {
    margin: 6px 0 16px;
    color: var(--ets-text-muted);
    font-size: 13.5px;
    line-height: 1.5;
}

.auth-user-portal-entry {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--ets-divider, var(--ets-border));
    display: flex;
    justify-content: center;
}

.user-portal-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 0;
    background: transparent;
    color: var(--ets-brand);
    font: 600 13px/1.4 var(--ets-font-ui);
    cursor: pointer;
    padding: 6px 12px;
    border-radius: var(--ets-radius-sm, 6px);
    transition: background-color var(--ets-motion-fast), color var(--ets-motion-fast);
}

.user-portal-link:hover {
    background: var(--ets-brand-soft);
    color: var(--ets-brand-hover);
}
</style>
