<script setup>
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { useScopedI18n } from '@/i18n/app'
import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useMessage } from 'naive-ui'
import AdminContact from '../common/AdminContact.vue'
import ShadowHtmlComponent from '../../components/ShadowHtmlComponent.vue'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { sanitizeMailHtml } from '../../security/safe-html'

const message = useMessage()
const isPreview = ref(false)
const editorRef = shallowRef()
const sending = ref(false)
const validationErrors = ref({
    toMail: false,
    subject: false,
    content: false,
})

const { settings, sendMailModel, indexTab, userSettings } = useGlobalState()

const { t } = useScopedI18n('views.index.SendMail')

const contentTypes = [
    { label: t('text'), value: 'text' },
    { label: t('html'), value: 'html' },
    { label: t('rich text'), value: 'rich' },
]

const normalizeSendMailText = (content) => {
    return content
        .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

const hasSendMailContent = (content, contentType) => {
    if (typeof content !== 'string' || !content) {
        return false
    }

    if (contentType === 'text') {
        return normalizeSendMailText(content).length > 0
    }

    const container = document.createElement('div')
    container.innerHTML = sanitizeMailHtml(content)
    container.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove())

    const plainContent = normalizeSendMailText(container.textContent ?? '')
    if (plainContent.length > 0) {
        return true
    }

    return Boolean(container.querySelector('img, audio, video, iframe, svg, canvas, table'))
}

const send = async () => {
    if (sending.value) {
        return
    }

    validationErrors.value = {
        toMail: false,
        subject: false,
        content: false,
    }

    const subject = `${sendMailModel.value.subject ?? ''}`.trim()
    const toMail = `${sendMailModel.value.toMail ?? ''}`.trim()
    const content = `${sendMailModel.value.content ?? ''}`

    if (!toMail) {
        validationErrors.value.toMail = true
        message.error(t('toMailEmpty'))
        return
    }
    if (!subject) {
        validationErrors.value.subject = true
        message.error(t('subjectEmpty'))
        return
    }
    if (!hasSendMailContent(content, sendMailModel.value.contentType)) {
        validationErrors.value.content = true
        message.error(t('contentEmpty'))
        return
    }

    const payload = {
        from_name: sendMailModel.value.fromName,
        to_name: sendMailModel.value.toName,
        to_mail: toMail,
        subject,
        is_html: sendMailModel.value.contentType != 'text',
        content,
    }

    sending.value = true
    try {
        await api.fetch(`/api/send_mail`,
            {
                method: 'POST',
                body: JSON.stringify(payload)
            })
        sendMailModel.value = {
            fromName: "",
            toName: "",
            toMail: "",
            subject: "",
            contentType: 'text',
            content: "",
        }
        isPreview.value = false
        message.success(t("successSend"));
        indexTab.value = 'sendbox'
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        sending.value = false
    }
}

const requestAccess = async () => {
    try {
        await api.fetch(`/api/request_send_mail_access`,
            {
                method: 'POST',
                body: JSON.stringify({})
            }
        )
        message.success(t("success"))
        await api.getSettings();
    } catch (error) {
        message.error(error.message || "error");
    }
}

const toolbarConfig = {
    excludeKeys: ["uploadVideo"]
}

const editorConfig = {
    MENU_CONF: {
        'uploadImage': {
            async customUpload() {
                message.error(t('tooLarge'))
            },
            maxFileSize: 1 * 1024 * 1024,
            base64LimitSize: 1 * 1024 * 1024,
        }
    }
}

onBeforeUnmount(() => {
    const editor = editorRef.value
    if (editor == null) return
    editor.destroy()
})

const handleCreated = (editor) => {
    editorRef.value = editor;
}

onMounted(async () => {
    // make sure user_id is fetched
    if (!userSettings.value.user_id) await api.getUserSettings(message);
    await api.getSettings();
})
</script>

<template>
    <div class="sendmail-page-wrapper" v-if="settings.address">
        <div class="sendmail-container">
            <div class="sendmail-card">
                <div v-if="!settings.send_balance || settings.send_balance <= 0">
                    <div class="sendmail-header">
                        <h3 class="sendmail-title">{{ t('sendmail') || '发送邮件' }}</h3>
                    </div>
                    <n-alert type="warning" :show-icon="false" :bordered="false" class="sendmail-alert">
                        <span>{{ t('send_balance') }}: 0</span>
                        <n-button type="primary" tertiary @click="requestAccess" size="small">{{ t('requestAccess') }}</n-button>
                    </n-alert>
                    <AdminContact />
                </div>
                <div v-else>
                    <div class="sendmail-header">
                        <div class="header-title-row">
                            <h3 class="sendmail-title">{{ t('sendmail') || '发送邮件' }}</h3>
                            <n-tag type="info" size="small" round :bordered="false" class="balance-tag">
                                {{ t('send_balance') }}: {{ settings.send_balance }}
                            </n-tag>
                        </div>
                    </div>
                    <div class="sendmail-form-wrap">
                        <n-form :model="sendMailModel">
                            <n-form-item :label="t('fromName')" label-placement="top">
                                <n-input-group>
                                    <n-input v-model:value="sendMailModel.fromName" />
                                    <n-input :value="settings.address" disabled />
                                </n-input-group>
                            </n-form-item>
                            <div class="recipient-grid">
                                <n-form-item :label="t('recipientName')" label-placement="top">
                                    <n-input v-model:value="sendMailModel.toName" />
                                </n-form-item>
                                <n-form-item :label="t('recipientEmail')" label-placement="top">
                                    <n-input v-model:value="sendMailModel.toMail" :status="validationErrors.toMail ? 'error' : undefined" @update:value="validationErrors.toMail = false" />
                                </n-form-item>
                            </div>
                            <n-form-item :label="t('subject')" label-placement="top">
                                <n-input v-model:value="sendMailModel.subject" :status="validationErrors.subject ? 'error' : undefined" @update:value="validationErrors.subject = false" />
                            </n-form-item>
                            <n-form-item :label="t('options')" label-placement="top">
                                <n-radio-group v-model:value="sendMailModel.contentType">
                                    <n-radio-button v-for="option in contentTypes" :key="option.value" :value="option.value"
                                        :label="option.label" />
                                </n-radio-group>
                                <n-button v-if="sendMailModel.contentType != 'text'" @click="isPreview = !isPreview"
                                    style="margin-left: 10px;">
                                    {{ isPreview ? t('edit') : t('preview') }}
                                </n-button>
                            </n-form-item>
                            <n-form-item :label="t('content')" label-placement="top">
                                <div v-if="isPreview" class="sendmail-preview-wrap">
                                    <ShadowHtmlComponent :htmlContent="sendMailModel.content || ''" />
                                </div>
                                <div v-else-if="sendMailModel.contentType == 'rich'" class="wangeditor-container">
                                    <Toolbar class="wangeditor-toolbar" :defaultConfig="toolbarConfig"
                                        :editor="editorRef" mode="default" />
                                    <Editor class="wangeditor-editor" style="height: 500px; overflow-y: hidden;" v-model="sendMailModel.content"
                                        :defaultConfig="editorConfig" mode="default" @onCreated="handleCreated" />
                                </div>
                                <n-input v-else type="textarea" v-model:value="sendMailModel.content" :status="validationErrors.content ? 'error' : undefined" @update:value="validationErrors.content = false" :autosize="{
                                    minRows: 4
                                }" />
                            </n-form-item>
                            <div class="sendmail-action-row">
                                <n-button type="primary" size="medium" :loading="sending" :disabled="sending" @click="send">{{ t('send') }}</n-button>
                            </div>
                        </n-form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.sendmail-page-wrapper {
    display: flex;
    justify-content: center;
    padding: 12px 0 24px;
}

.sendmail-container {
    max-width: 760px;
    width: 100%;
}

.sendmail-card {
    background: var(--ets-surface-card);
    border: 1px solid var(--ets-border);
    border-radius: var(--ets-radius-lg, 10px);
    padding: 24px;
    box-shadow: var(--ets-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
    box-sizing: border-box;
    text-align: left;
}

.sendmail-header {
    margin-bottom: 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--ets-border);
}

.header-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.sendmail-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--ets-text-strong);
}

.sendmail-alert {
    margin-bottom: 16px;
}

.wangeditor-container {
    border: 1px solid var(--ets-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--ets-surface);
    width: 100%;
}

.wangeditor-toolbar {
    border-bottom: 1px solid var(--ets-border);
    background: var(--ets-surface-alt) !important;
}

.wangeditor-toolbar :deep(.w-e-bar) {
    background: var(--ets-surface-alt) !important;
    color: var(--ets-text) !important;
}

.wangeditor-toolbar :deep(.w-e-bar-item button) {
    color: var(--ets-text) !important;
}

.wangeditor-editor {
    background: var(--ets-surface) !important;
    color: var(--ets-text) !important;
}

.wangeditor-editor :deep(.w-e-text-container) {
    background: var(--ets-surface) !important;
    color: var(--ets-text) !important;
}

.sendmail-preview-wrap {
    border: 1px solid var(--ets-border);
    border-radius: 8px;
    padding: 16px;
    background: var(--ets-surface-sunken);
    min-height: 200px;
    width: 100%;
    box-sizing: border-box;
}

.recipient-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
}

@media (max-width: 640px) {
    .recipient-grid {
        grid-template-columns: 1fr;
        gap: 0;
    }
}

.sendmail-action-row {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
}
</style>
