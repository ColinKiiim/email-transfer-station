<script setup>
import { computed, h, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { NButton, NTag } from 'naive-ui'

import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.admin.AccessLogs')

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const query = ref('')
const eventType = ref('')
const path = ref('')
const ip = ref('')
const status = ref(null)
const showDetails = ref(false)
const detailText = ref('')

const statusOptions = computed(() => [
    { label: t('success'), value: 'success' },
    { label: t('failed'), value: 'failed' },
    { label: t('denied'), value: 'denied' },
])

const statusTagType = (value) => {
    if (value === 'success') return 'success'
    if (value === 'failed' || value === 'denied') return 'error'
    return 'default'
}

const openDetails = (row) => {
    let metadata = undefined
    try {
        metadata = row.metadata ? JSON.parse(row.metadata) : undefined
    } catch {
        metadata = row.metadata || undefined
    }
    const details = {
        failure_reason: row.failure_reason || undefined,
        metadata,
        user_agent: row.user_agent || undefined,
    }
    detailText.value = JSON.stringify(details, null, 2)
    showDetails.value = true
}

const columns = computed(() => [
    { title: 'ID', key: 'id', width: 72 },
    { title: t('createdAt'), key: 'created_at', width: 180 },
    { title: t('event'), key: 'event_type', minWidth: 190 },
    { title: t('actor'), key: 'actor_label', minWidth: 160 },
    { title: t('resource'), key: 'resource_label', minWidth: 180 },
    { title: t('method'), key: 'method', width: 100 },
    { title: t('path'), key: 'path', minWidth: 220 },
    { title: t('ip'), key: 'ip', minWidth: 140 },
    {
        title: t('status'),
        key: 'status',
        width: 120,
        render: (row) => h(NTag, {
            size: 'small',
            type: statusTagType(row.status),
            bordered: false,
        }, { default: () => row.status || '-' }),
    },
    {
        title: t('details'),
        key: 'details',
        width: 120,
        render: (row) => h(NButton, {
            text: true,
            type: 'primary',
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
        if (eventType.value.trim()) params.set('event_type', eventType.value.trim())
        if (path.value.trim()) params.set('path', path.value.trim())
        if (ip.value.trim()) params.set('ip', ip.value.trim())
        if (status.value) params.set('status', status.value)
        const { results, count: total } = await api.fetch(`/admin/access_events?${params.toString()}`)
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
    eventType.value = ''
    path.value = ''
    ip.value = ''
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
            <n-input v-model:value="eventType" :placeholder="t('eventPlaceholder')" clearable style="width: 220px" />
            <n-input v-model:value="path" :placeholder="t('pathPlaceholder')" clearable style="width: 220px" />
            <n-input v-model:value="ip" :placeholder="t('ipPlaceholder')" clearable style="width: 180px" />
            <n-select v-model:value="status" :options="statusOptions" :placeholder="t('statusPlaceholder')" clearable style="width: 150px" />
            <n-button type="primary" tertiary @click="searchData">{{ t('query') }}</n-button>
            <n-button tertiary @click="clearFilters">{{ t('clear') }}</n-button>
        </n-space>

        <n-data-table :columns="columns" :data="data" :bordered="false" remote embedded :scroll-x="1320" />
        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
            :page-sizes="[20, 50, 100]" show-size-picker />

        <n-modal v-model:show="showDetails" preset="card" :title="t('details')" style="width: min(760px, calc(100vw - 32px));">
            <n-code :code="detailText" language="json" word-wrap />
        </n-modal>
    </n-space>
</template>
