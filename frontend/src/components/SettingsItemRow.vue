<script setup>
defineProps({
  title: {
    type: String,
    default: '',
  },
  description: {
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
  <div class="settings-item-row" :class="{ 'is-danger': danger }">
    <div class="item-text">
      <slot name="title">
        <span class="item-title" :class="{ 'is-danger': danger }">{{ title }}</span>
      </slot>
      <slot name="desc">
        <span v-if="description" class="item-desc">{{ description }}</span>
      </slot>
    </div>
    <div v-if="$slots.default" class="item-action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ets-divider, var(--ets-border));
}

.settings-item-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.settings-item-row:first-child {
  padding-top: 0;
}

.item-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
  text-align: left;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--ets-text);
  line-height: 1.4;
}

.item-title.is-danger {
  color: var(--ets-danger, #dc2626);
  font-weight: 600;
}

.item-desc {
  font-size: 12.5px;
  color: var(--ets-text-muted);
  line-height: 1.45;
}

.item-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
