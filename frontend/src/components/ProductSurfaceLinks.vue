<script setup>
defineProps({
  items: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: 'Product surfaces' },
  compact: { type: Boolean, default: false },
})

const iconPaths = {
  home: ['M4 11.5 12 5l8 6.5', 'M6.5 10v9h11v-9'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  admin: ['M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z', 'm9 12 2 2 4-5'],
}
</script>

<template>
  <nav v-if="items.length" class="surface-links" :class="{ 'is-compact': compact }" :aria-label="ariaLabel">
    <router-link v-for="item in items" :key="item.id" class="surface-link" :to="item.to"
      :aria-label="item.label" :title="item.label">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path v-for="path in (iconPaths[item.id] || iconPaths.home)" :key="path" :d="path" />
      </svg>
      <span>{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.surface-links {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  min-width: 0;
  border-radius: var(--ets-radius-md);
  padding: 2px;
  background: var(--ets-surface-alt);
  box-shadow: var(--ets-shadow-hairline);
}

.surface-link {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  min-height: 32px;
  border-radius: var(--ets-radius-sm);
  padding: 0 9px;
  color: var(--ets-text-muted);
  font: 650 12px/1 var(--ets-font-ui);
  text-decoration: none;
  white-space: nowrap;
}

.surface-link:hover,
.surface-link.router-link-exact-active {
  background: var(--ets-surface);
  color: var(--ets-on-brand-soft);
  box-shadow: var(--ets-shadow-hairline);
}

.surface-link:focus-visible {
  outline: 2px solid var(--ets-focus-ring);
  outline-offset: 2px;
}

.surface-link svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

@media (max-width: 520px) {
  .surface-link span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
}

.surface-links.is-compact .surface-link span {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
