<script setup>
import { computed, onMounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import UserLogin from './UserLogin.vue'

const message = useMessage()
const router = useRouter()

const {
    userSettings, userJwt, userOpenSettings
} = useGlobalState()

const { t } = useScopedI18n('views.user.UserBar')

const roleLabel = computed(() => userSettings.value.user_role?.role || t('noRole'))

onMounted(async () => {
    await api.getUserOpenSettings(message);
    // make sure user_id is fetched
    if (!userSettings.value.user_id) await api.getUserSettings(message);
});
</script>

<template>
    <div>
        <n-card :bordered="false" embedded v-if="!userSettings.fetched">
            <n-skeleton style="height: 50vh" />
        </n-card>
        <div v-else-if="userSettings.user_email">
            <n-alert type="success" :show-icon="false" :bordered="false">
                <div class="user-summary">
                    <span>
                        <b>{{ t('currentUser') }} <b>{{ userSettings.user_email }}</b></b>
                    </span>
                    <div class="user-tags">
                        <n-tag size="small" :bordered="false">{{ roleLabel }}</n-tag>
                        <n-tag v-if="userSettings.is_admin" size="small" type="error" :bordered="false">Admin</n-tag>
                        <n-tag v-else-if="userSettings.can_create_address" size="small" type="success" :bordered="false">
                            {{ t('canCreateAddress') }}
                        </n-tag>
                        <n-tag v-else size="small" type="warning" :bordered="false">
                            {{ t('assignedOnly') }}
                        </n-tag>
                    </div>
                </div>
            </n-alert>
        </div>
        <div v-else class="center">
            <n-card :bordered="false" embedded style="max-width: 600px;">
                <n-alert v-if="userJwt" type="warning" :show-icon="false" :bordered="false" closable>
                    <span>{{ t('fetchUserSettingsError') }}</span>
                </n-alert>
                <UserLogin />
            </n-card>
        </div>
    </div>
</template>

<style scoped>
.n-alert {
    margin-top: 10px;
    margin-bottom: 10px;
    text-align: center;
}

.center {
    display: flex;
    text-align: center;
    place-items: center;
    justify-content: center;
    margin: 20px;
}

.user-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    justify-content: center;
}

.user-tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}
</style>
