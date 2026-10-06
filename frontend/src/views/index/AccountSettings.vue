<script setup>
import { ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'

import { useGlobalState } from '../../store'
import { clearSessionStorageKeys } from '../../utils/session'
import { api } from '../../api'
import { getRouterPathWithLang } from '../../utils'
import SettingsCardShell from '../../components/SettingsCardShell.vue'
import SettingsItemRow from '../../components/SettingsItemRow.vue'
import DestructiveConfirmModal from '../../components/DestructiveConfirmModal.vue'

const {
    jwt, settings, showAddressCredential, loading, openSettings
} = useGlobalState()
const router = useRouter()
const message = useMessage()

const showLogout = ref(false)
const showDeleteAccount = ref(false)
const showClearInbox = ref(false)
const showClearSentItems = ref(false)
const showChangePassword = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const { locale, t } = useScopedI18n('views.index.AccountSettings')

const copyAddress = async () => {
    if (!settings.value?.address) return
    try {
        await navigator.clipboard.writeText(settings.value.address)
        message.success(t('success') || '已复制')
    } catch {
        message.error('复制失败')
    }
}

const logout = async () => {
    try {
        await api.logoutAdminSession()
    } catch (error) {
        message.error(error.message || 'Logout failed')
        return
    }
    // Shared teardown: clears every credential, not only this address's JWT.
    clearSessionStorageKeys()
    jwt.value = '';
    await router.push(getRouterPathWithLang("/", locale.value))
    location.reload()
}

const deleteAccount = async () => {
    try {
        await api.logoutAdminSession()
        await api.fetch(`/api/delete_address`, {
            method: 'DELETE'
        });
        clearSessionStorageKeys()
        jwt.value = '';
        await router.push(getRouterPathWithLang("/", locale.value))
        location.reload()
    } catch (error) {
        message.error(error.message || "error");
    }
};

const clearInbox = async () => {
    try {
        await api.fetch(`/api/clear_inbox`, {
            method: 'DELETE'
        });
        message.success(t("success"));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearInbox.value = false;
    }
};

const clearSentItems = async () => {
    try {
        await api.fetch(`/api/clear_sent_items`, {
            method: 'DELETE'
        });
        message.success(t("success"));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearSentItems.value = false;
    }
};

const changePassword = async () => {
    if (newPassword.value !== confirmPassword.value) {
        message.error(t("passwordMismatch"));
        return;
    }
    try {
        // Changing the password revokes every Address JWT issued against the old
        // one, including this tab's. The worker returns a replacement so the
        // current session continues; other devices are signed out as intended.
        const res = await api.fetch(`/api/change_password`, {
            method: 'POST',
            body: JSON.stringify({
                password: newPassword.value
            })
        });
        if (typeof res?.jwt === 'string' && res.jwt.length > 0) {
            jwt.value = res.jwt;
        }
        message.success(t("success"));
        newPassword.value = '';
        confirmPassword.value = '';
        showChangePassword.value = false;
    } catch (error) {
        message.error(error.message || "error");
    }
};
</script>

<template>
    <div class="settings-page-wrapper" v-if="settings.address">
        <div class="settings-container">
            <!-- Mailbox Profile Summary Card -->
            <SettingsCardShell class="mailbox-identity-card">
                <div class="identity-info">
                    <div class="identity-avatar">✉</div>
                    <div class="identity-meta">
                        <span class="identity-label">{{ t('currentAddress') || '当前临时邮箱' }}</span>
                        <div class="identity-address-row">
                            <strong class="identity-address">{{ settings.address }}</strong>
                            <n-button @click="copyAddress" text size="tiny" class="copy-btn">
                                📋
                            </n-button>
                        </div>
                    </div>
                </div>
            </SettingsCardShell>

            <!-- Section 1: Security & Credentials -->
            <SettingsCardShell :title="t('security') || '凭据与安全'">
                <SettingsItemRow :title="t('showAddressCredential')">
                    <n-button @click="showAddressCredential = true" secondary size="small" type="primary">
                        {{ t('view') || '查看凭据' }}
                    </n-button>
                </SettingsItemRow>
                <SettingsItemRow
                    v-if="openSettings?.enableAddressPassword"
                    :title="t('changePassword')"
                >
                    <n-button @click="showChangePassword = true" secondary size="small">
                        {{ t('edit') || '修改密码' }}
                    </n-button>
                </SettingsItemRow>
            </SettingsCardShell>

            <!-- Section 2: Data & Session -->
            <SettingsCardShell :title="t('dataManagement') || '邮件与会话'">
                <SettingsItemRow
                    v-if="openSettings.enableUserDeleteEmail"
                    :title="t('clearInbox')"
                >
                    <n-button @click="showClearInbox = true" secondary size="small" type="warning">
                        {{ t('clearInbox') }}
                    </n-button>
                </SettingsItemRow>
                <SettingsItemRow
                    v-if="openSettings.enableUserDeleteEmail"
                    :title="t('clearSentItems')"
                >
                    <n-button @click="showClearSentItems = true" secondary size="small" type="warning">
                        {{ t('clearSentItems') }}
                    </n-button>
                </SettingsItemRow>
                <SettingsItemRow :title="t('logout')">
                    <n-button @click="showLogout = true" secondary size="small">
                        {{ t('logout') }}
                    </n-button>
                </SettingsItemRow>
            </SettingsCardShell>

            <!-- Section 3: Danger Zone -->
            <SettingsCardShell
                v-if="openSettings.enableUserDeleteEmail"
                :title="t('dangerZone') || '危险区域'"
                :danger="true"
            >
                <SettingsItemRow
                    :title="t('deleteAccount')"
                    :danger="true"
                >
                    <n-button @click="showDeleteAccount = true" type="error" secondary size="small">
                        {{ t('deleteAccount') }}
                    </n-button>
                </SettingsItemRow>
            </SettingsCardShell>
        </div>

        <DestructiveConfirmModal
            v-model:show="showLogout"
            :title="t('logout')"
            :content="t('logoutConfirm')"
            :confirm-text="t('logout')"
            :cancel-text="t('cancel') || '取消'"
            type="warning"
            :loading="loading"
            @confirm="logout"
        />

        <DestructiveConfirmModal
            v-model:show="showDeleteAccount"
            :title="t('deleteAccount')"
            :content="t('deleteAccountConfirm')"
            :confirm-text="t('deleteAccount')"
            :cancel-text="t('cancel') || '取消'"
            type="error"
            :loading="loading"
            @confirm="deleteAccount"
        />

        <DestructiveConfirmModal
            v-model:show="showClearInbox"
            :title="t('clearInbox')"
            :content="t('clearInboxConfirm')"
            :confirm-text="t('clearInbox')"
            :cancel-text="t('cancel') || '取消'"
            type="warning"
            :loading="loading"
            @confirm="clearInbox"
        />

        <DestructiveConfirmModal
            v-model:show="showClearSentItems"
            :title="t('clearSentItems')"
            :content="t('clearSentItemsConfirm')"
            :confirm-text="t('clearSentItems')"
            :cancel-text="t('cancel') || '取消'"
            type="warning"
            :loading="loading"
            @confirm="clearSentItems"
        />

        <n-modal v-model:show="showChangePassword" preset="dialog" :title="t('changePassword')">
            <n-form :model="{ newPassword, confirmPassword }">
                <n-form-item :label="t('newPassword')">
                    <n-input v-model:value="newPassword" type="password" placeholder="" show-password-on="click"
                        @keyup.enter="changePassword" />
                </n-form-item>
                <n-form-item :label="t('confirmPassword')">
                    <n-input v-model:value="confirmPassword" type="password" placeholder="" show-password-on="click"
                        @keyup.enter="changePassword" />
                </n-form-item>
            </n-form>
            <template #action>
                <n-button :loading="loading" @click="changePassword" size="small" tertiary type="info">
                    {{ t('changePassword') }}
                </n-button>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
.settings-page-wrapper {
    display: flex;
    justify-content: center;
    padding: 8px 0 24px 0;
}

.settings-container {
    max-width: 680px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.mailbox-identity-card {
    background: linear-gradient(135deg, var(--ets-surface-card, #ffffff), var(--ets-brand-soft, #f0f7ff));
    border-color: var(--ets-border-strong, #d1d5db);
}

.identity-info {
    display: flex;
    align-items: center;
    gap: 14px;
}

.identity-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--ets-brand, #2563eb);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
}

.identity-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.identity-label {
    font-size: 12px;
    color: var(--ets-text-muted, #6b7280);
}

.identity-address-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.identity-address {
    font-size: 16px;
    font-weight: 600;
    color: var(--ets-text-strong, #111827);
    word-break: break-all;
}

.copy-btn {
    cursor: pointer;
    font-size: 13px;
}
</style>
