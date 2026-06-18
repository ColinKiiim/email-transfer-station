<script setup>
import { computed, h, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { NButton, NDropdown, NIcon, NTag, useMessage } from 'naive-ui'
import { MenuFilled } from '@vicons/material'

import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.admin.AccessPackages')

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const query = ref('')
const status = ref(null)
const address = ref('')
const showCreate = ref(false)
const showEdit = ref(false)
const showRevoke = ref(false)
const revokeTarget = ref(null)
const addressOptions = ref([])
const latestShareLink = ref('')

const createForm = ref({
    address_id: null,
    label: '',
    expires_at: null,
})

const editForm = ref({
    id: null,
    label: '',
    scopes: 'read',
    expires_at: null,
})

const statusOptions = computed(() => [
    { label: t('active'), value: 'active' },
    { label: t('revoked'), value: 'revoked' },
    { label: t('expired'), value: 'expired' },
])

const statusTagType = (value) => {
    if (value === 'active') return 'success'
    if (value === 'expired') return 'warning'
    if (value === 'revoked') return 'error'
    return 'default'
}

const formatD1DateTime = (timestamp) => {
    if (!timestamp) return null
    const date = new Date(timestamp)
    const pad = (value) => String(value).padStart(2, '0')
    return [
        date.getUTCFullYear(),
        pad(date.getUTCMonth() + 1),
        pad(date.getUTCDate()),
    ].join('-') + ' ' + [
        pad(date.getUTCHours()),
        pad(date.getUTCMinutes()),
        pad(date.getUTCSeconds()),
    ].join(':')
}

const parseD1DateTime = (value) => {
    if (!value) return null
    return new Date(`${value.replace(' ', 'T')}Z`).getTime()
}

const copyText = async (text) => {
    await navigator.clipboard.writeText(text)
    message.success(t('copied'))
}

const fetchAddresses = async () => {
    try {
        const { results } = await api.fetch('/admin/address?limit=100&offset=0')
        addressOptions.value = (results || []).map((row) => ({
            label: row.name,
            value: row.id,
        }))
    } catch (error) {
        message.error(error.message || 'error')
    }
}

const fetchData = async () => {
    try {
        const params = new URLSearchParams()
        params.set('limit', String(pageSize.value))
        params.set('offset', String((page.value - 1) * pageSize.value))
        if (query.value.trim()) params.set('q', query.value.trim())
        if (address.value.trim()) params.set('address', address.value.trim())
        if (status.value) params.set('status', status.value)
        const { results, count: total } = await api.fetch(`/admin/access_packages?${params.toString()}`)
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
    address.value = ''
    status.value = null
    searchData()
}

const openCreate = async () => {
    latestShareLink.value = ''
    createForm.value = { address_id: null, label: '', expires_at: null }
    if (!addressOptions.value.length) await fetchAddresses()
    showCreate.value = true
}

const createPackage = async () => {
    if (!createForm.value.address_id) {
        message.error(t('selectAddressTip'))
        return
    }
    try {
        const res = await api.fetch(`/admin/address/${createForm.value.address_id}/share_tokens`, {
            method: 'POST',
            body: JSON.stringify({
                label: createForm.value.label || '',
                scopes: ['read'],
                expires_at: formatD1DateTime(createForm.value.expires_at),
            }),
        })
        latestShareLink.value = `${window.location.origin}/i/${encodeURIComponent(res.token)}`
        await copyText(latestShareLink.value)
        await fetchData()
    } catch (error) {
        message.error(error.message || 'error')
    }
}

const openEdit = (row) => {
    editForm.value = {
        id: row.id,
        label: row.label || '',
        scopes: row.scopes || 'read',
        expires_at: parseD1DateTime(row.expires_at),
    }
    showEdit.value = true
}

const saveEdit = async () => {
    try {
        await api.fetch(`/admin/address_share_tokens/${editForm.value.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                label: editForm.value.label || '',
                scopes: editForm.value.scopes || 'read',
                expires_at: formatD1DateTime(editForm.value.expires_at),
            }),
        })
        message.success(t('success'))
        showEdit.value = false
        await fetchData()
    } catch (error) {
        message.error(error.message || 'error')
    }
}

const revokePackage = (row) => {
    revokeTarget.value = row
    showRevoke.value = true
}

const confirmRevokePackage = async () => {
    if (!revokeTarget.value) return
    try {
        await api.fetch(`/admin/address_share_tokens/${revokeTarget.value.id}`, { method: 'DELETE' })
        message.success(t('success'))
        showRevoke.value = false
        revokeTarget.value = null
        await fetchData()
    } catch (error) {
        message.error(error.message || 'error')
    }
}

const actionOptions = () => [
    { label: t('edit'), key: 'edit' },
    { label: t('revoke'), key: 'revoke' },
]

const handleAction = (key, row) => {
    if (key === 'edit') openEdit(row)
    if (key === 'revoke') revokePackage(row)
}

const columns = computed(() => [
    { title: 'ID', key: 'id', width: 72 },
    { title: t('address'), key: 'address', minWidth: 220 },
    { title: t('label'), key: 'label', minWidth: 160 },
    { title: t('scopes'), key: 'scopes', width: 120 },
    {
        title: t('status'),
        key: 'status',
        width: 120,
        render: (row) => h(NTag, {
            type: statusTagType(row.status),
            size: 'small',
            bordered: false,
        }, { default: () => t(row.status || 'unknown') }),
    },
    { title: t('expiresAt'), key: 'expires_at', minWidth: 180 },
    { title: t('lastUsedAt'), key: 'last_used_at', minWidth: 180 },
    { title: t('createdAt'), key: 'created_at', minWidth: 180 },
    {
        title: t('actions'),
        key: 'actions',
        width: 96,
        align: 'center',
        render: (row) => h(NDropdown, {
            trigger: 'click',
            placement: 'bottom-end',
            options: actionOptions(),
            onSelect: (key) => handleAction(key, row),
        }, {
            default: () => h(NButton, {
                quaternary: true,
                circle: true,
                size: 'small',
                'aria-label': t('actions'),
            }, { icon: () => h(NIcon, null, { default: () => h(MenuFilled) }) })
        }),
    },
])

watch([page, pageSize], fetchData)
onMounted(fetchData)
</script>

<template>
    <n-space vertical size="large">
        <n-space align="center" wrap>
            <n-input v-model:value="query" :placeholder="t('queryPlaceholder')" clearable style="width: 260px" />
            <n-input v-model:value="address" :placeholder="t('addressPlaceholder')" clearable style="width: 220px" />
            <n-select v-model:value="status" :options="statusOptions" :placeholder="t('statusPlaceholder')" clearable style="width: 150px" />
            <n-button type="primary" tertiary @click="searchData">{{ t('query') }}</n-button>
            <n-button tertiary @click="clearFilters">{{ t('clear') }}</n-button>
            <n-button type="primary" @click="openCreate">{{ t('create') }}</n-button>
        </n-space>

        <n-data-table :columns="columns" :data="data" :bordered="false" remote embedded :scroll-x="1320" />
        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
            :page-sizes="[20, 50, 100]" show-size-picker />

        <n-modal v-model:show="showCreate" preset="card" :title="t('create')" style="width: min(680px, calc(100vw - 32px));">
            <n-form label-placement="top">
                <n-form-item :label="t('address')">
                    <n-select v-model:value="createForm.address_id" :options="addressOptions" filterable clearable />
                </n-form-item>
                <n-form-item :label="t('label')">
                    <n-input v-model:value="createForm.label" maxlength="128" show-count clearable />
                </n-form-item>
                <n-form-item :label="t('expiresAt')">
                    <n-date-picker v-model:value="createForm.expires_at" type="datetime" clearable style="width: 100%" />
                </n-form-item>
                <n-alert v-if="latestShareLink" type="success" :bordered="false">
                    <n-space vertical>
                        <n-text>{{ t('latestShareLink') }}</n-text>
                        <code class="share-link">{{ latestShareLink }}</code>
                        <n-button size="small" tertiary type="primary" @click="copyText(latestShareLink)">
                            {{ t('copy') }}
                        </n-button>
                    </n-space>
                </n-alert>
            </n-form>
            <template #footer>
                <n-button type="primary" @click="createPackage">{{ t('create') }}</n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showEdit" preset="dialog" :title="t('edit')">
            <n-form label-placement="top">
                <n-form-item :label="t('label')">
                    <n-input v-model:value="editForm.label" maxlength="128" show-count clearable />
                </n-form-item>
                <n-form-item :label="t('scopes')">
                    <n-input v-model:value="editForm.scopes" />
                </n-form-item>
                <n-form-item :label="t('expiresAt')">
                    <n-date-picker v-model:value="editForm.expires_at" type="datetime" clearable style="width: 100%" />
                </n-form-item>
            </n-form>
            <template #action>
                <n-button type="primary" @click="saveEdit">{{ t('save') }}</n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showRevoke" preset="dialog" :title="t('revoke')">
            <n-text>{{ t('revokeTip') }}</n-text>
            <template #action>
                <n-space justify="end">
                    <n-button @click="showRevoke = false">{{ t('cancel') }}</n-button>
                    <n-button type="error" @click="confirmRevokePackage">{{ t('confirm') }}</n-button>
                </n-space>
            </template>
        </n-modal>
    </n-space>
</template>

<style scoped>
.share-link {
    display: block;
    max-width: 100%;
    overflow-wrap: anywhere;
}
</style>
