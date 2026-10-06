<script setup>
defineProps({
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  danger: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="settings-card" :class="{ 'is-danger': danger }">
    <header v-if="title || $slots.header || $slots.actions" class="settings-card-header">
      <div class="settings-header-main">
        <slot name="header">
          <h3 class="settings-card-title" :class="{ 'is-danger': danger }">{{ title }}</h3>
          <p v-if="subtitle" class="settings-card-subtitle">{{ subtitle }}</p>
        </slot>
      </div>
      <div v-if="$slots.actions" class="settings-header-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="settings-card-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-card {
  background: var(--ets-surface-card, #ffffff);
  border: 1px solid var(--ets-border, #e5e7eb);
  border-radius: var(--ets-radius-lg, 12px);
  padding: 20px 24px;
  box-shadow: var(--ets-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  box-sizing: border-box;
  text-align: left;
  transition: border-color var(--ets-motion-fast, 120ms) ease, box-shadow var(--ets-motion-fast, 120ms) ease;
}

.settings-card.is-danger {
  border-color: rgba(220, 38, 38, 0.28);
  background: color-mix(in srgb, var(--ets-surface-card, #ffffff) 97%, #ef4444 3%);
}

.settings-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ets-divider, var(--ets-border));
}

.settings-header-main {
  min-width: 0;
}

.settings-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ets-text-strong);
  letter-spacing: -0.01em;
}

.settings-card-title.is-danger {
  color: var(--ets-danger, #dc2626);
}

.settings-card-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ets-text-muted);
  line-height: 1.4;
}

.settings-header-actions {
  flex-shrink: 0;
}

.settings-card-body {
  display: flex;
  flex-direction: column;
}
</style>
