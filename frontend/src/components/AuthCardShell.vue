<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  titleId: {
    type: String,
    default: undefined,
  },
  description: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <div class="auth-card-shell">
    <div class="auth-card">
      <header class="auth-card-header">
        <div class="auth-brand-badge">
          <slot name="badge">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </slot>
        </div>
        <h1 :id="titleId" class="auth-title">{{ title }}</h1>
        <p v-if="description" class="auth-description">{{ description }}</p>
      </header>

      <div v-if="$slots.alert" class="auth-alert-wrap">
        <slot name="alert" />
      </div>

      <div class="auth-body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="auth-footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.auth-card-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  min-height: calc(100dvh - var(--ets-header-height, 56px));
  padding: 24px 16px;
  box-sizing: border-box;
}

.auth-card {
  width: min(100%, 420px);
  min-height: 440px;
  background: var(--ets-surface);
  border: 1px solid var(--ets-border);
  border-radius: var(--ets-radius-xl, 16px);
  box-shadow: var(--ets-shadow-overlay, 0 16px 36px rgba(0, 0, 0, 0.08));
  padding: 32px 28px;
  box-sizing: border-box;
  text-align: center;
  display: flex;
  flex-direction: column;
  transition: box-shadow var(--ets-motion-fast, 120ms) ease, border-color var(--ets-motion-fast, 120ms) ease;
}

.auth-card-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

.auth-brand-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--ets-radius-md, 12px);
  background: linear-gradient(135deg, var(--ets-brand, #0f6cbd), #2563eb);
  color: #ffffff;
  margin-bottom: 14px;
  box-shadow: var(--ets-shadow-sm, 0 4px 12px rgba(15, 108, 189, 0.25));
  flex-shrink: 0;
}

.auth-brand-badge :deep(svg) {
  width: 24px;
  height: 24px;
}

.auth-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--ets-text-strong);
}

.auth-description {
  margin: 6px 0 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ets-text-muted);
}

.auth-alert-wrap {
  margin-bottom: 16px;
  text-align: left;
}

.auth-body {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  text-align: left;
}

/* Canonical Apple HIG Auth Form Primitives */
:deep(.auth-form) {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

:deep(.auth-field) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  text-align: left;
}

:deep(.auth-label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--ets-text);
  line-height: 1.3;
}

:deep(.auth-input) {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--ets-border);
  border-radius: var(--ets-radius-md, 8px);
  background: var(--ets-surface-sunken, rgba(0, 0, 0, 0.03));
  color: var(--ets-text);
  font: inherit;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color var(--ets-motion-fast, 120ms) ease, box-shadow var(--ets-motion-fast, 120ms) ease;
}

:deep(textarea.auth-input) {
  height: auto;
  min-height: 80px;
  padding: 10px 12px;
  line-height: 1.5;
  resize: vertical;
}

:deep(.auth-input:focus) {
  outline: none;
  border-color: var(--ets-focus-ring);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ets-focus-ring) 25%, transparent);
}

:deep(.auth-submit-btn) {
  width: 100%;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
  border: 0;
  border-radius: var(--ets-radius-md, 8px);
  background: var(--ets-brand, #0f6cbd);
  color: #ffffff;
  font: inherit;
  font-size: 14.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--ets-shadow-sm, 0 2px 8px rgba(15, 108, 189, 0.25));
  transition: background var(--ets-motion-fast, 120ms) ease, transform 60ms ease, opacity var(--ets-motion-fast, 120ms) ease;
}

:deep(.auth-submit-btn:hover:not(:disabled)) {
  background: var(--ets-brand-hover, #115ea3);
}

:deep(.auth-submit-btn:active:not(:disabled)) {
  transform: scale(0.99);
}

:deep(.auth-submit-btn:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

:deep(.auth-aux-row) {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
  width: 100%;
}

:deep(.auth-aux-link) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0;
  padding: 4px 8px;
  color: var(--ets-brand, #0f6cbd);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  border-radius: var(--ets-radius-sm, 6px);
  transition: color var(--ets-motion-fast, 120ms) ease, background var(--ets-motion-fast, 120ms) ease;
}

:deep(.auth-aux-link:hover) {
  background: var(--ets-hover);
  color: var(--ets-brand-hover, #115ea3);
}

/* Ensure any embedded Naive UI input in auth-card adheres to the exact same HIG dimensions */
:deep(.n-input) {
  border-radius: var(--ets-radius-md, 8px) !important;
}
:deep(.n-input.n-input--large-type) {
  min-height: 42px !important;
}

.auth-footer {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--ets-divider, var(--ets-border));
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
