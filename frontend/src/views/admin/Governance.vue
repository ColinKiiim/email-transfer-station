<script setup>
import { useScopedI18n } from '@/i18n/app'

import AuditLogs from './AuditLogs.vue'
import AccessLogs from './AccessLogs.vue'
import AccessPackages from './AccessPackages.vue'

const { t } = useScopedI18n('views.admin.Governance')
</script>

<template>
    <n-tabs type="bar" justify-content="center" animated>
        <n-tab-pane name="auditLogs" :tab="t('auditLogs')">
            <AuditLogs />
        </n-tab-pane>
        <n-tab-pane name="accessLogs" :tab="t('accessLogs')">
            <AccessLogs />
        </n-tab-pane>
        <n-tab-pane name="accessPackages" :tab="t('accessPackages')">
            <AccessPackages />
        </n-tab-pane>
    </n-tabs>
</template>
