<script setup>
import { useScopedI18n } from '@/i18n/app'

const { t } = useScopedI18n('admin.workspace')

defineProps({
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    actionLabel: { type: String, default: '' },
})

defineEmits(['action'])
</script>

<template>
    <div class="empty-state" role="status" aria-live="polite" aria-atomic="true">
        <strong>{{ title || t('noMatches') }}</strong>
        <span v-if="description">{{ description }}</span>
        <button v-if="actionLabel" class="btn" type="button" @click="$emit('action')">
            {{ actionLabel }}
        </button>
    </div>
</template>
