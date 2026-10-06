<script setup>
import { ref, h, onMounted } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { NButton, NPopconfirm, NModal, NTag, NDataTable, NSpace, useMessage } from 'naive-ui';

import { api } from '../../api'

const message = useMessage()

const { t } = useScopedI18n('views.index.Attachment')
const data = ref([])
const loading = ref(false)
const showDownload = ref(false)
const curRow = ref({})
const curDownloadUrl = ref('')

const fetchData = async () => {
    loading.value = true
    try {
        const { results } = await api.fetch(
            `/api/attachment/list`
        );
        data.value = results || [];
    } catch (error) {
        console.error(error)
        message.error(error.message || "error");
    } finally {
        loading.value = false
    }
}

const columns = [
    {
        title: "Key",
        key: "key",
        ellipsis: {
            tooltip: true
        }
    },
    {
        title: t('action'),
        key: 'actions',
        width: 180,
        render(row) {
            return h('div', { class: 'action-cell' }, [
                h(NButton,
                    {
                        type: 'primary',
                        size: 'small',
                        secondary: true,
                        onClick: async () => {
                            try {
                                const { url } = await api.fetch(`/api/attachment/get_url`, {
                                    method: 'POST',
                                    body: JSON.stringify({ key: row.key })
                                });
                                curDownloadUrl.value = url;
                                curRow.value = row;
                                showDownload.value = true;
                            }
                            catch (error) {
                                console.error(error);
                                message.error(error.message || "error");
                            }
                        }
                    },
                    { default: () => t('download') }
                ),
                h(NPopconfirm,
                    {
                        onPositiveClick: async () => {
                            try {
                                await api.fetch(`/api/attachment/delete`, {
                                    method: 'POST',
                                    body: JSON.stringify({ key: row.key })
                                });
                                message.success(t('deleteSuccess'));
                                await fetchData();
                            }
                            catch (error) {
                                console.error(error);
                                message.error(error.message || "error");
                            }
                        },
                    },
                    {
                        trigger: () => h(NButton,
                            {
                                size: 'small',
                                quaternary: true,
                                type: "error",
                            },
                            { default: () => t('delete') }
                        ),
                        default: () => t('deleteConfirm')
                    }
                )
            ])
        }
    }
]

onMounted(async () => {
    await fetchData()
})
</script>

<template>
    <div class="attachment-page-wrapper">
        <div class="attachment-container">
            <div class="attachment-card">
                <div class="attachment-header">
                    <div>
                        <h3 class="attachment-title">{{ t('title') }}</h3>
                    </div>
                    <n-button secondary size="small" :loading="loading" @click="fetchData">
                        {{ t('refresh') }}
                    </n-button>
                </div>
                <div class="attachment-table-wrapper">
                    <n-data-table
                        :columns="columns"
                        :data="data"
                        :bordered="false"
                        :loading="loading"
                        size="small"
                    />
                </div>
            </div>
        </div>

        <n-modal v-model:show="showDownload" preset="dialog" :title="t('download')">
            <n-space vertical size="medium" style="margin-top: 12px;">
                <n-tag type="info" :bordered="false" style="word-break: break-all;">
                    {{ curRow.key }}
                </n-tag>
                <n-button
                    tag="a"
                    target="_blank"
                    type="primary"
                    size="medium"
                    block
                    :download="curRow.key?.replace('/', '_')"
                    :href="curDownloadUrl"
                >
                    {{ t('download') }}
                </n-button>
            </n-space>
        </n-modal>
    </div>
</template>

<style scoped>
.attachment-page-wrapper {
    display: flex;
    justify-content: center;
    padding: 8px 12px 24px 12px;
}

.attachment-container {
    max-width: 860px;
    width: 100%;
}

.attachment-card {
    background: var(--ets-surface-card, #ffffff);
    border: 1px solid var(--ets-border, #e5e7eb);
    border-radius: var(--ets-radius-lg, 10px);
    box-shadow: var(--ets-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
    box-sizing: border-box;
    overflow: hidden;
}

.attachment-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--ets-border, #f3f4f6);
    background: var(--ets-surface-card, #ffffff);
}

.attachment-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ets-text-strong, #111827);
    margin: 0 0 2px 0;
}

.attachment-subtitle {
    font-size: 12.5px;
    color: var(--ets-text-muted, #6b7280);
    margin: 0;
}

.attachment-table-wrapper {
    padding: 6px 14px 14px 14px;
}

:deep(.action-cell) {
    display: flex;
    align-items: center;
    gap: 8px;
}
</style>
