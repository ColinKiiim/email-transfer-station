<script setup>
import { computed, h, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { NButton, NTag } from 'naive-ui'

import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.admin.AuditLogs')

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const query = ref('')
const action = ref('')
const resourceType = ref('')
const status = ref(null)
const showDetails = ref(false)
const detailText = ref('')

const statusOptions = computed(() => [
    { label: t('success'), value: 'success' },
    { label: t('failed'), value: 'failed' },
    { label: t('denied'), value: 'denied' },
    { label: t('skipped'), value: 'skipped' },
])

const statusType = (value) => {
    if (value === 'success') return 'success'
    if (value === 'failed' || value === 'denied') return 'error'
    if (value === 'skipped') return 'warning'
    return 'default'
}

const openDetails = (row) => {
    try {
        detailText.value = JSON.stringify(JSON.parse(row.metadata || '{}'), null, 2)
    } catch {
        detailText.value = row.metadata || '{}'
    }
    showDetails.value = true
}

const columns = computed(() => [
    { title: 'ID', key: 'id', width: 72 },
    { title: t('createdAt'), key: 'created_at', width: 180 },
    { title: t('actor'), key: 'actor_label', minWidth: 160 },
    { title: t('action'), key: 'action', minWidth: 180 },
    { title: t('resourceType'), key: 'resource_type', minWidth: 140 },
    { title: t('resource'), key: 'resource_label', minWidth: 180 },
    {
        title: t('status'),
        key: 'status',
        width: 120,
        render: (row) => h(NTag, {
            size: 'small',
            type: statusType(row.status),
            bordered: false,
        }, { default: () => row.status || '-' }),
    },
    { title: t('ip'), key: 'ip', minWidth: 140 },
    {
        title: t('details'),
        key: 'details',
        width: 120,
        render: (row) => h(NButton, {
            text: true,
            type: 'primary',
            disabled: !row.metadata,
            onClick: () => openDetails(row),
        }, { default: () => t('viewDetails') }),
    },
])

const fetchData = async () => {
    try {
        const params = new URLSearchParams()
        params.set('limit', String(pageSize.value))
        params.set('offset', String((page.value - 1) * pageSize.value))
        if (query.value.trim()) params.set('q', query.value.trim())
        if (action.value.trim()) params.set('action', action.value.trim())
        if (resourceType.value.trim()) params.set('resource_type', resourceType.value.trim())
        if (status.value) params.set('status', status.value)
        const { results, count: total } = await api.fetch(`/admin/audit_events?${params.toString()}`)
        data.value = results || []
        if (total > 0 || page.value === 1) count.value = total || 0
    } catch (error) {
        message.error(error.message || 'error')
    }
}

const searchData = () => {
    if (page.value === 1) {
        fetchData()
        return
    }
    page.value = 1
}

const clearFilters = () => {
    query.value = ''
    action.value = ''
    resourceType.value = ''
    status.value = null
    searchData()
}

watch([page, pageSize], fetchData)
onMounted(fetchData)
</script>

<template>
    <n-space vertical size="large">
        <n-space align="center" wrap>
            <n-input v-model:value="query" :placeholder="t('queryPlaceholder')" clearable style="width: 260px" />
            <n-input v-model:value="action" :placeholder="t('actionPlaceholder')" clearable style="width: 220px" />
            <n-input v-model:value="resourceType" :placeholder="t('resourceTypePlaceholder')" clearable style="width: 180px" />
            <n-select v-model:value="status" :options="statusOptions" :placeholder="t('statusPlaceholder')" clearable style="width: 150px" />
            <n-button type="primary" tertiary @click="searchData">{{ t('query') }}</n-button>
            <n-button tertiary @click="clearFilters">{{ t('clear') }}</n-button>
        </n-space>

        <n-data-table :columns="columns" :data="data" :bordered="false" remote embedded :scroll-x="1120" />
        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
            :page-sizes="[20, 50, 100]" show-size-picker />

        <n-modal v-model:show="showDetails" preset="card" :title="t('details')" style="width: min(760px, calc(100vw - 32px));">
            <n-code :code="detailText" language="json" word-wrap />
        </n-modal>
    </n-space>
</template>
