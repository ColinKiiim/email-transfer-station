<script setup>
import { ref, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api'

const message = useMessage()
const loading = ref(false)
const dbVersionData = ref({
    need_initialization: false,
    need_migration: false,
    current_db_version: '',
    code_db_version: ''
})

const { t } = useScopedI18n('views.admin.DatabaseManager')

const fetchData = async () => {
    try {
        const res = await api.fetch('/admin/db_version');
        if (res) Object.assign(dbVersionData.value, res);
    } catch (error) {
        message.error(error.message || "error");
    }
}

const initialization = async () => {
    try {
        loading.value = true;
        await api.fetch('/admin/db_initialize', {
            method: 'POST'
        });
        await fetchData();
        message.success(t('initializationSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false;
    }
}

const migration = async () => {
    try {
        loading.value = true;
        await api.fetch('/admin/db_migration', {
            method: 'POST'
        });
        await fetchData();
        message.success(t('migrationSuccess'));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false;
    }
}

onMounted(async () => {
    await fetchData();
})
</script>


<template>
    <div class="center">
        <n-card :bordered="false" embedded>
            <n-alert type="info" :show-icon="false" :bordered="false">
                <div class="db-explainer">
                    <strong>{{ t('databaseScopeTitle') }}</strong>
                    <span>{{ t('databaseScopeTip') }}</span>
                </div>
            </n-alert>
            <n-alert v-if="dbVersionData.need_initialization" type="warning" :show-icon="false" :bordered="false">
                <span>{{ t('need_initialization_tip') }}</span>
                <n-button @click="initialization" type="primary" secondary block :loading="loading">
                    {{ t('init') }}
                </n-button>
            </n-alert>
            <n-alert v-if="dbVersionData.need_migration" type="warning" :show-icon="false" :bordered="false">
                <span>{{ t('need_migration_tip') }}</span>
                <n-button @click="migration" type="primary" secondary block :loading="loading">
                    {{ t('migration') }}
                </n-button>
            </n-alert>
            <n-alert type="info" :show-icon="false" :bordered="false">
                <div class="db-version-row">
                    <span>{{ t('current_db_version') }}: {{ dbVersionData.current_db_version || "unknown" }}</span>
                    <span>{{ t('code_db_version') }}: {{ dbVersionData.code_db_version }}</span>
                </div>
            </n-alert>

        </n-card>
    </div>
</template>

<style scoped>
.n-card {
    max-width: 800px;
}

.n-alert {
    margin-bottom: 10px;
}

.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
}

.n-button {
    margin-top: 10px;
}

.db-explainer {
    display: grid;
    gap: 4px;
    line-height: 1.6;
}

.db-version-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    line-height: 1.6;
}
</style>
