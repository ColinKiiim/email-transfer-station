<script setup>
import { ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import SettingsCardShell from '../../components/SettingsCardShell.vue'
import SettingsItemRow from '../../components/SettingsItemRow.vue'
import DestructiveConfirmModal from '../../components/DestructiveConfirmModal.vue'

const { userJwt, userSettings } = useGlobalState()

const showLogout = ref(false)
const loading = ref(false)

const { t } = useScopedI18n('views.user.UserSettings')

const logout = async () => {
    userJwt.value = '';
    location.reload()
}
</script>

<template>
    <div class="settings-page-wrapper" v-if="userSettings.user_email">
        <div class="settings-container">
            <!-- User Profile Summary Card -->
            <SettingsCardShell class="user-identity-card">
                <div class="identity-info">
                    <div class="identity-avatar">👤</div>
                    <div class="identity-meta">
                        <span class="identity-label">{{ t('userAccount') || '用户账户' }}</span>
                        <strong class="identity-email">{{ userSettings.user_email }}</strong>
                    </div>
                </div>
            </SettingsCardShell>

            <!-- Session Card -->
            <SettingsCardShell :title="t('session') || '会话管理'">
                <SettingsItemRow :title="t('logout')">
                    <n-button @click="showLogout = true" type="warning" secondary size="small">
                        {{ t('logout') }}
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

.user-identity-card {
    background: linear-gradient(135deg, var(--ets-surface-card, #ffffff), var(--ets-brand-soft, #f0f7ff));
    border-color: var(--ets-border-strong, #d1d5db);
}

.identity-info {
    display: flex;
    align-items: center;
    gap: 14px;
}

.identity-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--ets-brand, #2563eb);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
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

.identity-email {
    font-size: 16px;
    font-weight: 600;
    color: var(--ets-text-strong, #111827);
    word-break: break-all;
}

.note-desc {
    font-size: 13px;
    color: var(--ets-text-muted, #6b7280);
    line-height: 1.6;
    margin: 0;
}
</style>
