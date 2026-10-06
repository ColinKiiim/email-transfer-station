<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'

const { t } = useScopedI18n('views.user.UserAuthenticators')
const message = useMessage()
const rows = ref([])
const now = ref(Date.now())
let timer = null
let refreshing = false

const load = async () => {
  const data = await api.fetch('/user_api/authenticators')
  rows.value = data.results || []
  now.value = data.server_time || Date.now()
}

const remaining = (row) => Math.max(0, Math.ceil(((row.valid_until || now.value + row.period * 1000) - now.value) / 1000))

const remove = async (row) => {
  try {
    await api.fetch(`/user_api/authenticators/${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    })
    await load()
  } catch (error) {
    message.error(error.message || t('failed'))
  }
}

const copy = async (value) => {
  try {
    await navigator.clipboard.writeText(value)
    message.success(t('copied'))
  } catch (error) {
    message.error(error.message || t('failed'))
  }
}

onMounted(async () => {
  try {
    await load()
  } catch (error) {
    message.error(error.message)
  }
  timer = window.setInterval(async () => {
    now.value = Date.now()
    if (!refreshing && rows.value.some((row) => remaining(row) === 0)) {
      refreshing = true
      try {
        await load()
      } catch (error) {
        rows.value = []
        message.error(error.message || t('failed'))
      } finally {
        refreshing = false
      }
    }
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div class="authenticator-panel">
    <div v-if="!rows.length" class="empty-state">
      <n-empty :description="t('empty')" />
    </div>
    <ul v-else class="items" aria-live="polite">
      <li v-for="row in rows" :key="row.id" class="item">
        <div class="item-meta">
          <strong>{{ row.label }}</strong>
          <small>{{ row.issuer || t('noIssuer') }}</small>
        </div>
        <n-tooltip trigger="hover">
          <template #trigger>
            <button type="button" class="code" :aria-label="t('copyCode')" @click="copy(row.code)">
              <span>{{ row.code.slice(0, 3) }} {{ row.code.slice(3) }}</span>
              <svg class="copy-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </template>
          {{ t('copyCode') }}
        </n-tooltip>
        <span class="count">{{ remaining(row) }}s</span>
        <n-popconfirm :positive-text="t('delete')" :negative-text="t('cancel')" @positive-click="remove(row)">
          <template #trigger>
            <button type="button" class="danger-btn">{{ t('delete') }}</button>
          </template>
          {{ t('deleteConfirm') }}
        </n-popconfirm>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.authenticator-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 680px;
  margin: 0 auto;
}

.hint {
  color: var(--ets-text-muted);
  font-size: 13px;
  margin: 0;
}

.empty-state {
  padding: 36px 0;
}

.items {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.item {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) auto auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid var(--ets-border);
  border-radius: var(--ets-radius-md, 8px);
  background: var(--ets-surface-card, #ffffff);
}

.item-meta strong {
  display: block;
  font-size: 14px;
  color: var(--ets-text-strong);
}

.item-meta small {
  display: block;
  color: var(--ets-text-muted);
  margin-top: 3px;
  font-size: 12px;
}

.code {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ets-font-mono, monospace);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--ets-brand, #2563eb);
  background: var(--ets-surface-alt, #f3f4f6);
  border: 1px solid var(--ets-border);
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.code:hover {
  border-color: var(--ets-brand);
  background: rgba(37, 99, 235, 0.08);
}

.copy-icon {
  opacity: 0.5;
  transition: opacity 0.15s ease, transform 0.15s ease;
  flex-shrink: 0;
}

.code:hover .copy-icon {
  opacity: 1;
  transform: scale(1.1);
}

.count {
  color: var(--ets-text-muted);
  min-width: 32px;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}

.danger-btn {
  color: var(--ets-danger, #ef4444);
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12.5px;
  cursor: pointer;
}

.danger-btn:hover {
  background: rgba(239, 68, 68, 0.08);
}

@media (max-width: 700px) {
  .item {
    grid-template-columns: 1fr auto auto;
  }
}
</style>
