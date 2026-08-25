<script setup>
import { useScopedI18n } from '@/i18n/app'

import { useIsMobile } from '../../utils/composables'
import { useGlobalState } from '../../store'

const props = defineProps({
    showUseSimpleIndex: {
        type: Boolean,
        default: false
    }
})

const {
    mailboxSplitSize, useIframeShowMail, preferShowTextMail, configAutoRefreshInterval,
    globalTabplacement, useSideMargin, useUTCDate, useSimpleIndex
} = useGlobalState()
const isMobile = useIsMobile()

const { t } = useScopedI18n('views.common.Appearance')
</script>

<template>
    <div class="appearance-shell">
        <div class="appearance-container">
            <!-- Group 1: 邮件与阅读体验 -->
            <n-card :bordered="false" embedded class="setting-group-card" :title="t('readingExperience') || '阅读体验'">
                <n-form-item-row :label="t('preferShowTextMail')">
                    <n-switch v-model:value="preferShowTextMail" :round="false" />
                </n-form-item-row>
                <n-form-item-row :label="t('useIframeShowMail')">
                    <n-switch v-model:value="useIframeShowMail" :round="false" />
                </n-form-item-row>
                <n-form-item-row :label="t('useUTCDate')">
                    <n-switch v-model:value="useUTCDate" :round="false" />
                </n-form-item-row>
            </n-card>

            <!-- Group 2: 同步与刷新 -->
            <n-card :bordered="false" embedded class="setting-group-card" :title="t('syncAndRefresh') || '刷新与比例'">
                <n-form-item-row :label="t('autoRefreshInterval')">
                    <n-slider v-model:value="configAutoRefreshInterval" :min="30" :max="300" :step="1" :marks="{
                        60: '60s', 120: '120s', 180: '180s', 240: '240s'
                    }" />
                </n-form-item-row>
                <n-form-item-row v-if="!isMobile" :label="t('mailboxSplitSize')">
                    <n-slider v-model:value="mailboxSplitSize" :min="0.25" :max="0.75" :step="0.01" :marks="{
                        0.25: '25%',
                        0.5: '50%',
                        0.75: '75%'
                    }" />
                </n-form-item-row>
            </n-card>

            <!-- Group 3: 界面布局 -->
            <n-card :bordered="false" embedded class="setting-group-card" :title="t('layoutPreferences') || '界面布局'">
                <n-form-item-row v-if="props.showUseSimpleIndex" :label="t('useSimpleIndex')">
                    <n-switch v-model:value="useSimpleIndex" :round="false" />
                </n-form-item-row>
                <n-form-item-row v-if="!isMobile" :label="t('useSideMargin')">
                    <n-switch v-model:value="useSideMargin" :round="false" />
                </n-form-item-row>
                <n-form-item-row :label="t('globalTabplacement')">
                    <n-radio-group v-model:value="globalTabplacement">
                        <n-radio-button value="top" :label="t('top')" />
                        <n-radio-button value="left" :label="t('left')" />
                        <n-radio-button value="right" :label="t('right')" />
                        <n-radio-button value="bottom" :label="t('bottom')" />
                    </n-radio-group>
                </n-form-item-row>
            </n-card>
        </div>
    </div>
</template>

<style scoped>
.appearance-shell {
    display: flex;
    justify-content: center;
    padding: 8px 0;
}

.appearance-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: min(100%, 1080px);
    width: 100%;
}

.setting-group-card {
    text-align: left;
    border-radius: 12px;
    border: 1px solid var(--ets-border);
}
</style>
