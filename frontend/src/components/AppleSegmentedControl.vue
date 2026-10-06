<script setup>
import { computed, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  options: {
    type: Array,
    required: true,
    validator: (opts) => opts.every((o) => typeof o.value === 'string' && typeof o.label === 'string'),
  },
  ariaLabel: {
    type: String,
    default: 'Segmented Control',
  },
})

const emit = defineEmits(['update:modelValue', 'change'])

const selectOption = (val) => {
  if (val !== props.modelValue) {
    emit('update:modelValue', val)
    emit('change', val)
  }
}

const onKeyDown = async (event, currentIndex) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()

  const len = props.options.length
  let nextIndex = currentIndex
  if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = len - 1
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + len) % len
  else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % len

  const nextVal = props.options[nextIndex].value
  selectOption(nextVal)
}
</script>

<template>
  <div class="apple-segmented-control" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="(opt, idx) in options"
      :key="opt.value"
      type="button"
      role="tab"
      :id="`segmented-opt-${opt.value}`"
      class="segment-item"
      :class="{ 'is-active': modelValue === opt.value }"
      :aria-selected="modelValue === opt.value"
      :tabindex="modelValue === opt.value ? 0 : -1"
      @click="selectOption(opt.value)"
      @keydown="onKeyDown($event, idx)"
    >
      <span class="segment-label">{{ opt.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.apple-segmented-control {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 3px;
  background: var(--ets-surface-sunken, rgba(0, 0, 0, 0.05));
  border: 1px solid var(--ets-border);
  border-radius: var(--ets-radius-md, 8px);
  box-sizing: border-box;
  margin-bottom: 20px;
  user-select: none;
}

.segment-item {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 4px 12px;
  border: 0;
  border-radius: calc(var(--ets-radius-md, 8px) - 2px);
  background: transparent;
  color: var(--ets-text-muted);
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ets-motion-fast, 120ms) ease;
  white-space: nowrap;
}

.segment-item:hover:not(.is-active) {
  color: var(--ets-text);
  background: rgba(128, 128, 128, 0.06);
}

.segment-item.is-active {
  background: var(--ets-surface);
  color: var(--ets-text-strong);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);
}

.segment-item:focus-visible {
  outline: 2px solid var(--ets-focus-ring);
  outline-offset: 1px;
}
</style>
