<script setup>
defineProps({
    state: { type: Object, required: true },
})
</script>

<template>
    <div class="toast" :class="{ 'is-visible': state.visible }"
        :role="state.tone === 'error' ? 'alert' : 'status'"
        :aria-live="state.tone === 'error' ? 'assertive' : 'polite'" aria-atomic="true">
        {{ state.text }}
    </div>
</template>
