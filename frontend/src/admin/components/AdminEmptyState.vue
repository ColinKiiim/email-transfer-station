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
        <div class="empty-state-icon" aria-hidden="true">
            <slot name="icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
            </slot>
        </div>
        <strong class="empty-state-title">{{ title || t('noMatches') }}</strong>
        <span v-if="description" class="empty-state-description">{{ description }}</span>
        <button v-if="actionLabel" class="btn small primary empty-state-action" type="button" @click="$emit('action')">
            {{ actionLabel }}
        </button>
        <slot name="extra" />
    </div>
</template>
