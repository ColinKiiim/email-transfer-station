<script setup>
import { computed, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'
import { User, ExchangeAlt } from '@vicons/fa'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import Login from '../common/Login.vue'
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
        <div v-else-if="settings.address">
            <n-alert type="info" :show-icon="false" :bordered="false">
                <AddressSelect>
                    <template #actions>
                        <n-button class="address-manage" size="small" tertiary type="primary"
                            @click="showAddressManage = true">
                            <n-icon :component="ExchangeAlt" />
                            {{ t('addressManage') }}
                        </n-button>
                    </template>
                </AddressSelect>
            </n-alert>
        </div>
        <div v-else-if="isTelegram">
            <TelegramAddress />
        </div>
        <div v-else-if="userJwt" class="center">
            <n-card :bordered="false" embedded style="max-width: 900px; width: 100%;">
                <AddressManagement />
            </n-card>
        </div>
        <div v-else class="auth-center-shell">
            <div class="auth-card">
                <div class="auth-brand-badge">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2" />
                        <path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" />
                    </svg>
                </div>
                <div class="auth-card-header">
                    <h2>{{ t('mailboxAccess') }}</h2>
                    <p>{{ t('mailboxAccessDesc') }}</p>
                </div>
                <n-alert v-if="jwt" type="warning" :show-icon="false" :bordered="false" closable style="margin-bottom: 14px;">
                    <span>{{ t('fetchAddressError') }}</span>
                </n-alert>
                <Login />
                <div v-if="showUserEntry" class="auth-user-portal-entry">
                    <div class="auth-separator">
                        <span>{{ t('or') || '或' }}</span>
                    </div>
                    <n-button @click="onUserLogin" type="primary" block secondary size="large" class="user-portal-btn" strong>
                        <template #icon>
                            <n-icon :component="User" />
                        </template>
                        {{ t('userLogin') }}
                    </n-button>
                </div>
            </div>
        </div>
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
.n-alert {
    margin-top: 10px;
    margin-bottom: 10px;
    text-align: center;
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
    min-height: calc(100vh - 60px);
    padding: 24px 16px;
    box-sizing: border-box;
}

.auth-card {
    width: min(100%, 460px);
    border-radius: 16px;
    padding: 32px 28px;
    background: var(--ets-surface);
    border: 1px solid var(--ets-border);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
    text-align: center;
}

.auth-brand-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: #ffffff;
    margin-bottom: 12px;
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
}

.auth-brand-badge svg {
    width: 24px;
    height: 24px;
}

.auth-card-header h2 {
    margin: 0;
    color: var(--ets-text-strong);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
}

.auth-card-header p {
    margin: 6px 0 16px;
    color: var(--ets-text-muted);
    font-size: 13.5px;
    line-height: 1.5;
}

.auth-separator {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 18px 0 12px;
    color: var(--ets-text-muted);
    font-size: 12px;
}

.auth-separator::before,
.auth-separator::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--ets-border);
}

.auth-separator span {
    padding: 0 12px;
    opacity: 0.6;
}

.user-portal-btn {
    height: 40px;
    border-radius: 8px;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--ets-border);
}

.user-portal-btn:hover {
    background: rgba(255, 255, 255, 0.08);
}
</style>
