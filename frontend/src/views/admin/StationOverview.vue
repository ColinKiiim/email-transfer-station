<script setup>
import { computed, onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { AnalyticsOutlined, KeyOutlined, MailOutlined, PeopleAltOutlined, SendOutlined } from '@vicons/material'
import { User, UserCheck } from '@vicons/fa'

import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.admin.StationOverview')

const overview = ref({
    totals: {
        address_count: 0,
        user_count: 0,
        mail_count: 0,
        send_mail_count: 0,
        active_share_count: 0,
        audit_events_24h: 0,
        access_events_24h: 0,
    },
    domains: [],
    recent_audit_events: [],
    recent_access_events: [],
})
const statistics = ref({
    userCount: 0,
    activeAddressCount7days: 0,
    activeAddressCount30days: 0,
})

const loading = ref(false)
const overviewError = ref('')
const statisticsError = ref('')

const fetchOverview = async () => {
    loading.value = true
    overviewError.value = ''
    statisticsError.value = ''
    const [overviewResult, statisticsResult] = await Promise.allSettled([
        api.fetch('/admin/overview'),
        api.fetch('/admin/statistics'),
    ])
    if (overviewResult.status === 'fulfilled') {
        overview.value = overviewResult.value
    } else {
        overviewError.value = overviewResult.reason?.message || 'error'
    }
    if (statisticsResult.status === 'fulfilled') {
        statistics.value = {
            userCount: statisticsResult.value.userCount || 0,
            activeAddressCount7days: statisticsResult.value.activeAddressCount7days || 0,
            activeAddressCount30days: statisticsResult.value.activeAddressCount30days || 0,
        }
    } else {
        statisticsError.value = statisticsResult.reason?.message || 'error'
    }
    if (overviewError.value || statisticsError.value) {
        message.warning(overviewError.value || statisticsError.value)
    }
    loading.value = false
}

const metricItems = computed(() => [
    { key: 'address_count', label: t('addressCount'), value: overview.value.totals.address_count, icon: PeopleAltOutlined },
    { key: 'mail_count', label: t('mailCount'), value: overview.value.totals.mail_count, icon: MailOutlined },
    { key: 'send_mail_count', label: t('sendMailCount'), value: overview.value.totals.send_mail_count, icon: SendOutlined },
    { key: 'active_share_count', label: t('activePackages'), value: overview.value.totals.active_share_count, icon: KeyOutlined },
    { key: 'audit_events_24h', label: t('auditEvents24h'), value: overview.value.totals.audit_events_24h, icon: AnalyticsOutlined },
    { key: 'access_events_24h', label: t('accessEvents24h'), value: overview.value.totals.access_events_24h, icon: AnalyticsOutlined },
])

const activityItems = computed(() => [
    { key: 'userCount', label: t('userCount'), value: statistics.value.userCount, icon: User },
    {
        key: 'activeAddressCount7days',
        label: t('activeAddressCount7days'),
        value: statistics.value.activeAddressCount7days,
        icon: UserCheck,
    },
    {
        key: 'activeAddressCount30days',
        label: t('activeAddressCount30days'),
        value: statistics.value.activeAddressCount30days,
        icon: UserCheck,
    },
])

const domainColumns = computed(() => [
    { title: t('domain'), key: 'domain' },
    { title: t('addressCount'), key: 'address_count', width: 140 },
    { title: t('mailCount'), key: 'mail_count', width: 140 },
    { title: t('activePackages'), key: 'active_share_count', width: 160 },
])

const auditColumns = computed(() => [
    { title: t('time'), key: 'created_at', width: 180 },
    { title: t('action'), key: 'action' },
    { title: t('resource'), key: 'resource_label' },
    { title: t('status'), key: 'status', width: 120 },
])

const accessColumns = computed(() => [
    { title: t('time'), key: 'created_at', width: 180 },
    { title: t('event'), key: 'event_type' },
    { title: t('resource'), key: 'resource_label' },
    { title: t('status'), key: 'status', width: 120 },
])

onMounted(fetchOverview)
</script>

<template>
    <n-space vertical size="large">
        <div class="overview-header">
            <div>
                <h2>{{ t('title') }}</h2>
                <p>{{ t('subtitle') }}</p>
            </div>
            <n-button :loading="loading" tertiary type="primary" @click="fetchOverview">
                {{ t('refresh') }}
            </n-button>
        </div>

        <n-alert v-if="overviewError" type="error" :show-icon="false">
            {{ overviewError }}
        </n-alert>

        <n-grid cols="1 s:2 l:3" :x-gap="16" :y-gap="16" responsive="screen">
            <n-grid-item v-for="item in metricItems" :key="item.key">
                <n-card :bordered="false" embedded>
                    <n-statistic :label="item.label" :value="item.value || 0">
                        <template #prefix>
                            <n-icon :component="item.icon" />
                        </template>
                    </n-statistic>
                </n-card>
            </n-grid-item>
        </n-grid>

        <section class="overview-section">
            <div class="section-header">
                <h3>{{ t('activitySummary') }}</h3>
            </div>
            <n-alert v-if="statisticsError" type="warning" :show-icon="false" style="margin-bottom: 12px;">
                {{ statisticsError }}
            </n-alert>
            <n-grid cols="1 s:2 l:3" :x-gap="16" :y-gap="16" responsive="screen">
                <n-grid-item v-for="item in activityItems" :key="item.key">
                    <n-card :bordered="false" embedded>
                        <n-statistic :label="item.label" :value="item.value || 0">
                            <template #prefix>
                                <n-icon :component="item.icon" />
                            </template>
                        </n-statistic>
                    </n-card>
                </n-grid-item>
            </n-grid>
        </section>

        <n-grid cols="1 l:2" :x-gap="16" :y-gap="16" responsive="screen">
            <n-grid-item>
                <section class="overview-section">
                    <div class="section-header">
                        <h3>{{ t('domainBreakdown') }}</h3>
                    </div>
                    <n-data-table :columns="domainColumns" :data="overview.domains" :bordered="false" embedded />
                </section>
            </n-grid-item>
            <n-grid-item>
                <section class="overview-section">
                    <div class="section-header">
                        <h3>{{ t('recentAudit') }}</h3>
                    </div>
                    <n-data-table :columns="auditColumns" :data="overview.recent_audit_events" :bordered="false" embedded />
                </section>
            </n-grid-item>
        </n-grid>

        <section class="overview-section">
            <div class="section-header">
                <h3>{{ t('recentAccess') }}</h3>
            </div>
            <n-data-table :columns="accessColumns" :data="overview.recent_access_events" :bordered="false" embedded />
        </section>
    </n-space>
</template>

<style scoped>
.overview-header,
.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.overview-header h2,
.section-header h3 {
    margin: 0;
}

.overview-header p {
    margin: 6px 0 0;
    color: var(--text-color-3);
}

.overview-section {
    padding: 16px 0;
}

.section-header {
    margin-bottom: 12px;
}
</style>
