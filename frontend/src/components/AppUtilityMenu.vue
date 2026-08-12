<script setup>
/**
 * Theme and language controls for the full-screen surfaces.
 *
 * `/admin`, `/user` and `/i/:token` set `meta.fullScreen`, which suppresses
 * `views/Header.vue` — and Header was the only place in the product that
 * carried the dark-mode toggle and the language picker. A visitor whose OS is
 * in dark mode therefore landed on those pages in dark mode with no way to
 * change either setting.
 *
 * Written against the design tokens rather than Naive UI so it sits correctly
 * inside both the admin console shell and the access shell.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useGlobalState } from '../store'
import { getLocaleLabel, SUPPORTED_LOCALES } from '../i18n/locale-registry'
import { isSupportedLocale, replaceLocaleInFullPath } from '../i18n/utils'
import { useScopedI18n } from '@/i18n/app'

const { isDark, toggleDark, preferredLocale } = useGlobalState()
const { t, locale } = useScopedI18n('components.AppUtilityMenu')
const route = useRoute()
const router = useRouter()

const open = ref(false)
const root = ref(null)

const languages = SUPPORTED_LOCALES.map((value) => ({ value, label: getLocaleLabel(value) }))
const currentLanguage = computed(() => getLocaleLabel(isSupportedLocale(locale.value) ? locale.value : 'zh'))

const close = () => { open.value = false }

const onDocumentPointerDown = (event) => {
    if (root.value && !root.value.contains(event.target)) close()
}
const onDocumentKeydown = (event) => {
    if (event.key === 'Escape') close()
}

const toggle = () => {
    open.value = !open.value
    if (open.value) {
        document.addEventListener('pointerdown', onDocumentPointerDown)
        document.addEventListener('keydown', onDocumentKeydown)
    } else {
        document.removeEventListener('pointerdown', onDocumentPointerDown)
        document.removeEventListener('keydown', onDocumentKeydown)
    }
}

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onDocumentKeydown)
})

const switchTheme = () => {
    toggleDark()
    close()
}

const switchLanguage = async (value) => {
    close()
    if (!isSupportedLocale(value) || value === locale.value) return
    const target = replaceLocaleInFullPath(route.fullPath, value)
    try {
        await router.push({ path: target, force: true })
        preferredLocale.value = value
    } catch (error) {
        console.error('Failed to switch locale', error)
    }
}
</script>

<template>
    <div ref="root" class="utility-menu">
        <button type="button" class="utility-trigger" :aria-expanded="open.toString()" aria-haspopup="menu"
            :aria-label="t('settings')" @click="toggle">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
        </button>

        <div v-if="open" class="utility-panel" role="menu">
            <button type="button" class="utility-item" role="menuitem" @click="switchTheme">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path v-if="isDark" d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M18 6l1.5-1.5M4.5 19.5 6 18" />
                    <circle v-if="isDark" cx="12" cy="12" r="4" />
                    <path v-else d="M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z" />
                </svg>
                <span>{{ isDark ? t('lightMode') : t('darkMode') }}</span>
            </button>

            <div class="utility-separator" role="separator"></div>
            <div class="utility-label">{{ t('language') }}</div>
            <button v-for="item in languages" :key="item.value" type="button" class="utility-item" role="menuitemradio"
                :aria-checked="(item.label === currentLanguage).toString()" @click="switchLanguage(item.value)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path v-if="item.label === currentLanguage" d="m5 12 4 4L19 6" />
                </svg>
                <span>{{ item.label }}</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.utility-menu {
    position: relative;
    display: inline-flex;
}

.utility-trigger {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: var(--ets-radius-sm);
    background: transparent;
    color: var(--ets-text-muted);
    cursor: pointer;
    transition: background-color var(--ets-motion-fast) var(--ets-motion-ease);
}

.utility-trigger:hover {
    background: var(--ets-hover);
    color: var(--ets-text);
}

.utility-trigger:focus-visible,
.utility-item:focus-visible {
    outline: 2px solid var(--ets-focus-ring);
    outline-offset: 2px;
}

.utility-trigger svg,
.utility-item svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.utility-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 80;
    display: grid;
    gap: 2px;
    min-width: 184px;
    border-radius: var(--ets-radius-md);
    padding: 6px;
    background: var(--ets-surface);
    box-shadow: var(--ets-shadow-overlay);
}

.utility-item {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 34px;
    border: 0;
    border-radius: var(--ets-radius-sm);
    padding: 0 8px;
    background: transparent;
    color: var(--ets-text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
}

.utility-item:hover {
    background: var(--ets-hover);
}

.utility-separator {
    height: 1px;
    margin: 4px 2px;
    background: var(--ets-border);
}

.utility-label {
    padding: 4px 8px 2px;
    color: var(--ets-text-subtle);
    font-size: 11px;
    font-weight: 700;
}
</style>
