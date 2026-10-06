<script setup>
const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: '',
  },
  confirmText: {
    type: String,
    default: '',
  },
  cancelText: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'error', // 'error' | 'warning' | 'primary'
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:show', 'confirm', 'cancel'])

const onCancel = () => {
  emit('update:show', false)
  emit('cancel')
}

const onConfirm = () => {
  emit('confirm')
}
</script>

<template>
  <n-modal
    :show="show"
    preset="dialog"
    :type="type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info'"
    :title="title"
    :loading="loading"
    @update:show="emit('update:show', $event)"
  >
    <div class="confirm-modal-body">
      <slot>
        <p class="confirm-modal-text">{{ content }}</p>
      </slot>
    </div>
    <template #action>
      <n-space justify="end" :size="8">
        <n-button size="small" tertiary :disabled="loading" @click="onCancel">
          {{ cancelText || '取消' }}
        </n-button>
        <n-button
          size="small"
          :type="type"
          :loading="loading"
          @click="onConfirm"
        >
          {{ confirmText || '确认' }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.confirm-modal-body {
  padding: 8px 0;
}

.confirm-modal-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ets-text);
}
</style>
