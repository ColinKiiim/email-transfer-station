<script setup>
import { computed, watch } from 'vue';
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../store'

import AddressMangement from './user/AddressManagement.vue';
import UserSettingsPage from './user/UserSettings.vue';
import UserBar from './user/UserBar.vue';
import BindAddress from './user/BindAddress.vue';
import UserMailBox from './user/UserMailBox.vue';

const {
    userTab, globalTabplacement, userSettings
} = useGlobalState()

const { t } = useScopedI18n('views.User')

const canCreateOrBindAddress = computed(() =>
    userSettings.value.is_admin
    || userSettings.value.can_bind_address === true
    || userSettings.value.can_create_address === true
)

watch(canCreateOrBindAddress, (allowed) => {
    if (!allowed && userTab.value === 'bind_address') {
        userTab.value = 'address_management'
    }
}, { immediate: true })

</script>

<template>
    <div>
        <UserBar />
        <n-tabs v-if="userSettings.user_email" type="card" v-model:value="userTab" :placement="globalTabplacement">
            <n-tab-pane name="address_management" :tab="t('address_management')">
                <AddressMangement />
            </n-tab-pane>
            <n-tab-pane name="user_mail_box_tab" :tab="t('user_mail_box_tab')">
                <UserMailBox />
            </n-tab-pane>
            <n-tab-pane name="user_settings" :tab="t('user_settings')">
                <UserSettingsPage />
            </n-tab-pane>
            <n-tab-pane v-if="canCreateOrBindAddress" name="bind_address" :tab="t('bind_address')">
                <BindAddress />
            </n-tab-pane>
        </n-tabs>
    </div>
</template>
