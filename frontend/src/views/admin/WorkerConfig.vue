<script setup>
import { computed, onMounted, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.admin.WorkerConfig')

const settings = ref({})
const showRawConfig = ref(false)

const diagnostics = computed(() => settings.value.DIAGNOSTICS || {})
const database = computed(() => diagnostics.value.database || {})
const warnings = computed(() => diagnostics.value.warnings || [])

const bindingRows = computed(() => Object.entries(diagnostics.value.bindings || {}).map(([key, value]) => ({
    key,
    label: key,
    enabled: !!value,
})))

const featureLabelMap = computed(() => ({
    user_create_email: t('featureUserCreateEmail'),
    anonymous_create_disabled: t('featureAnonymousCreateDisabled'),
    mail_verify: t('featureMailVerify'),
    webhook: t('featureWebhook'),
    address_webhook: t('featureAddressWebhook'),
    send_mail: t('featureSendMail'),
    s3_attachment: t('featureS3Attachment'),
    agent_email_info: t('featureAgentEmailInfo'),
    smtp_imap_proxy: t('featureSmtpImapProxy'),
    ai_extract: t('featureAiExtract'),
    status_url: t('featureStatusUrl'),
}))

const featureRows = computed(() => Object.entries(diagnostics.value.features || {}).map(([key, value]) => ({
    key,
    label: featureLabelMap.value[key] || key,
    enabled: !!value,
})))

const routingRows = computed(() => diagnostics.value.domains?.routing_status || [])
const registryRows = computed(() => diagnostics.value.domains?.registry || [])

const fetchData = async () => {
    try {
        const res = await api.fetch(`/api/admin/worker/configs`)
        Object.assign(settings.value, res)
    } catch (error) {
        message.error(error.message || "error");
    }
}

onMounted(async () => {
    await fetchData();
})
</script>

<template>
    <div class="center">
        <n-card :bordered="false" embedded class="worker-config-card">
            <n-space vertical size="large">
                <n-alert type="info" :show-icon="false" :bordered="false">
                    {{ t('diagnosticTip') }}
                </n-alert>

                <section class="diagnostic-section">
                    <div class="section-header">
                        <h3>{{ t('database') }}</h3>
                        <n-tag size="small" :type="database.ok ? 'success' : 'error'" :bordered="false">
                            {{ database.ok ? t('ok') : t('error') }}
                        </n-tag>
                    </div>
                    <div class="diagnostic-grid">
                        <div class="diagnostic-item">
                            <span>{{ t('currentDbVersion') }}</span>
                            <strong>{{ database.current_version || '-' }}</strong>
                        </div>
                        <div class="diagnostic-item">
                            <span>{{ t('codeDbVersion') }}</span>
                            <strong>{{ database.code_version || '-' }}</strong>
                        </div>
                        <div class="diagnostic-item">
                            <span>{{ t('dbMigration') }}</span>
                            <strong>{{ database.need_migration ? t('needed') : t('notNeeded') }}</strong>
                        </div>
                    </div>
                    <p v-if="database.error" class="diagnostic-error">{{ database.error }}</p>
                </section>

                <section class="diagnostic-section">
                    <div class="section-header">
                        <h3>{{ t('bindings') }}</h3>
                    </div>
                    <div class="status-chip-list">
                        <n-tag v-for="row in bindingRows" :key="row.key" size="small"
                            :type="row.enabled ? 'success' : 'warning'" :bordered="false">
                            {{ row.label }}: {{ row.enabled ? t('enabled') : t('missing') }}
                        </n-tag>
                    </div>
                </section>

                <section class="diagnostic-section">
                    <div class="section-header">
                        <h3>{{ t('features') }}</h3>
                    </div>
                    <div class="status-chip-list">
                        <n-tag v-for="row in featureRows" :key="row.key" size="small"
                            :type="row.enabled ? 'success' : 'default'" :bordered="false">
                            {{ row.label }}: {{ row.enabled ? t('enabled') : t('disabled') }}
                        </n-tag>
                    </div>
                </section>

                <section class="diagnostic-section">
                    <div class="section-header">
                        <h3>{{ t('domains') }}</h3>
                    </div>
                    <div class="status-chip-list">
                        <n-tag size="small" :bordered="false">
                            {{ t('activeCreationDomains') }}: {{ (diagnostics.domains?.active_creation_domains || []).join(', ') || '-' }}
                        </n-tag>
                        <n-tag size="small" :bordered="false">
                            {{ t('dynamicCollectors') }}: {{ (diagnostics.domains?.dynamic_collector_addresses || []).join(', ') || '-' }}
                        </n-tag>
                    </div>
                    <n-data-table :columns="[
                        { title: t('domain'), key: 'domain' },
                        { title: t('source'), key: 'source' },
                        { title: t('routeMode'), key: 'receive_mode' },
                        { title: t('setupStatus'), key: 'setup_status' },
                    ]" :data="registryRows" :bordered="false" size="small" />
                    <n-data-table :columns="[
                        { title: t('domain'), key: 'domain' },
                        { title: t('routeMode'), key: 'mode' },
                    ]" :data="routingRows" :bordered="false" size="small" />
                </section>

                <n-alert v-if="warnings.length > 0" type="warning" :show-icon="false" :bordered="false">
                    <ul class="warning-list">
                        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
                    </ul>
                </n-alert>

                <n-collapse>
                    <n-collapse-item name="raw" :title="t('rawConfig')">
                        <n-button size="small" tertiary @click="showRawConfig = !showRawConfig">
                            {{ showRawConfig ? t('hideRawConfig') : t('showRawConfig') }}
                        </n-button>
                        <pre v-if="showRawConfig" class="raw-config">{{ JSON.stringify(settings, null, 2) }}</pre>
                    </n-collapse-item>
                </n-collapse>
            </n-space>
        </n-card>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    text-align: left;
    place-items: center;
    justify-content: center;
}

.worker-config-card {
    width: min(1000px, 100%);
    overflow: auto;
}

.diagnostic-section {
    display: grid;
    gap: 12px;
}

.section-header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
}

.section-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.diagnostic-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
}

.diagnostic-item {
    display: grid;
    gap: 4px;
    border-radius: 6px;
    padding: 10px;
    background: var(--n-color-embedded);
}

.diagnostic-item span {
    color: var(--n-text-color-2);
    font-size: 12px;
}

.diagnostic-error {
    margin: 0;
    color: var(--n-color-error);
}

.status-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.warning-list {
    margin: 0;
    padding-left: 18px;
}

.raw-config {
    max-height: 420px;
    overflow: auto;
    margin: 12px 0 0;
}

@media (max-width: 720px) {
    .diagnostic-grid {
        grid-template-columns: 1fr;
    }
}
</style>
