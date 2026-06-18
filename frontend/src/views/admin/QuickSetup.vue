<script setup>
import { computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import {
    AccountTreeOutlined,
    ManageAccountsOutlined,
    SettingsOutlined,
    StorageOutlined,
} from '@vicons/material'

import { useGlobalState } from '../../store'

const {
    adminTab,
    adminAccountTab,
    adminUserTab,
    adminMaintenanceTab,
} = useGlobalState()
const { t } = useScopedI18n('views.admin.QuickSetup')

const setupItems = computed(() => [
    {
        key: 'database',
        title: t('databaseTitle'),
        description: t('databaseDescription'),
        button: t('goMaintenance'),
        icon: StorageOutlined,
        target: { top: 'maintenance', child: 'database' },
    },
    {
        key: 'worker',
        title: t('workerTitle'),
        description: t('workerDescription'),
        button: t('goMaintenance'),
        icon: SettingsOutlined,
        target: { top: 'maintenance', child: 'workerconfig' },
    },
    {
        key: 'account',
        title: t('accountTitle'),
        description: t('accountDescription'),
        button: t('goAccount'),
        icon: AccountTreeOutlined,
        target: { top: 'account', child: 'account_settings' },
    },
    {
        key: 'user',
        title: t('userTitle'),
        description: t('userDescription'),
        button: t('goUser'),
        icon: ManageAccountsOutlined,
        target: { top: 'user', child: 'user_settings' },
    },
])

const jumpTo = (target) => {
    adminTab.value = target.top
    if (target.top === 'maintenance') adminMaintenanceTab.value = target.child
    if (target.top === 'account') adminAccountTab.value = target.child
    if (target.top === 'user') adminUserTab.value = target.child
}
</script>

<template>
    <section class="quick-setup">
        <div class="quick-setup-header">
            <h2>{{ t('title') }}</h2>
            <p>{{ t('subtitle') }}</p>
        </div>

        <n-grid cols="1 m:2" :x-gap="14" :y-gap="14" responsive="screen">
            <n-grid-item v-for="item in setupItems" :key="item.key">
                <n-card class="setup-card" :bordered="false" embedded>
                    <div class="setup-card-content">
                        <n-icon class="setup-card-icon" :component="item.icon" size="26" />
                        <div class="setup-card-copy">
                            <h3>{{ item.title }}</h3>
                            <p>{{ item.description }}</p>
                        </div>
                        <n-button tertiary type="primary" @click="jumpTo(item.target)">
                            {{ item.button }}
                        </n-button>
                    </div>
                </n-card>
            </n-grid-item>
        </n-grid>
    </section>
</template>

<style scoped>
.quick-setup {
    padding: 8px 0;
}

.quick-setup-header {
    margin-bottom: 16px;
}

.quick-setup-header h2 {
    margin: 0;
}

.quick-setup-header p {
    margin: 6px 0 0;
    color: var(--n-text-color-3);
}

.setup-card {
    height: 100%;
}

.setup-card-content {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
}

.setup-card-icon {
    color: var(--n-primary-color);
}

.setup-card-copy {
    min-width: 0;
}

.setup-card-copy h3 {
    margin: 0;
    font-size: 15px;
}

.setup-card-copy p {
    margin: 4px 0 0;
    color: var(--n-text-color-3);
    line-height: 1.5;
}

@media (max-width: 720px) {
    .setup-card-content {
        grid-template-columns: auto minmax(0, 1fr);
    }

    .setup-card-content .n-button {
        grid-column: 1 / -1;
        justify-self: start;
    }
}
</style>
