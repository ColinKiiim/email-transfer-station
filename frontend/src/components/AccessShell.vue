<script setup>
import { computed, useSlots } from 'vue'

import AppUtilityMenu from './AppUtilityMenu.vue'
import ProductBrand from './ProductBrand.vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  kicker: {
    type: String,
    default: '',
  },
  brandContext: {
    type: String,
    default: '',
  },
  identityLabel: {
    type: String,
    default: '',
  },
  identityMeta: {
    type: String,
    default: '',
  },
  statusLabel: {
    type: String,
    default: '',
  },
  statusTone: {
    type: String,
    default: 'neutral',
  },
  railItems: {
    type: Array,
    default: () => [],
  },
  activeId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select'])
const slots = useSlots()
const hasToolbar = computed(() => !!slots.toolbar)

const iconPaths = {
  mailbox: ['M4 6h16v12H4z', 'm4 7 8 6 8-6'],
  addresses: ['M4 7h16v10H4z', 'M8 11h5M8 14h8'],
  account: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  bind: ['M12 5v14M5 12h14'],
  share: ['M4 12 20 4l-5 16-3-7z'],
  lock: ['M6 10V8a6 6 0 0 1 12 0v2', 'M5 10h14v10H5z'],
}

const iconFor = (item) => iconPaths[item.icon] || iconPaths.mailbox
</script>

<template>
  <!-- The rail is omitted entirely when there is nothing to navigate (e.g. the
       signed-out state), instead of reserving 232px of empty column. -->
  <div class="access-shell" :class="{ 'has-rail': railItems.length > 0 }">
    <aside v-if="railItems.length" class="access-sidebar">
      <div class="brand-row">
        <ProductBrand :context-label="brandContext" />
      </div>

      <nav v-if="railItems.length" class="rail-nav" aria-label="Access navigation">
        <button
          v-for="item in railItems"
          :key="item.id"
          type="button"
          class="rail-item"
          :class="{ 'is-active': item.id === activeId }"
          :aria-current="item.id === activeId ? 'page' : undefined"
          @click="emit('select', item.id)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path v-for="path in iconFor(item)" :key="path" :d="path" />
          </svg>
          <span>{{ item.label }}</span>
          <b v-if="item.badge">{{ item.badge }}</b>
        </button>
      </nav>

      <div class="rail-footer">
        <slot name="rail-footer" />
      </div>
    </aside>

    <main class="access-main" :class="{ 'has-toolbar': hasToolbar }">
      <header class="access-topbar">
        <div class="topbar-lead" :class="{ 'has-brand': !railItems.length }">
          <ProductBrand v-if="!railItems.length" :context-label="brandContext" />
          <div class="title-block">
            <p v-if="kicker" class="kicker">{{ kicker }}</p>
            <h1>{{ title }}</h1>
            <div class="identity-line">
              <span v-if="identityLabel" class="identity-label">{{ identityLabel }}</span>
              <span v-if="identityMeta" class="identity-meta">{{ identityMeta }}</span>
              <span v-if="statusLabel" class="status-pill" :class="`tone-${statusTone}`">
                {{ statusLabel }}
              </span>
            </div>
          </div>
        </div>
        <div class="top-actions">
          <slot name="actions" />
          <AppUtilityMenu />
        </div>
      </header>

      <section v-if="hasToolbar" class="access-commandbar">
        <slot name="toolbar" />
      </section>

      <section class="access-view">
        <slot />
      </section>
    </main>
  </div>
</template>

<style scoped>
:global(html:has(.access-shell)),
:global(body:has(.access-shell)),
:global(#app:has(.access-shell)) {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--ets-bg);
}

.access-shell {
  --access-bg: var(--ets-bg);
  --access-surface: var(--ets-surface);
  --access-surface-strong: var(--ets-surface);
  --access-text: var(--ets-text);
  --access-muted: var(--ets-text-muted);
  --access-border: var(--ets-border);
  --access-accent: var(--ets-brand);
  --access-accent-soft: var(--ets-brand-soft);
  --access-shadow: var(--ets-shadow-card);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  min-height: 0;
  background:
    linear-gradient(180deg, var(--ets-surface-alt), var(--ets-bg)),
    var(--access-bg);
  color: var(--access-text);
  text-align: left;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.access-shell.has-rail {
  grid-template-columns: 232px minmax(0, 1fr);
}

.access-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  padding: 20px 12px;
  border-right: 1px solid var(--access-border);
  background: var(--ets-surface);
}

.brand-row {
  min-height: 48px;
  margin-bottom: 22px;
}

.rail-item svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}


.rail-nav {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  overflow-y: auto;
}

.rail-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 44px;
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 0 10px;
  background: transparent;
  color: var(--ets-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition-property: background-color, color, scale;
  transition-duration: 160ms;
  transition-timing-function: ease-out;
}

.rail-item:active {
  scale: 0.96;
}

.rail-item:hover {
  background: var(--ets-hover);
  color: var(--ets-on-brand-soft);
}

.rail-item.is-active {
  background: var(--access-accent-soft);
  color: var(--ets-on-brand-soft);
}

.rail-item span {
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-item b {
  min-width: 26px;
  border-radius: 999px;
  padding: 2px 7px;
  background: var(--access-accent);
  color: var(--ets-brand-contrast);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.rail-footer {
  min-width: 0;
}

.access-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.access-main.has-toolbar {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.access-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  min-height: 74px;
  padding: 16px 24px 12px;
  border-bottom: 1px solid var(--access-border);
  background: var(--ets-surface);
  backdrop-filter: blur(18px);
}

.title-block {
  min-width: 0;
}

.topbar-lead {
  min-width: 0;
}

.topbar-lead.has-brand {
  display: grid;
  grid-template-columns: minmax(180px, 232px) minmax(0, 1fr);
  gap: 24px;
  align-items: center;
}

.kicker {
  margin: 0 0 2px;
  color: var(--access-muted);
  font-size: 12px;
  line-height: 1.2;
  text-transform: lowercase;
}

.title-block h1 {
  margin: 0;
  overflow: hidden;
  color: var(--ets-text-strong);
  font-size: 26px;
  font-weight: 780;
  line-height: 1.15;
  text-overflow: ellipsis;
  text-wrap: balance;
}

.identity-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
  min-height: 22px;
  margin-top: 6px;
  color: var(--access-muted);
  font-size: 12px;
}

.identity-label {
  max-width: min(58vw, 560px);
  overflow: hidden;
  color: var(--ets-text);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-meta {
  overflow-wrap: anywhere;
}

.status-pill {
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--ets-brand-soft);
  color: var(--ets-on-brand-soft);
  font-size: 11px;
  font-weight: 700;
}

.tone-success {
  background: var(--ets-success-soft);
  color: var(--ets-success);
}

.tone-warning {
  background: var(--ets-warn-soft);
  color: var(--ets-warn);
}

.tone-error {
  background: var(--ets-danger-soft);
  color: var(--ets-danger);
}

.top-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.access-commandbar {
  padding: 12px 24px;
  border-bottom: 1px solid var(--access-border);
  background: var(--ets-bg);
}

.access-view {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px 24px 24px;
}

@media (max-width: 900px) {
  .access-shell {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }

  .access-shell.has-rail {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .access-sidebar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
    border-right: 0;
    border-bottom: 1px solid var(--access-border);
  }

  .brand-row {
    margin-bottom: 0;
  }

  .rail-nav {
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .rail-item {
    grid-template-columns: 20px auto auto;
    width: auto;
    white-space: nowrap;
  }

  .rail-footer {
    display: none;
  }

  .access-topbar {
    grid-template-columns: 1fr;
    gap: 10px;
    min-height: 0;
    padding: 14px 16px 10px;
  }

  .topbar-lead.has-brand {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .top-actions {
    justify-content: flex-start;
  }

  .title-block h1 {
    font-size: 22px;
  }

  .access-commandbar,
  .access-view {
    padding-right: 12px;
    padding-left: 12px;
  }
}

@media (max-width: 520px) {
  .access-sidebar {
    grid-template-columns: 1fr;
  }

  .brand-row {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .rail-nav {
    display: flex;
    flex-wrap: wrap;
    margin-right: 0;
    padding-right: 0;
    overflow: visible;
  }

  .rail-item {
    flex: 1 1 calc(50% - 6px);
    grid-template-columns: 20px minmax(0, 1fr) auto;
    min-width: 0;
  }

  .identity-label {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
