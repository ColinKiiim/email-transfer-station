<script setup>
defineProps({
    disabled: { type: Boolean, default: false },
    label: { type: String, required: true },
})

const emit = defineEmits(['click'])
</script>

<template>
    <button type="button" class="admin-refresh-btn"
        :disabled="disabled"
        :title="label"
        :aria-label="label"
        @click="emit('click')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
    </button>
</template>
