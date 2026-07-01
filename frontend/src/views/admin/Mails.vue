<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { Copy } from '@vicons/fa'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { normalizeFilterValue } from '../../utils/domain-ui'
import MailBox from '../../components/MailBox.vue';

const { adminMailTabAddress } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.Mails')

const mailBoxKey = ref("")
const selectedDomain = ref("")
const addressPrefix = ref("")
const domains = ref([])
const addresses = ref([])

const formatAddressCount = (count) => `${Number(count || 0)} ${t('addressUnit')}`
const formatMessageCount = (count) => `${Number(count || 0)} ${t('messageUnit')}`

const domainOptions = computed(() => domains.value.map((item) => ({
    label: `${item.domain} (${formatAddressCount(item.address_count)}, ${formatMessageCount(item.mail_count)})`,
    value: item.domain
})))

const addressOptions = computed(() => addresses.value.map((item) => ({
    label: `${item.address} (${formatMessageCount(item.mail_count)})`,
    value: item.address
})))

const buildQuery = (params) => {
    return Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
        .join('&')
}

const fetchDomains = async () => {
    const { results } = await api.fetch('/api/admin/mail_domains')
    domains.value = results || []
}

const fetchAddresses = async () => {
    const query = buildQuery({ domain: selectedDomain.value })
    const { results } = await api.fetch(`/api/admin/mail_addresses${query ? `?${query}` : ''}`)
    addresses.value = results || []
}

const queryMail = () => {
    adminMailTabAddress.value = normalizeFilterValue(adminMailTabAddress.value);
    mailBoxKey.value = Date.now();
}

const copySelectedAddress = async () => {
    if (!adminMailTabAddress.value) return;
    try {
        await navigator.clipboard.writeText(adminMailTabAddress.value);
        message.success(t('copySuccess'));
    } catch (error) {
        message.error(error?.message || t('copyFailed'));
    }
}

const fetchMailData = async (limit, offset) => {
    const query = buildQuery({
        limit,
        offset,
        domain: selectedDomain.value,
        address: adminMailTabAddress.value,
        address_prefix: normalizeFilterValue(addressPrefix.value),
    })
    return await api.fetch(
        `/api/admin/mails?${query}`
    );
}

const deleteMail = async (curMailId) => {
    await api.fetch(`/api/admin/mails/${curMailId}`, { method: 'DELETE' });
};

const selectDomain = (domain) => {
    selectedDomain.value = selectedDomain.value === domain ? "" : domain
}

const selectAddress = (address) => {
    adminMailTabAddress.value = adminMailTabAddress.value === address ? "" : address
    queryMail()
}

const clearFilters = async () => {
    selectedDomain.value = ""
    adminMailTabAddress.value = ""
    addressPrefix.value = ""
    await fetchAddresses()
    queryMail()
}

watch(selectedDomain, async () => {
    adminMailTabAddress.value = ""
    await fetchAddresses()
    queryMail()
})

onMounted(async () => {
    await fetchDomains()
    await fetchAddresses()
})
</script>

<template>
    <div style="margin-top: 10px;">
        <div class="mail-admin-layout">
            <aside class="mail-admin-sidebar">
                <div class="sidebar-title">{{ t('domains') }}</div>
                <n-scrollbar style="max-height: 260px;">
                    <n-button v-for="domain in domains" :key="domain.domain" class="sidebar-button"
                        :type="selectedDomain === domain.domain ? 'primary' : 'default'" quaternary block
                        @click="selectDomain(domain.domain)">
                        <span class="sidebar-row">
                            <span class="sidebar-main">{{ domain.domain }}</span>
                            <span class="sidebar-metrics">
                                <span>{{ formatAddressCount(domain.address_count) }}</span>
                                <span>{{ formatMessageCount(domain.mail_count) }}</span>
                            </span>
                        </span>
                    </n-button>
                </n-scrollbar>
                <n-divider />
                <div class="sidebar-title">{{ t('addresses') }}</div>
                <n-scrollbar style="max-height: 360px;">
                    <n-button v-for="address in addresses" :key="address.address" class="sidebar-button"
                        :type="adminMailTabAddress === address.address ? 'primary' : 'default'" quaternary block
                        @click="selectAddress(address.address)">
                        <span class="sidebar-row">
                            <span class="sidebar-main">{{ address.display_label || address.local_part }}</span>
                            <span class="sidebar-meta">{{ formatMessageCount(address.mail_count) }}</span>
                        </span>
                        <span class="sidebar-sub">{{ address.address }}</span>
                    </n-button>
                </n-scrollbar>
            </aside>
            <main class="mail-admin-main">
                <n-space vertical>
                    <n-grid cols="1 s:2 l:4" :x-gap="8" :y-gap="8" responsive="screen">
                        <n-grid-item>
                            <n-select v-model:value="selectedDomain" :options="domainOptions"
                                :placeholder="t('domain')" clearable filterable />
                        </n-grid-item>
                        <n-grid-item>
                            <div class="address-filter-with-copy">
                                <n-select v-model:value="adminMailTabAddress" :options="addressOptions"
                                    :placeholder="t('addressQueryTip')" clearable filterable />
                                <n-tooltip trigger="hover">
                                    <template #trigger>
                                        <n-button class="copy-address-button" tertiary type="primary"
                                            :disabled="!adminMailTabAddress" :aria-label="t('copyAddress')"
                                            @click="copySelectedAddress">
                                            <template #icon>
                                                <n-icon :component="Copy" />
                                            </template>
                                        </n-button>
                                    </template>
                                    {{ t('copyAddress') }}
                                </n-tooltip>
                            </div>
                        </n-grid-item>
                        <n-grid-item>
                            <n-input v-model:value="addressPrefix" :placeholder="t('addressPrefix')"
                                @keydown.enter="queryMail" clearable />
                        </n-grid-item>
                        <n-grid-item>
                            <n-space>
                                <n-button @click="queryMail" type="primary" tertiary>
                                    {{ t('query') }}
                                </n-button>
                                <n-button @click="clearFilters" tertiary>
                                    {{ t('clear') }}
                                </n-button>
                            </n-space>
                        </n-grid-item>
                    </n-grid>
                </n-space>
                <div style="margin-top: 10px;"></div>
                <MailBox :key="mailBoxKey" :enableUserDeleteEmail="true" :fetchMailData="fetchMailData"
                    :deleteMail="deleteMail" :showFilterInput="true" />
            </main>
        </div>
    </div>
</template>

<style scoped>
.mail-admin-layout {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
}

.mail-admin-sidebar {
    min-width: 0;
    border-right: 1px solid var(--n-border-color);
    padding-right: 12px;
}

.mail-admin-main {
    min-width: 0;
}

.sidebar-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--n-text-color-2);
}

.sidebar-button {
    height: auto;
    margin-bottom: 4px;
    padding: 7px 8px;
    justify-content: flex-start;
    cursor: pointer;
}

.address-filter-with-copy {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
}

.copy-address-button:not(.n-button--disabled) {
    cursor: pointer;
}

.sidebar-row {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

@media (max-width: 760px) {
    .mail-admin-layout {
        grid-template-columns: 1fr;
    }

    .mail-admin-sidebar {
        border-right: 0;
        border-bottom: 1px solid var(--n-border-color);
        padding-right: 0;
        padding-bottom: 12px;
    }
}

.sidebar-main {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sidebar-meta,
.sidebar-sub {
    color: var(--n-text-color-3);
    font-size: 12px;
}

.sidebar-metrics {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
    color: var(--n-text-color-3);
    font-size: 12px;
}

.sidebar-metrics span {
    border-radius: 4px;
    padding: 1px 5px;
    background: var(--n-color-embedded);
    white-space: nowrap;
}

.sidebar-sub {
    display: block;
    width: 100%;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width: 900px) {
    .mail-admin-layout {
        grid-template-columns: 1fr;
    }

    .mail-admin-sidebar {
        border-right: 0;
        border-bottom: 1px solid var(--n-border-color);
        padding-right: 0;
        padding-bottom: 10px;
    }
}
</style>
