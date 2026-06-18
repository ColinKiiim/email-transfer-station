<script setup>
import { ref, h, onMounted, watch, computed } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { NButton, NDropdown, NIcon, NTag, NTooltip, useMessage } from 'naive-ui';
import { EditOutlined, MenuFilled } from '@vicons/material'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { hashPassword } from '../../utils';

import UserAddressManagement from './UserAddressManagement.vue'

const { loading, openSettings } = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.UserManagement')
const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

const userQuery = ref('')
const showResetPassword = ref(false)
const newResetPassword = ref('')
const showDeleteUser = ref(false)
const curUserId = ref(0)
const showCreateUser = ref(false)
const user = ref({
    email: "",
    username: "",
    display_name: "",
    password: ""
})
const showChangeRole = ref(false)
const showUserAddressManagement = ref(false)
const curUserEmail = ref('')
const userRoles = ref([])
const curUserRole = ref('')
const userRolesOptions = computed(() => {
    return userRoles.value.map(role => {
        return {
            label: role.role,
            value: role.role
        }
    });
})

const fetchUserRoles = async () => {
    try {
        const results = await api.fetch(`/admin/user_roles`);
        userRoles.value = results;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const fetchData = async () => {
    try {
        userQuery.value = userQuery.value.trim()
        const { results, count: userCount } = await api.fetch(
            `/admin/users`
            + `?limit=${pageSize.value}`
            + `&offset=${(page.value - 1) * pageSize.value}`
            + (userQuery.value ? `&query=${userQuery.value}` : '')
        );
        data.value = results;
        if (userCount > 0) {
            count.value = userCount;
        }
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const resetPassword = async () => {
    if (!newResetPassword.value) {
        message.error(t('pleaseInput'));
        return;
    }
    try {
        await api.fetch(`/admin/users/${curUserId.value}/reset_password`, {
            method: "POST",
            body: JSON.stringify({
                password: await hashPassword(newResetPassword.value)
            })
        });
        message.success(t('success'));
        showResetPassword.value = false;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const createUser = async () => {
    if (!user.value.email || !user.value.password) {
        message.error(t('pleaseInput'));
        return;
    }
    try {
        await api.fetch(`/admin/users`, {
            method: "POST",
            body: JSON.stringify({
                email: user.value.email,
                username: user.value.username,
                display_name: user.value.display_name,
                password: await hashPassword(user.value.password)
            })
        });
        message.success(t('success'));
        await fetchData();
        user.value.email = '';
        user.value.username = '';
        user.value.display_name = '';
        user.value.password = '';
        showCreateUser.value = false;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const deleteUser = async () => {
    try {
        await api.fetch(`/admin/users/${curUserId.value}`, {
            method: "DELETE"
        });
        message.success(t('success'));
        showDeleteUser.value = false;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const changeRole = async () => {
    try {
        await api.fetch(`/admin/user_roles`, {
            method: "POST",
            body: JSON.stringify({
                user_id: curUserId.value,
                role_text: curUserRole.value
            })
        });
        message.success(t('success'));
        showChangeRole.value = false;
        await fetchData();
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const openUserAddressManagement = (row) => {
    curUserId.value = row.id;
    curUserEmail.value = row.user_email;
    showUserAddressManagement.value = true;
}

const buildUserActionOptions = () => [
    { label: t('userAddressManagement'), key: 'addresses' },
    { label: t('changeRole'), key: 'role' },
    { label: t('resetPassword'), key: 'resetPassword' },
    { type: 'divider', key: 'divider' },
    { label: t('delete'), key: 'delete' },
]

const handleUserActionSelect = (key, row) => {
    if (key === 'addresses') {
        openUserAddressManagement(row)
        return
    }
    if (key === 'role') {
        curUserId.value = row.id;
        curUserRole.value = row.role_text;
        showChangeRole.value = true;
        return
    }
    if (key === 'resetPassword') {
        curUserId.value = row.id;
        newResetPassword.value = '';
        showResetPassword.value = true;
        return
    }
    if (key === 'delete') {
        curUserId.value = row.id;
        user.value.email = '';
        user.value.username = '';
        user.value.display_name = '';
        user.value.password = '';
        showDeleteUser.value = true;
    }
}

const renderUserActionMenuButton = (row) => h('div', { class: 'action-menu-cell' }, [
    h(NDropdown, {
        trigger: 'click',
        placement: 'bottom-end',
        options: buildUserActionOptions(),
        onSelect: (key) => handleUserActionSelect(key, row),
    }, {
        default: () => h(NButton, {
            quaternary: true,
            circle: true,
            size: 'small',
            class: 'action-menu-trigger',
            'aria-label': t('actions'),
        }, {
            icon: () => h(NIcon, null, { default: () => h(MenuFilled) })
        })
    })
])

const columns = [
    {
        title: "ID",
        key: "id",
        width: 72,
        align: "center"
    },
    {
        title: t('user_email'),
        key: "user_email",
        minWidth: 260,
        ellipsis: {
            tooltip: true
        }
    },
    {
        title: t('user_identity'),
        key: "user_identity",
        minWidth: 180,
        render(row) {
            const primary = row.display_name || row.username || '-';
            const secondary = row.username && row.display_name ? `@${row.username}` : '';
            return h('div', { class: 'user-identity-cell' }, [
                h('div', { class: 'user-identity-primary' }, primary),
                secondary ? h('div', { class: 'user-identity-secondary' }, secondary) : null
            ])
        }
    },
    {
        title: t('role'),
        key: "role_text",
        width: 120,
        render(row) {
            if (!row.role_text) return null;
            return h(NTag, {
                bordered: false,
                type: "info"
            }, {
                default: () => row.role_text
            })
        }
    },
    {
        title: t('address_count'),
        key: "address_count",
        width: 150,
        render(row) {
            return h('div', { class: 'address-count-cell' }, [
                h(NTag, {
                    size: 'small',
                    bordered: false,
                    type: row.address_count > 0 ? 'success' : 'default'
                }, { default: () => String(row.address_count || 0) }),
                h(NTooltip, { trigger: 'hover' }, {
                    trigger: () => h(NButton, {
                        text: true,
                        size: 'tiny',
                        class: 'address-edit-button',
                        'aria-label': t('userAddressManagement'),
                        onClick: () => openUserAddressManagement(row)
                    }, {
                        icon: () => h(NIcon, null, { default: () => h(EditOutlined) })
                    }),
                    default: () => t('userAddressManagement')
                })
            ])
        }
    },
    {
        title: t('created_at'),
        key: "created_at",
        width: 180
    },
    {
        title: t('actions'),
        key: 'actions',
        width: 100,
        render(row) {
            return renderUserActionMenuButton(row)
        }
    }
]

const getRolePrefix = (role) => {
    const res = userRoles.value.find(r => r.role === role)?.prefix;
    if (res === undefined || res === null) return openSettings.value.prefix;
    return res;
}

const getRoleDomains = (role) => {
    const res = userRoles.value.find(r => r.role === role)?.domains;
    if (res === undefined || res === null || res.length == 0) return openSettings.value.defaultDomains;
    return res;
}

const roleDonotExist = computed(() => {
    return curUserRole.value && !userRoles.value.some(r => r.role === curUserRole.value);
})

watch([page, pageSize], async () => {
    await fetchData()
})

onMounted(async () => {
    await fetchUserRoles();
    await fetchData();
})
</script>

<template>
    <div style="margin-top: 10px;">
        <n-modal v-model:show="showCreateUser" preset="dialog" :title="t('createUser')">
            <n-form>
                <n-form-item-row :label="t('email')" required>
                    <n-input v-model:value="user.email" />
                </n-form-item-row>
                <n-form-item-row :label="t('username')">
                    <n-input v-model:value="user.username" />
                </n-form-item-row>
                <n-form-item-row :label="t('display_name')">
                    <n-input v-model:value="user.display_name" />
                </n-form-item-row>
                <n-form-item-row :label="t('password')" required>
                    <n-input v-model:value="user.password" type="password" show-password-on="click"
                        @keyup.enter="createUser" />
                </n-form-item-row>
            </n-form>
            <template #action>
                <n-button :loading="loading" @click="createUser" size="small" tertiary type="primary">
                    {{ t('createUser') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showResetPassword" preset="dialog" :title="t('resetPassword')">
            <n-form-item-row :label="t('password')" required>
                <n-input v-model:value="newResetPassword" type="password" show-password-on="click"
                    @keyup.enter="resetPassword" />
            </n-form-item-row>
            <template #action>
                <n-button :loading="loading" @click="resetPassword" size="small" tertiary type="primary">
                    {{ t('resetPassword') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showDeleteUser" preset="dialog" :title="t('deleteUser')">
            <p>{{ t('deleteUserTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="deleteUser" size="small" tertiary type="error">
                    {{ t('deleteUser') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showChangeRole" preset="dialog" :title="t('changeRole')">
            <n-alert type="error" :bordered="false" v-if="roleDonotExist">
                <span>{{ t('roleDonotExist') }}</span>
            </n-alert>
            <p>{{ t('prefix') + ": " + getRolePrefix(curUserRole) }}</p>
            <p>{{ t('domains') + ": " + JSON.stringify(getRoleDomains(curUserRole)) }}</p>
            <n-select clearable v-model:value="curUserRole" :options="userRolesOptions" />
            <template #action>
                <n-button :loading="loading" @click="changeRole" size="small" tertiary type="primary">
                    {{ t('changeRole') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showUserAddressManagement" preset="card" :title="t('userAddressManagement')"
            style="width: 720px;">
            <UserAddressManagement :user_id="curUserId" :user_email="curUserEmail" @changed="fetchData" />
        </n-modal>
        <n-input-group>
            <n-input v-model:value="userQuery" @keydown.enter="fetchData" />
            <n-button @click="fetchData" type="primary" tertiary>
                {{ t('query') }}
            </n-button>
        </n-input-group>
        <div style="overflow: auto;">
            <div style="display: inline-block;">
                <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
                    :page-sizes="[20, 50, 100]" show-size-picker>
                    <template #prefix="{ itemCount }">
                        {{ t('itemCount') }}: {{ itemCount }}
                    </template>
                    <template #suffix>
                        <n-button @click="showCreateUser = true" size="small" tertiary type="primary"
                            style="margin-left: 10px">
                            {{ t('createUser') }}
                        </n-button>
                    </template>
                </n-pagination>
            </div>
            <n-data-table :columns="columns" :data="data" :bordered="false" embedded />
        </div>
    </div>
</template>

<style scoped>
.n-pagination {
    margin-top: 10px;
    margin-bottom: 10px;
}

.n-data-table {
    min-width: 920px;
}

.address-count-cell {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.address-edit-button {
    color: var(--n-text-color-3);
    cursor: pointer;
}

.action-menu-cell {
    display: flex;
    align-items: center;
    justify-content: center;
}

.action-menu-trigger {
    color: var(--n-text-color-2);
    cursor: pointer;
}

.user-identity-cell {
    min-width: 0;
}

.user-identity-primary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.user-identity-secondary {
    color: var(--n-text-color-3);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
