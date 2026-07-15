<script setup>
defineProps({
    syncing: { type: Boolean, default: false },
    errors: { type: Array, default: () => [] },
    showErrors: { type: Boolean, default: false },
})

defineEmits(['retry'])
</script>

<template>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ syncing ? '后台数据同步中' : '后台数据同步完成' }}
    </span>
    <div v-if="errors.length && showErrors" class="notice warn" role="alert"
        aria-live="assertive" aria-atomic="true">
        <strong>后台数据加载失败</strong>
        <span>{{ errors.slice(0, 2).join('；') }}</span>
        <button class="btn" type="button" :disabled="syncing" @click="$emit('retry')">
            {{ syncing ? '重试中' : '重新同步' }}
        </button>
    </div>
</template>
