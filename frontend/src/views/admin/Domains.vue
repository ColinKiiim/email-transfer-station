<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NButton, NSpace, NSwitch, NTag, NText } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api'
import { canRunManagedDomainAction } from '../../utils/domain-ui'

const message = useMessage()
const { t } = useScopedI18n('views.admin.Domains')

const domains = ref([])
const cloudflareAutomation = ref({ has_token: false, worker_name: '' })
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const importing = ref(false)
const actionBusy = ref({})
const showEditor = ref(false)
const editingId = ref(null)
const showDisableConfirm = ref(false)
const disableTarget = ref(null)
const disableImpact = ref(null)
const showCloudflareConfirm = ref(false)
const cloudflareTarget = ref(null)
const cloudflarePreview = ref(null)

const model = reactive({
    domain: '',
    display_label: '',
    receive_mode: 'cloudflare_email',
    enabled: true,
    allow_address_creation: false,
    is_default: false,
    allow_random_subdomain: false,
    allow_subdomain_match: null,
    collector_address: '',
    cloudflare_zone_id: '',
    notes: '',
    setup_status: 'draft',
    config_version: 1,
})

const receiveModeOptions = [
    { label: 'Cloudflare Email Routing', value: 'cloudflare_email' },
    { label: 'ImprovMX free forwarding', value: 'improvmx_forward' },
    { label: 'External webhook', value: 'external_webhook' },
    { label: 'Manual', value: 'manual' },
]

const subdomainMatchOptions = computed(() => [
    { label: t('subdomainInherit'), value: null },
    { label: t('subdomainAllow'), value: true },
    { label: t('subdomainDeny'), value: false },
])

const resetModel = () => {
    editingId.value = null
    Object.assign(model, {
        domain: '',
        display_label: '',
        receive_mode: 'cloudflare_email',
        enabled: true,
        allow_address_creation: false,
        is_default: false,
        allow_random_subdomain: false,
        allow_subdomain_match: null,
        collector_address: '',
        cloudflare_zone_id: '',
        notes: '',
        setup_status: 'draft',
        config_version: 1,
    })
}

const fetchData = async () => {
    loading.value = true
    loadError.value = ''
    try {
        const res = await api.fetch('/admin/domains')
        domains.value = res.results || []
        cloudflareAutomation.value = res.cloudflare_automation || { has_token: false, worker_name: '' }
    } catch (error) {
        loadError.value = error.message || t('failed')
    } finally {
        loading.value = false
    }
}

const refreshAfterMutation = async () => {
    await fetchData()
    await api.getOpenSettings(message)
}

const openCreate = () => {
    resetModel()
    showEditor.value = true
}

const openEdit = (row) => {
    editingId.value = row.id
    Object.assign(model, {
        domain: row.domain || '',
        display_label: row.display_label || '',
        receive_mode: row.receive_mode || 'manual',
        enabled: !!row.enabled,
        allow_address_creation: !!row.allow_address_creation,
        is_default: !!row.is_default,
        allow_random_subdomain: !!row.allow_random_subdomain,
        allow_subdomain_match: row.allow_subdomain_match ?? null,
        collector_address: row.collector_address || '',
        cloudflare_zone_id: row.cloudflare_zone_id || '',
        notes: row.notes || '',
        setup_status: row.setup_status || 'draft',
        config_version: row.config_version || 1,
    })
    showEditor.value = true
}

const saveDomain = async () => {
    if (saving.value) return
    saving.value = true
    try {
        const path = editingId.value ? `/admin/domains/${editingId.value}` : '/admin/domains'
        const payload = {
            domain: model.domain,
            display_label: model.display_label,
            receive_mode: model.receive_mode,
            enabled: model.enabled,
            allow_address_creation: model.allow_address_creation,
            is_default: model.is_default,
            allow_random_subdomain: model.allow_random_subdomain,
            allow_subdomain_match: model.allow_subdomain_match,
            collector_address: model.collector_address,
            cloudflare_zone_id: model.cloudflare_zone_id,
            notes: model.notes,
            ...(editingId.value ? { config_version: model.config_version } : {}),
        }
        await api.fetch(path, {
            method: editingId.value ? 'PATCH' : 'POST',
            body: JSON.stringify(payload),
        })
        message.success(t('success'))
        showEditor.value = false
        await refreshAfterMutation()
    } catch (error) {
        message.error(error.message || t('failed'))
    } finally {
        saving.value = false
    }
}

const importEnv = async () => {
    if (importing.value) return
    importing.value = true
    try {
        const res = await api.fetch('/admin/domains/import_env', {
            method: 'POST',
            body: JSON.stringify({ overwrite: false }),
        })
        message.success(`${t('success')} (${res.imported || 0})`)
        await refreshAfterMutation()
    } catch (error) {
        message.error(error.message || t('failed'))
    } finally {
        importing.value = false
    }
}

const actionKey = (row, action) => `${row.id || row.domain}:${action}`
const isActionBusy = (row, action) => !!actionBusy.value[actionKey(row, action)]

const runAction = async (row, action) => {
    if (!row.id || isActionBusy(row, action)) return null
    const key = actionKey(row, action)
    actionBusy.value[key] = true
    try {
        const res = await api.fetch(`/admin/domains/${row.id}/${action}`, {
            method: 'POST',
            body: JSON.stringify({ config_version: row.config_version }),
        })
        if (res.success === false) {
            message.warning(res.message || t('failed'))
        } else {
            message.success(t('success'))
        }
        await refreshAfterMutation()
        return res
    } catch (error) {
        message.error(error.message || t('failed'))
        await fetchData()
        return null
    } finally {
        actionBusy.value[key] = false
    }
}

const checkCloudflare = async (row, showSuccess = true) => {
    if (!row.id || isActionBusy(row, 'cloudflare/check')) return null
    const key = actionKey(row, 'cloudflare/check')
    actionBusy.value[key] = true
    try {
        const res = await api.fetch(`/admin/domains/${row.id}/cloudflare/check`, { method: 'POST' })
        if (showSuccess) {
            message.success(res.setup_preview?.catch_all_conflict
                ? t('cloudflareConflictFound')
                : t('cloudflareCheckComplete'))
        }
        return res
    } catch (error) {
        message.error(error.message || t('failed'))
        return null
    } finally {
        actionBusy.value[key] = false
    }
}

const executeCloudflareSetup = async (row, confirmReplaceCatchAll) => {
    if (!row.id || isActionBusy(row, 'cloudflare/setup')) return
    const key = actionKey(row, 'cloudflare/setup')
    actionBusy.value[key] = true
    try {
        await api.fetch(`/admin/domains/${row.id}/cloudflare/setup`, {
            method: 'POST',
            body: JSON.stringify({
                config_version: row.config_version,
                confirm_replace_catch_all: confirmReplaceCatchAll,
            }),
        })
        message.success(t('success'))
        showCloudflareConfirm.value = false
        await refreshAfterMutation()
    } catch (error) {
        message.error(error.message || t('failed'))
        await fetchData()
    } finally {
        actionBusy.value[key] = false
    }
}

const prepareCloudflareSetup = async (row) => {
    const check = await checkCloudflare(row, false)
    if (!check) return
    if (!check.automatic_setup_supported) {
        message.warning(t('cloudflareSubdomainUnsupported'))
        return
    }
    if (check.setup_preview?.catch_all_conflict) {
        cloudflareTarget.value = row
        cloudflarePreview.value = check
        showCloudflareConfirm.value = true
        return
    }
    await executeCloudflareSetup(row, false)
}

const prepareDisable = async (row) => {
    if (!row.id || isActionBusy(row, 'impact')) return
    const key = actionKey(row, 'impact')
    actionBusy.value[key] = true
    try {
        disableImpact.value = await api.fetch(`/admin/domains/${row.id}/impact`)
        disableTarget.value = row
        showDisableConfirm.value = true
    } catch (error) {
        message.error(error.message || t('failed'))
    } finally {
        actionBusy.value[key] = false
    }
}

const confirmDisable = async () => {
    const row = disableTarget.value
    if (!row || isActionBusy(row, 'disable')) return
    const key = actionKey(row, 'disable')
    actionBusy.value[key] = true
    try {
        await api.fetch(`/admin/domains/${row.id}`, {
            method: 'DELETE',
            body: JSON.stringify({
                confirm: true,
                config_version: row.config_version,
            }),
        })
        message.success(t('success'))
        showDisableConfirm.value = false
        await refreshAfterMutation()
    } catch (error) {
        message.error(error.message || t('failed'))
    } finally {
        actionBusy.value[key] = false
    }
}

const copyText = async (value) => {
    if (!value) return
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value)
        } else {
            const input = document.createElement('textarea')
            input.value = value
            input.style.position = 'fixed'
            input.style.opacity = '0'
            document.body.appendChild(input)
            input.select()
            document.execCommand('copy')
            input.remove()
        }
        message.success(t('copySuccess'))
    } catch (error) {
        message.error(error?.message || t('copyFailed'))
    }
}

const statusType = (status) => {
    if (status === 'active') return 'success'
    if (status === 'error') return 'error'
    if (status === 'disabled') return 'default'
    return 'warning'
}

const dbActionDisabled = (row) => !canRunManagedDomainAction(row)

const columns = computed(() => [
    {
        title: t('domain'),
        key: 'domain',
        minWidth: 190,
        render: (row) => h(NSpace, { vertical: true, size: 2 }, {
            default: () => [
                h(NText, { strong: true }, { default: () => row.domain }),
                row.display_label
                    ? h(NText, { depth: 3, style: 'font-size: 12px' }, { default: () => row.display_label })
                    : null,
                h(NSpace, { size: 4 }, {
                    default: () => [
                        h(NTag, {
                            size: 'small',
                            bordered: false,
                            type: row.source === 'db' ? 'info' : 'default',
                        }, { default: () => row.source }),
                        row.source !== 'db'
                            ? h(NTag, { size: 'small', bordered: false, type: 'warning' }, {
                                default: () => t('importBeforeActions'),
                            })
                            : null,
                    ],
                }),
            ],
        }),
    },
    { title: t('receiveMode'), key: 'receive_mode', minWidth: 160 },
    {
        title: t('setupStatus'),
        key: 'setup_status',
        render: (row) => h(NTag, {
            bordered: false,
            type: statusType(row.setup_status),
        }, { default: () => row.setup_status }),
    },
    {
        title: t('enabled'),
        key: 'enabled',
        render: (row) => h(NSwitch, { value: !!row.enabled, disabled: true }),
    },
    {
        title: t('allowAddressCreation'),
        key: 'allow_address_creation',
        render: (row) => h(NSwitch, { value: !!row.allow_address_creation, disabled: true }),
    },
    {
        title: t('isDefault'),
        key: 'is_default',
        render: (row) => h(NSwitch, { value: !!row.is_default, disabled: true }),
    },
    { title: t('collectorAddress'), key: 'collector_address', minWidth: 220 },
    {
        title: t('verificationAddress'),
        key: 'verification_address',
        minWidth: 260,
        render: (row) => row.verification_address
            ? h(NSpace, { size: 4, align: 'center' }, {
                default: () => [
                    h(NText, null, { default: () => row.verification_address }),
                    h(NButton, {
                        size: 'tiny',
                        tertiary: true,
                        onClick: () => copyText(row.verification_address),
                    }, { default: () => t('copy') }),
                ],
            })
            : '-',
    },
    { title: t('lastVerifiedAt'), key: 'last_verified_at', minWidth: 170 },
    {
        title: t('operations'),
        key: 'actions',
        fixed: 'right',
        width: 330,
        render: (row) => h(NSpace, { size: 6, wrap: true }, {
            default: () => [
                h(NButton, {
                    size: 'small',
                    tertiary: true,
                    onClick: () => openEdit(row),
                    disabled: dbActionDisabled(row),
                }, { default: () => t('editDomain') }),
                h(NButton, {
                    size: 'small',
                    tertiary: true,
                    loading: isActionBusy(row, 'verify/start'),
                    disabled: dbActionDisabled(row) || !row.enabled || isActionBusy(row, 'verify/start'),
                    onClick: () => runAction(row, 'verify/start'),
                }, { default: () => t('verify') }),
                h(NButton, {
                    size: 'small',
                    tertiary: true,
                    loading: isActionBusy(row, 'verify/check'),
                    disabled: dbActionDisabled(row) || !row.verification_address || isActionBusy(row, 'verify/check'),
                    onClick: () => runAction(row, 'verify/check'),
                }, { default: () => t('checkVerification') }),
                h(NButton, {
                    size: 'small',
                    tertiary: true,
                    loading: isActionBusy(row, 'cloudflare/check'),
                    disabled: dbActionDisabled(row)
                        || row.receive_mode !== 'cloudflare_email'
                        || !cloudflareAutomation.value.has_token,
                    onClick: () => checkCloudflare(row),
                }, { default: () => t('cloudflareCheck') }),
                h(NButton, {
                    size: 'small',
                    tertiary: true,
                    type: 'primary',
                    loading: isActionBusy(row, 'cloudflare/setup'),
                    disabled: dbActionDisabled(row)
                        || row.receive_mode !== 'cloudflare_email'
                        || !cloudflareAutomation.value.has_token,
                    onClick: () => prepareCloudflareSetup(row),
                }, { default: () => t('cloudflareSetup') }),
                h(NButton, {
                    size: 'small',
                    tertiary: true,
                    type: 'warning',
                    loading: isActionBusy(row, 'impact'),
                    disabled: dbActionDisabled(row) || !row.enabled,
                    onClick: () => prepareDisable(row),
                }, { default: () => t('disable') }),
            ],
        }),
    },
])

onMounted(fetchData)
</script>

<template>
    <div class="domains-page">
        <n-space vertical size="large">
            <n-alert v-if="!cloudflareAutomation.has_token" type="warning" :bordered="false" :show-icon="false">
                {{ t('missingCloudflareToken') }}
            </n-alert>

            <n-card :bordered="false" embedded>
                <div class="toolbar">
                    <n-space wrap>
                        <n-button type="primary" :disabled="loading" @click="openCreate">
                            {{ t('addDomain') }}
                        </n-button>
                        <n-button tertiary :loading="importing" :disabled="loading || importing" @click="importEnv">
                            {{ t('importEnv') }}
                        </n-button>
                    </n-space>
                    <n-button tertiary :loading="loading" @click="fetchData">{{ t('refresh') }}</n-button>
                </div>
            </n-card>

            <n-alert v-if="loadError" type="error" :show-icon="false">
                <n-space justify="space-between" align="center">
                    <span>{{ loadError }}</span>
                    <n-button size="small" tertiary @click="fetchData">{{ t('retry') }}</n-button>
                </n-space>
            </n-alert>

            <n-spin :show="loading">
                <n-empty v-if="!loading && !loadError && domains.length === 0" :description="t('emptyDomains')">
                    <template #extra>
                        <n-button type="primary" @click="openCreate">{{ t('addDomain') }}</n-button>
                    </template>
                </n-empty>
                <n-data-table v-else :columns="columns" :data="domains" :bordered="false" size="small"
                    :scroll-x="1720" />
            </n-spin>

            <n-card v-for="row in domains.filter((item) => item.receive_mode === 'improvmx_forward')"
                :key="row.domain" :bordered="false" embedded>
                <n-space vertical>
                    <n-text strong>{{ row.domain }} · {{ t('improvmxInstructions') }}</n-text>
                    <div class="copy-row">
                        <n-text>{{ t('collectorAddress') }}: {{ row.collector_address || '-' }}</n-text>
                        <n-button size="tiny" tertiary :disabled="!row.collector_address"
                            @click="copyText(row.collector_address)">
                            {{ t('copy') }}
                        </n-button>
                    </div>
                    <div class="copy-row">
                        <n-text>{{ t('verificationAddress') }}: {{ row.verification_address || t('notStarted') }}</n-text>
                        <n-button size="tiny" tertiary :disabled="!row.verification_address"
                            @click="copyText(row.verification_address)">
                            {{ t('copy') }}
                        </n-button>
                    </div>
                    <n-text v-if="row.verification_expires_at" depth="3">
                        {{ t('verificationExpiresAt') }}: {{ row.verification_expires_at }}
                    </n-text>
                    <n-alert v-if="row.last_error" type="error" :show-icon="false">
                        {{ row.last_error }}
                    </n-alert>
                    <ol class="instructions">
                        <li>{{ t('improvmxStepOpen') }}</li>
                        <li>{{ t('improvmxStepForward') }} {{ row.collector_address || '-' }}</li>
                        <li>{{ t('improvmxStepVerify') }}</li>
                    </ol>
                </n-space>
            </n-card>
        </n-space>

        <n-modal v-model:show="showEditor" preset="card" :title="editingId ? t('editDomain') : t('addDomain')"
            class="domain-modal">
            <n-form label-placement="top">
                <n-grid cols="1 s:2" responsive="screen" :x-gap="12">
                    <n-form-item-gi :label="t('domain')">
                        <n-input v-model:value="model.domain" :disabled="!!editingId" />
                    </n-form-item-gi>
                    <n-form-item-gi :label="t('displayLabel')">
                        <n-input v-model:value="model.display_label" />
                    </n-form-item-gi>
                    <n-form-item-gi :label="t('receiveMode')">
                        <n-select v-model:value="model.receive_mode" :options="receiveModeOptions" />
                    </n-form-item-gi>
                    <n-form-item-gi :label="t('setupStatus')">
                        <n-tag :type="statusType(model.setup_status)" :bordered="false">
                            {{ model.setup_status }}
                        </n-tag>
                    </n-form-item-gi>
                    <n-form-item-gi :label="t('collectorAddress')">
                        <n-input v-model:value="model.collector_address" />
                    </n-form-item-gi>
                    <n-form-item-gi :label="t('cloudflareZoneId')">
                        <n-input v-model:value="model.cloudflare_zone_id" />
                    </n-form-item-gi>
                    <n-form-item-gi :label="t('subdomainMatch')">
                        <n-select v-model:value="model.allow_subdomain_match" :options="subdomainMatchOptions" />
                    </n-form-item-gi>
                </n-grid>
                <n-space wrap>
                    <n-checkbox v-model:checked="model.enabled">{{ t('enabled') }}</n-checkbox>
                    <n-checkbox v-model:checked="model.allow_address_creation"
                        :disabled="model.setup_status !== 'active'">
                        {{ t('allowAddressCreation') }}
                    </n-checkbox>
                    <n-checkbox v-model:checked="model.is_default" :disabled="!model.allow_address_creation">
                        {{ t('isDefault') }}
                    </n-checkbox>
                    <n-checkbox v-model:checked="model.allow_random_subdomain">
                        {{ t('allowRandomSubdomain') }}
                    </n-checkbox>
                </n-space>
                <n-alert v-if="model.setup_status !== 'active'" type="info" :show-icon="false"
                    style="margin: 12px 0;">
                    {{ t('verifyBeforeCreation') }}
                </n-alert>
                <n-form-item :label="t('notes')">
                    <n-input v-model:value="model.notes" type="textarea" />
                </n-form-item>
            </n-form>
            <template #footer>
                <n-space justify="end">
                    <n-button :disabled="saving" @click="showEditor = false">{{ t('cancel') }}</n-button>
                    <n-button type="primary" :loading="saving" :disabled="saving" @click="saveDomain">
                        {{ t('save') }}
                    </n-button>
                </n-space>
            </template>
        </n-modal>

        <n-modal v-model:show="showDisableConfirm" preset="dialog" :title="t('disableConfirmTitle')">
            <p>{{ t('disableConfirmText') }}</p>
            <p v-if="disableImpact">
                {{ t('addressCount') }}: {{ disableImpact.address_count || 0 }} ·
                {{ t('mailCount') }}: {{ disableImpact.mail_count || 0 }}
            </p>
            <n-alert v-if="disableImpact?.will_preserve_existing_address_receive" type="info" :show-icon="false">
                {{ t('existingReceivePreserved') }}
            </n-alert>
            <template #action>
                <n-button @click="showDisableConfirm = false">{{ t('cancel') }}</n-button>
                <n-button type="warning" :loading="disableTarget && isActionBusy(disableTarget, 'disable')"
                    @click="confirmDisable">
                    {{ t('disable') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showCloudflareConfirm" preset="dialog" :title="t('replaceCatchAllTitle')">
            <p>{{ t('replaceCatchAllText') }}</p>
            <n-code v-if="cloudflarePreview?.catch_all"
                :code="JSON.stringify(cloudflarePreview.catch_all, null, 2)" language="json" word-wrap />
            <template #action>
                <n-button @click="showCloudflareConfirm = false">{{ t('cancel') }}</n-button>
                <n-button type="warning"
                    :loading="cloudflareTarget && isActionBusy(cloudflareTarget, 'cloudflare/setup')"
                    @click="executeCloudflareSetup(cloudflareTarget, true)">
                    {{ t('replaceAndContinue') }}
                </n-button>
            </template>
        </n-modal>
    </div>
</template>

<style scoped>
.domains-page {
    max-width: 1180px;
    margin: 0 auto;
}

.toolbar,
.copy-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.domain-modal {
    width: min(760px, calc(100vw - 32px));
}

.instructions {
    margin: 0;
    padding-left: 20px;
}

@media (max-width: 640px) {
    .toolbar,
    .copy-row {
        align-items: flex-start;
        flex-direction: column;
    }
}
</style>
