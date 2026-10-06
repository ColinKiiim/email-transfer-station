<script setup>
import { ref } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  inputClass: {
    type: String,
    default: '',
  },
})

defineEmits(['update:modelValue'])

const visible = ref(false)
</script>

<template>
  <div class="apple-password-wrap">
    <input
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="auth-input apple-password-input"
      :class="inputClass"
      v-bind="$attrs"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <button
      type="button"
      class="apple-password-toggle"
      :disabled="disabled"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      :title="visible ? '隐藏密码' : '显示密码'"
      tabindex="-1"
      @click="visible = !visible"
    >
      <svg
        v-if="visible"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.apple-password-wrap {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

.apple-password-input {
  width: 100%;
  padding-right: 38px !important;
}

.apple-password-toggle {
  position: absolute;
  right: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--ets-radius-sm, 6px);
  background: transparent;
  color: var(--ets-text-muted);
  cursor: pointer;
  transition: color var(--ets-motion-fast, 120ms) ease, background var(--ets-motion-fast, 120ms) ease;
}

.apple-password-toggle:hover:not(:disabled) {
  color: var(--ets-text);
  background: var(--ets-hover, rgba(255, 255, 255, 0.08));
}

.apple-password-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.apple-password-toggle:focus-visible {
  outline: 2px solid var(--ets-focus-ring);
}
</style>
