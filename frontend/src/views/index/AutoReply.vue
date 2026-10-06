<script setup>
import { useScopedI18n } from '@/i18n/app'
import { onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import SettingsCardShell from '../../components/SettingsCardShell.vue'

const message = useMessage()
const sourcePrefix = ref("")
const enableAutoReply = ref(false)
const autoReplyMessage = ref("")
const subject = ref("")
const name = ref("")

const { settings } = useGlobalState()

const { t } = useScopedI18n('views.index.AutoReply')

const fetchData = async () => {
    try {
        const res = await api.fetch("/api/auto_reply")
        sourcePrefix.value = res.source_prefix || ""
        enableAutoReply.value = res.enabled || false
        name.value = res.name || ""
        autoReplyMessage.value = res.message || ""
        subject.value = res.subject || ""
    } catch (error) {
        message.error(error.message || "error");
    }
}

const saveData = async () => {
    try {
        await api.fetch("/api/auto_reply", {
            method: "POST",
            body: JSON.stringify({
                auto_reply: {
                    enabled: enableAutoReply.value,
                    source_prefix: sourcePrefix.value,
                    name: name.value,
                    message: autoReplyMessage.value,
                    subject: subject.value,
                }
            })
        })
        message.success(t("success"))
    } catch (error) {
        message.error(error.message || "error");
    }
}

onMounted(async () => {
    await fetchData()
})
</script>

<template>
    <div class="settings-page-wrapper" v-if="settings.address">
        <div class="settings-container">
            <SettingsCardShell :title="t('settings')">
                <div class="settings-form">
                    <n-form-item :label="t('enableAutoReply')">
                        <n-switch v-model:value="enableAutoReply" :round="false" />
                    </n-form-item>
                    <n-form-item :label="t('name')">
                        <n-input :disabled="!enableAutoReply" v-model:value="name" />
                    </n-form-item>
                    <n-form-item :label="t('sourcePrefix')">
                        <n-input :disabled="!enableAutoReply" v-model:value="sourcePrefix"
                            :placeholder="t('sourcePrefixPlaceholder')" />
                    </n-form-item>
                    <n-form-item :label="t('subject')">
                        <n-input :disabled="!enableAutoReply" v-model:value="subject" />
                    </n-form-item>
                    <n-form-item :label="t('autoReply')">
                        <n-input :disabled="!enableAutoReply" type="textarea" :autosize="{ minRows: 4 }" v-model:value="autoReplyMessage" />
                    </n-form-item>
                    <n-flex justify="end" class="action-row">
                        <n-button type="primary" @click="saveData">{{ t('save') }}</n-button>
                    </n-flex>
                </div>
            </SettingsCardShell>
        </div>
    </div>
</template>

<style scoped>
.settings-page-wrapper {
    display: flex;
    justify-content: center;
    padding: 8px 0 24px 0;
}

.settings-container {
    max-width: 680px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.action-row {
    margin-top: 16px;
}
</style>
