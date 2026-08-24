<script setup>
import { ref, h } from 'vue'
import { NButton, NPopconfirm, NDataTable, NModal, NInput, useMessage } from 'naive-ui'
import { startRegistration } from '@simplewebauthn/browser'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'

const message = useMessage()
const { t } = useScopedI18n('views.user.UserSettings')

const showCreatePasskey = ref(false)
const passkeyName = ref('')
const showPasskeyList = ref(false)
const showRenamePasskey = ref(false)
const currentPasskeyId = ref(null)
const currentPasskeyName = ref('')
const passkeyData = ref([])
const loading = ref(false)

const createPasskey = async () => {
    try {
        loading.value = true
        const options = await api.fetch(`/user_api/passkey/register_request`, {
            method: 'POST',
            body: JSON.stringify({
                domain: location.hostname,
            })
        })
        const credential = await startRegistration({ optionsJSON: options })

        // Send the result to the server and return the promise.
        await api.fetch(`/user_api/passkey/register_response`, {
            method: 'POST',
            body: JSON.stringify({
                origin: location.origin,
                passkey_name: passkeyName.value || (
                    (window.navigator.userAgentData?.platform || "Unknown")
                    + ": " + Math.random().toString(36).substring(7)
                ),
                credential
            })
        })
        message.success(t('passkeyCreated'))
    } catch (e) {
        console.error(e)
        message.error(e.message)
    } finally {
        loading.value = false
        passkeyName.value = ''
        showCreatePasskey.value = false
    }
}

const fetchPasskeyList = async () => {
    try {
        const data = await api.fetch(`/user_api/passkey`)
        passkeyData.value = data
    } catch (e) {
        console.error(e)
        message.error(e.message)
    }
}

const renamePasskey = async () => {
    try {
        loading.value = true
        await api.fetch(`/user_api/passkey/rename`, {
            method: 'POST',
            body: JSON.stringify({
                passkey_name: currentPasskeyName.value,
                passkey_id: currentPasskeyId.value
            })
        })
        await fetchPasskeyList()
    } catch (e) {
        console.error(e)
        message.error(e.message)
    } finally {
        loading.value = false
        currentPasskeyName.value = ''
        showRenamePasskey.value = false
    }
}

const passkeyColumns = [
    {
        title: "Passkey ID",
        key: "passkey_id"
    },
    {
        title: t('passkey_name'),
        key: "passkey_name"
    },
    {
        title: t('created_at'),
        key: "created_at"
    },
    {
        title: t('updated_at'),
        key: "updated_at"
    },
    {
        title: t('actions'),
        key: 'actions',
        render(row) {
            return h('div', [
                h(NButton,
                    {
                        tertiary: true,
                        type: "primary",
                        onClick: () => {
                            showRenamePasskey.value = true;
                            currentPasskeyId.value = row.passkey_id;
                        }
                    },
                    { default: () => t('renamePasskey') }
                ),
                h(NPopconfirm,
                    {
                        onPositiveClick: async () => {
                            try {
                                await api.fetch(`/user_api/passkey/${row.passkey_id}`, {
                                    method: 'DELETE'
                                })
                                await fetchPasskeyList()
                            } catch (e) {
                                console.error(e)
                                message.error(e.message)
                            }
                        }
                    },
                    {
                        trigger: () => h(NButton,
                            {
                                tertiary: true,
                                type: "error",
                            },
                            { default: () => t('deletePasskey') }
                        ),
                        default: () => `${t('deletePasskey')}?`
                    }
                ),
            ])
        }
    }
]
</script>

<template>
    <div class="passkey-settings-section">
        <n-button @click="showPasskeyList = true; fetchPasskeyList();" secondary block strong>
            {{ t('showPasskeyList') }}
        </n-button>
        <n-button @click="showCreatePasskey = true" type="primary" secondary block strong>
            {{ t('createPasskey') }}
        </n-button>

        <n-modal v-model:show="showCreatePasskey" preset="dialog" :title="t('createPasskey')">
            <n-input v-model:value="passkeyName" :placeholder="t('passkeyNamePlaceholder')" />
            <template #action>
                <n-button :loading="loading" @click="createPasskey" size="small" tertiary type="primary">
                    {{ t('createPasskey') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showRenamePasskey" preset="dialog" :title="t('renamePasskey')">
            <n-input v-model:value="currentPasskeyName" :placeholder="t('renamePasskeyNamePlaceholder')" />
            <template #action>
                <n-button :loading="loading" @click="renamePasskey" size="small" tertiary type="primary">
                    {{ t('renamePasskey') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showPasskeyList" preset="card" :title="t('showPasskeyList')">
            <n-data-table :columns="passkeyColumns" :data="passkeyData" :bordered="false" embedded />
        </n-modal>
    </div>
</template>

<style scoped>
.passkey-settings-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 10px 0;
}
</style>
