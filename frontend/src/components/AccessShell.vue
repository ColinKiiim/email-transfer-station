<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  kicker: {
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
  <div class="access-shell">
    <aside class="access-sidebar">
      <div class="brand-row">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 6h16v12H4z" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        </div>
        <div class="brand-copy">
          <strong>Email Transfer</strong>
          <span>station access</span>
        </div>
      </div>

      <nav v-if="railItems.length" class="rail-nav" aria-label="Access navigation">
        <button
          v-for="item in railItems"
          :key="item.id"
          type="button"
          class="rail-item"
          :class="{ 'is-active': item.id === activeId }"
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

    <main class="access-main">
      <header class="access-topbar">
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
        <div class="top-actions">
          <slot name="actions" />
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
  background: #f4f7fb;
}

.access-shell {
  --access-bg: #f4f7fb;
  --access-surface: rgba(255, 255, 255, 0.92);
  --access-surface-strong: #ffffff;
  --access-text: #0f172a;
  --access-muted: #64748b;
  --access-border: rgba(15, 23, 42, 0.08);
  --access-accent: #0f6fd9;
  --access-accent-soft: #dceeff;
  --access-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.06),
    0 1px 2px -1px rgba(15, 23, 42, 0.08),
    0 16px 48px -32px rgba(15, 23, 42, 0.45);
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  min-height: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(244, 247, 251, 0.96)),
    var(--access-bg);
  color: var(--access-text);
  text-align: left;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.access-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  padding: 20px 12px;
  border-right: 1px solid var(--access-border);
  background: rgba(255, 255, 255, 0.78);
}

.brand-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 48px;
  margin-bottom: 22px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #dceeff;
  color: var(--access-accent);
  box-shadow: var(--access-shadow);
}

.brand-mark svg,
.rail-item svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.brand-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.brand-copy strong {
  overflow: hidden;
  color: #020617;
  font-size: 15px;
  font-weight: 760;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-copy span {
  color: var(--access-muted);
  font-size: 12px;
  line-height: 1.2;
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
  color: #334155;
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
  background: rgba(15, 111, 217, 0.08);
  color: #075ab4;
}

.rail-item.is-active {
  background: var(--access-accent-soft);
  color: #075ab4;
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
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.rail-footer {
  min-width: 0;
}

.access-main {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.access-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  min-height: 74px;
  padding: 16px 24px 12px;
  border-bottom: 1px solid var(--access-border);
  background: rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(18px);
}

.title-block {
  min-width: 0;
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
  color: #020617;
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
  color: #334155;
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
  background: #eef2ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 700;
}

.tone-success {
  background: #dcfce7;
  color: #15803d;
}

.tone-warning {
  background: #fef3c7;
  color: #b45309;
}

.tone-error {
  background: #fee2e2;
  color: #b91c1c;
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
  background: rgba(244, 247, 251, 0.8);
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

  .brand-copy span {
    display: none;
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
