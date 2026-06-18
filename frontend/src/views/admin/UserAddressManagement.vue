<script setup>
import { ref, h, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { NButton, NPopconfirm, NTag } from 'naive-ui'

import { api } from '../../api'

const props = defineProps({
    user_id: {
        type: Number,
        required: true
    },
    user_email: {
        type: String,
        default: ''
    }
});
const emit = defineEmits(['changed'])

const message = useMessage()

const { locale, t } = useScopedI18n('views.admin.UserAddressManagement')

const data = ref([])
const bindAddressName = ref('')

const fetchData = async () => {
    try {
        const { results } = await api.fetch(
            `/admin/users/bind_address/${props.user_id}`,
        );
        data.value = results;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const bindAddress = async () => {
    const address = bindAddressName.value.trim();
    if (!address) {
        message.error(t('pleaseInputAddress'));
        return;
    }
    try {
        await api.fetch(`/admin/users/bind_address`, {
            method: 'POST',
            body: JSON.stringify({
                user_id: props.user_id,
                address,
            })
        });
        bindAddressName.value = '';
        message.success(t('bindSuccess'));
        await fetchData();
        emit('changed');
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const unbindAddress = async (addressId) => {
    try {
        await api.fetch(`/admin/users/bind_address`, {
            method: 'DELETE',
            body: JSON.stringify({
                user_id: props.user_id,
                address_id: addressId,
            })
        });
        message.success(t('unbindSuccess'));
        await fetchData();
        emit('changed');
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const columns = [
    {
        title: t('name'),
        key: "name",
        minWidth: 260,
        ellipsis: {
            tooltip: true
        }
    },
    {
        title: t('mail_count'),
        key: "mail_count",
        width: 110,
        render(row) {
            return h(NTag, {
                size: 'small',
                bordered: false,
                type: row.mail_count > 0 ? 'success' : 'default'
            }, { default: () => String(row.mail_count || 0) })
        }
    },
    {
        title: t('send_count'),
        key: "send_count",
        width: 110,
        render(row) {
            return h(NTag, {
                size: 'small',
                bordered: false,
                type: row.send_count > 0 ? 'success' : 'default'
            }, { default: () => String(row.send_count || 0) })
        }
    },
    {
        title: t('actions'),
        key: "actions",
        width: 100,
        render(row) {
            return h(NPopconfirm, {
                onPositiveClick: () => unbindAddress(row.id)
            }, {
                trigger: () => h(NButton, {
                    text: true,
                    type: "error"
                }, { default: () => t('unbind') }),
                default: () => t('unbindTip')
            })
        }
    }
]

onMounted(async () => {
    await fetchData()
})
</script>

<template>
    <div>
        <n-alert v-if="props.user_email" type="info" :bordered="false" style="margin-bottom: 12px;">
            {{ props.user_email }}
        </n-alert>
        <n-input-group style="margin-bottom: 12px;">
            <n-input v-model:value="bindAddressName" clearable :placeholder="t('bindAddressPlaceholder')"
                @keydown.enter="bindAddress" />
            <n-button type="primary" tertiary @click="bindAddress">
                {{ t('bind') }}
            </n-button>
        </n-input-group>
        <div class="address-table-scroll">
            <n-data-table :columns="columns" :data="data" :bordered="false" embedded />
        </div>
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
</style>
