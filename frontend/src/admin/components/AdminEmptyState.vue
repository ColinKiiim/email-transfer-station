<script setup>
defineProps({
    title: { type: String, default: '没有匹配结果' },
    description: { type: String, default: '' },
    actionLabel: { type: String, default: '' },
})

defineEmits(['action'])
</script>

<template>
    <div class="empty-state" role="status" aria-live="polite" aria-atomic="true">
        <strong>{{ title }}</strong>
        <span v-if="description">{{ description }}</span>
        <button v-if="actionLabel" class="btn" type="button" @click="$emit('action')">
            {{ actionLabel }}
        </button>
    </div>
</template>
