<script setup>
import { useScopedI18n } from '@/i18n/app'

const { t } = useScopedI18n('admin.workspace')

defineProps({
    syncing: { type: Boolean, default: false },
    errors: { type: Array, default: () => [] },
    showErrors: { type: Boolean, default: false },
})

defineEmits(['retry'])
</script>

<template>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ syncing ? t('syncing') : t('synced') }}
    </span>
    <div v-if="errors.length && showErrors" class="notice warn" role="alert"
        aria-live="assertive" aria-atomic="true">
        <strong>{{ t('loadFailed') }}</strong>
        <span>{{ errors.slice(0, 2).join('；') }}</span>
        <button class="btn" type="button" :disabled="syncing" @click="$emit('retry')">
            {{ syncing ? t('retrying') : t('retry') }}
        </button>
    </div>
</template>
