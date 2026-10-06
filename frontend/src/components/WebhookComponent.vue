<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import type { DropdownOption } from 'naive-ui'

const props = defineProps({
    fetchData: {
        type: Function,
        default: () => { },
        required: true
    },
    saveSettings: {
        type: Function,
        default: (webhookSettings: WebhookSettings) => { },
        required: true
    },
    testSettings: {
        type: Function,
        default: (webhookSettings: WebhookSettings) => { },
        required: true
    },
})

// @ts-ignore
const message = useMessage()

const { t } = useScopedI18n('components.WebhookComponent')

class WebhookSettings {
    enabled: boolean = false
    url: string = ''
    method: string = 'POST'
    headers: string = JSON.stringify({}, null, 2)
    body: string = JSON.stringify({}, null, 2)
}

interface WebhookPreset {
    name: string
    doc: string
    settings: WebhookSettings
}

const presets: WebhookPreset[] = [
    {
        name: 'Message Pusher',
        doc: 'https://github.com/songquanpeng/message-pusher',
        settings: {
            enabled: true,
            url: 'https://msgpusher.com/push/username',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "token": "token",
                "title": "${subject}",
                "description": "${subject}",
                "content": "*${subject}*\n\nFrom: ${from}\nTo: ${to}\n\n${parsedText}\n"
            }, null, 2),
        },
    },
    {
        name: 'Bark',
        doc: 'https://github.com/Finb/Bark',
        settings: {
            enabled: true,
            url: 'https://api.day.app/YOUR_KEY',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "title": "${subject}",
                "body": "From: ${from}\nTo: ${to}\n\n${parsedText}",
                "group": "email"
            }, null, 2),
        },
    },
    {
        name: 'ntfy',
        doc: 'https://docs.ntfy.sh/publish/',
        settings: {
            enabled: true,
            url: 'https://ntfy.sh/YOUR_TOPIC',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "topic": "YOUR_TOPIC",
                "title": "${subject}",
                "message": "From: ${from}\nTo: ${to}\n\n${parsedText}",
                "tags": ["envelope"]
            }, null, 2),
        },
    },
    {
        name: 'Telegram Bot',
        doc: 'https://core.telegram.org/bots/api#sendmessage',
        settings: {
            enabled: true,
            url: 'https://api.telegram.org/botYOUR_BOT_TOKEN/sendMessage',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "chat_id": "YOUR_CHAT_ID",
                "text": "New Email\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\nURL: ${url}"
            }, null, 2),
        },
    },
    {
        name: 'WeChat Work',
        doc: 'https://developer.work.weixin.qq.com/document/path/91770',
        settings: {
            enabled: true,
            url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "msgtype": "text",
                "text": {
                    "content": "New Email\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\nURL: ${url}"
                }
            }, null, 2),
        },
    },
    {
        name: 'Discord',
        doc: 'https://discord.com/developers/docs/resources/webhook',
        settings: {
            enabled: true,
            url: 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN',
            method: 'POST',
            headers: JSON.stringify({
                'Content-Type': 'application/json',
            }, null, 2),
            body: JSON.stringify({
                "content": "**New Email**\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\nURL: ${url}"
            }, null, 2),
        },
    },
]

const presetDropdownOptions: DropdownOption[] = presets.map((preset, index) => ({
    label: preset.name,
    key: index,
}))

const selectedPreset = ref<WebhookPreset | null>(null)

const handlePresetSelect = (key: number) => {
    const preset = presets[key]
    if (!preset) {
        message.error('Invalid preset')
        return
    }
    selectedPreset.value = preset
    Object.assign(webhookSettings.value, preset.settings)
    message.success(t('fillInDemoTip'))
}

const webhookSettings = ref<WebhookSettings>(new WebhookSettings())
const enableWebhook = ref(false)
const isLoaded = ref(false)

const fetchData = async () => {
    try {
        const res = await props.fetchData()
        Object.assign(webhookSettings.value, res)
        enableWebhook.value = true
    } catch (error) {
        enableWebhook.value = false
        message.error((error as Error).message || "error");
    } finally {
        isLoaded.value = true
    }
}

const saveSettings = async () => {
    if (webhookSettings.value.enabled && !webhookSettings.value.url) {
        message.error(t('urlMissing'))
        return
    }
    try {
        await props.saveSettings(webhookSettings.value)
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const testSettings = async () => {
    if (!webhookSettings.value.url) {
        message.error(t('urlMissing'))
        return
    }
    try {
        await props.testSettings(webhookSettings.value)
        message.success(t('successTip'))
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

onMounted(async () => {
    await fetchData();
})
</script>

<template>
    <div class="settings-page-wrapper">
        <div class="settings-container">
            <div class="settings-card" v-if="enableWebhook">
                <div class="settings-card-header">
                    <div class="header-main">
                        <h3 class="settings-card-title">{{ t('presets') }} / Webhook</h3>
                    </div>
                    <div class="header-actions">
                        <n-a
                            v-if="selectedPreset?.doc"
                            :href="selectedPreset.doc"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="preset-doc-link"
                        >
                            {{ t('viewDoc') }} ↗
                        </n-a>
                        <n-dropdown :options="presetDropdownOptions" @select="handlePresetSelect">
                            <n-button secondary size="small">
                                {{ t('presets') }}
                            </n-button>
                        </n-dropdown>
                    </div>
                </div>

                <div class="settings-form">
                    <n-form-item :label="t('enable')">
                        <n-switch v-model:value="webhookSettings.enabled" :round="false" />
                    </n-form-item>
                    <div v-if="webhookSettings.enabled" class="webhook-form-fields">
                        <n-form-item label="URL">
                            <n-input v-model:value="webhookSettings.url" placeholder="https://..." />
                        </n-form-item>
                        <n-form-item label="METHOD">
                            <n-select v-model:value="webhookSettings.method" :options='[
                                { label: "POST", value: "POST" }
                            ]' />
                        </n-form-item>
                        <n-form-item label="HEADERS (JSON)">
                            <n-input v-model:value="webhookSettings.headers" type="textarea" class="code-textarea" :autosize="{ minRows: 3 }" />
                        </n-form-item>
                        <n-form-item label="BODY (Template)">
                            <n-input v-model:value="webhookSettings.body" type="textarea" class="code-textarea" :autosize="{ minRows: 4 }" />
                        </n-form-item>
                    </div>
                    <n-flex justify="end" class="action-row">
                        <n-button v-if="webhookSettings.enabled" @click="testSettings" secondary>
                            {{ t('test') }}
                        </n-button>
                        <n-button @click="saveSettings" type="primary">
                            {{ t('save') }}
                        </n-button>
                    </n-flex>
                </div>
            </div>
            <div class="settings-card empty-card" v-else-if="isLoaded">
                <n-empty :description="t('notEnabled')" size="large" />
            </div>
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

.settings-card {
    background: var(--ets-surface-card, #ffffff);
    border: 1px solid var(--ets-border, #e5e7eb);
    border-radius: var(--ets-radius-lg, 10px);
    padding: 20px 24px;
    box-shadow: var(--ets-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
    box-sizing: border-box;
    text-align: left;
}

.empty-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
}

.settings-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--ets-border, #f3f4f6);
}

.settings-card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ets-text-strong, #111827);
    margin: 0;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.preset-doc-link {
    font-size: 13px;
    color: var(--ets-brand, #2563eb);
    text-decoration: none;
}

.code-textarea :deep(textarea) {
    font-family: var(--ets-font-mono, monospace) !important;
    font-size: 12.5px;
    line-height: 1.5;
}

.action-row {
    margin-top: 18px;
}
</style>
