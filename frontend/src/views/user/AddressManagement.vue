<script setup>
import { ref, h, onMounted, computed, watch } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router';
import { NBadge, NPopconfirm, NButton } from 'naive-ui'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { getRouterPathWithLang } from '../../utils'

import Login from '../common/Login.vue';

const { jwt, userSettings, loading } = useGlobalState()
const message = useMessage()
const router = useRouter()

const { locale, t } = useScopedI18n('views.user.AddressManagement')

const data = ref([])
const showTranferAddress = ref(false)
const currentAddress = ref("")
const currentAddressId = ref(0)
const targetUserEmail = ref('')

const canManageAssignedAddress = computed(() =>
    userSettings.value.is_admin
    || userSettings.value.can_manage_assigned_address === true
)
const canTransferAddress = computed(() =>
    canManageAssignedAddress.value
    && userSettings.value.can_transfer_address === true
)
const canUnbindAddress = computed(() =>
    canManageAssignedAddress.value
    && userSettings.value.can_unbind_address === true
)
const canCreateOrBindAddress = computed(() =>
    userSettings.value.is_admin
    || userSettings.value.can_bind_address === true
    || userSettings.value.can_create_address === true
)

const changeMailAddress = async (address_id) => {
    try {
        const res = await api.fetch(`/user_api/bind_address_jwt/${address_id}`);
        message.success(t('changeMailAddress') + " " + t('success'));
        if (!res.jwt) {
            message.error("jwt not found");
            return;
        }
        jwt.value = res.jwt;
        await router.push(getRouterPathWithLang("/", locale.value))
        location.reload();
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const unbindAddress = async (address_id) => {
    try {
        const res = await api.fetch(`/user_api/unbind_address`, {
            method: 'POST',
            body: JSON.stringify({ address_id })
        });
        message.success(t('unbindAddress') + " " + t('success'));
        await fetchData();
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const transferAddress = async () => {
    if (!targetUserEmail.value) {
        message.error("targetUserEmail is required");
        return;
    }
    if (!currentAddressId.value) {
        message.error("currentAddressId is required");
        return;
    }
    try {
        const res = await api.fetch(`/user_api/transfer_address`, {
            method: 'POST',
            body: JSON.stringify({
                address_id: currentAddressId.value,
                target_user_email: targetUserEmail.value
            })
        });
        message.success(t('transferAddress') + " " + t('success'));
        await fetchData();
        showTranferAddress.value = false;
        currentAddressId.value = 0;
        currentAddress.value = "";
        targetUserEmail.value = "";
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const fetchData = async () => {
    try {
        const { results } = await api.fetch(
            `/user_api/bind_address`
        );
        data.value = results;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const columns = computed(() => [
    {
        title: t('name'),
        key: "name"
    },
    {
        title: t('mail_count'),
        key: "mail_count",
        render(row) {
            return h(NBadge, {
                value: row.mail_count,
                'show-zero': true,
                max: 99,
                type: "success"
            })
        }
    },
    {
        title: t('send_count'),
        key: "send_count",
        render(row) {
            return h(NBadge, {
                value: row.send_count,
                'show-zero': true,
                max: 99,
                type: "success"
            })
        }
    },
    {
        title: t('actions'),
        key: 'actions',
        render(row) {
            const actions = [
                h(NPopconfirm,
                    {
                        onPositiveClick: () => changeMailAddress(row.id)
                    },
                    {
                        trigger: () => h(NButton,
                            {
                                tertiary: true,
                                type: "primary",
                            },
                            { default: () => t('changeMailAddress') }
                        ),
                        default: () => `${t('changeMailAddress')}?`
                    }
                ),
            ];
            if (canTransferAddress.value) {
                actions.push(
                    h(NButton,
                        {
                            tertiary: true,
                            type: "primary",
                            onClick: () => {
                                currentAddressId.value = row.id;
                                currentAddress.value = row.name;
                                showTranferAddress.value = true;
                            }
                        },
                        { default: () => t('transferAddress') }
                    )
                );
            }
            if (canUnbindAddress.value) {
                actions.push(
                    h(NPopconfirm,
                        {
                            onPositiveClick: () => unbindAddress(row.id)
                        },
                        {
                            trigger: () => h(NButton,
                                {
                                    tertiary: true,
                                    type: "error",
                                },
                                { default: () => t('unbindAddress') }
                            ),
                            default: () => t('unbindAddressTip')
                        }
                    )
                );
            }
            return h('div', { class: 'user-action-cell' }, actions)
        }
    }
])

watch(canCreateOrBindAddress, (allowed) => {
    if (!allowed && showTranferAddress.value) {
        showTranferAddress.value = false;
    }
})

onMounted(async () => {
    await fetchData()
})
</script>

<template>
    <div>
        <n-modal v-model:show="showTranferAddress" preset="dialog" :title="t('transferAddress')">
            <span>
                <p>{{ t("transferAddressTip") }}</p>
                <p>{{ t('transferAddress') + ": " + currentAddress }}</p>
                <n-input v-model:value="targetUserEmail" :placeholder="t('targetUserEmail')" />
            </span>
            <template #action>
                <n-button :loading="loading" @click="transferAddress" size="small" tertiary type="error">
                    {{ t('transferAddress') }}
                </n-button>
            </template>
        </n-modal>
        <n-alert class="portal-tip" type="info" :show-icon="false" :bordered="false">
            {{ canCreateOrBindAddress ? t('portalTipWithCreate') : t('portalTipAssignedOnly') }}
        </n-alert>
        <n-tabs type="segment">
            <n-tab-pane name="address" :tab="t('assignedAddress')">
                <div class="address-table-scroll">
                    <n-data-table :columns="columns" :data="data" :bordered="false" embedded />
                </div>
                <n-empty v-if="data.length === 0" class="empty-addresses" :description="t('emptyAssignedAddress')" />
            </n-tab-pane>
            <n-tab-pane v-if="canCreateOrBindAddress" name="create_or_bind" :tab="t('create_or_bind')">
                <Login />
            </n-tab-pane>
        </n-tabs>
    </div>
</template>

<style scoped>
.n-data-table {
    min-width: 640px;
}

.address-table-scroll {
    max-width: 100%;
    overflow-x: auto;
}

.portal-tip {
    margin-bottom: 12px;
}

.empty-addresses {
    margin: 36px 0 20px;
}

:deep(.user-action-cell) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}
</style>
