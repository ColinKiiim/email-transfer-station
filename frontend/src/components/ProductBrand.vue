<script setup>
import { computed } from 'vue'

import { useGlobalState } from '../store'

const props = defineProps({
  title: { type: String, default: '' },
  contextLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})

const { openSettings } = useGlobalState()
const displayTitle = computed(() => props.title || openSettings.value.title || 'ETS Mail')
</script>

<template>
  <div class="product-brand" :class="{ 'is-compact': compact }">
    <img class="product-brand-mark" src="/email-transfer-station-logo.svg" alt="" aria-hidden="true">
    <span class="product-brand-copy">
      <strong>{{ displayTitle }}</strong>
      <span v-if="contextLabel">{{ contextLabel }}</span>
    </span>
  </div>
</template>

<style scoped>
.product-brand {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  color: var(--ets-text);
  font-family: var(--ets-font-ui);
  text-align: left;
}

.product-brand-mark {
  display: block;
  width: 40px;
  height: 40px;
}

.product-brand-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.product-brand-copy strong,
.product-brand-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-brand-copy strong {
  color: var(--ets-text-strong);
  font-size: 15px;
  font-weight: 760;
  line-height: 1.1;
}

.product-brand-copy span {
  color: var(--ets-text-muted);
  font-size: 12px;
  line-height: 1.2;
}

.product-brand.is-compact {
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 9px;
}

.is-compact .product-brand-mark {
  width: 34px;
  height: 34px;
}
</style>
