<script setup>
import { onMounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import Login from '../common/Login.vue'
import SettingsCardShell from '../../components/SettingsCardShell.vue'

const { userSettings } = useGlobalState()

const { t } = useScopedI18n('views.user.BindAddress')

onMounted(async () => {
})
</script>

<template>
    <div class="bind-page-wrapper" v-if="userSettings.user_email">
        <div class="bind-container">
            <SettingsCardShell :title="t('title')">
                <div class="bind-card-body">
                    <Login />
                </div>
            </SettingsCardShell>
        </div>
    </div>
</template>

<style scoped>
.bind-page-wrapper {
    display: flex;
    justify-content: center;
    padding: 12px 16px 32px 16px;
}

.bind-container {
    width: 100%;
    max-width: 600px;
}

.bind-card-body {
    width: 100%;
}
</style>
