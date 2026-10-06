<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalState } from '../store'
import { getRouterPathWithLang } from '../utils'
import { useScopedI18n } from '@/i18n/app'
import ProductBrand from './ProductBrand.vue'
import ProductSurfaceLinks from './ProductSurfaceLinks.vue'
import AppUtilityMenu from './AppUtilityMenu.vue'

const props = defineProps({
  contextLabel: {
    type: String,
    default: undefined,
  },
})

const {
  isTelegram,
  showAdminPage,
  openSettings,
  preferredLocale,
} = useGlobalState()

const { t, locale } = useScopedI18n('components.AppTopbar')
const route = useRoute()
const router = useRouter()

const PRODUCT_TITLE = 'Email Transfer Station'

const showUserEntry = computed(() => !isTelegram.value)

const surfaceItems = computed(() => {
  const currentPath = route?.path || ''
  const items = [
    {
      id: 'home',
      label: t('home'),
      to: getRouterPathWithLang('/', locale.value),
    },
  ]
  if (showUserEntry.value) {
    items.push({
      id: 'user',
      label: t('user'),
      to: getRouterPathWithLang('/user', locale.value),
    })
  }
  if (showAdminPage.value) {
    items.push({
      id: 'admin',
      label: t('admin'),
      to: getRouterPathWithLang('/admin', locale.value),
    })
  }
  return items
})

const resolvedContextLabel = computed(() => {
  if (props.contextLabel !== undefined) return props.contextLabel
  const currentPath = route?.path || ''
  if (currentPath.includes('/admin') && showAdminPage.value) return t('admin')
  if (currentPath.includes('/i/') || currentPath.includes('/a/')) return t('share')
  return ''
})

let logoClickCount = 0
let logoTimer = null

const onLogoClick = async () => {
  logoClickCount++
  if (logoTimer) clearTimeout(logoTimer)
  logoTimer = setTimeout(() => {
    logoClickCount = 0
  }, 3000)

  if (logoClickCount >= 5) {
    logoClickCount = 0
    if (router?.push) {
      await router.push(getRouterPathWithLang('/admin', locale.value))
    }
    return
  }

  if (route?.path && route.path !== '/' && route.path !== `/${locale.value}/` && route.path !== `/${locale.value}`) {
    if (router?.push) {
      await router.push(getRouterPathWithLang('/', locale.value))
    }
  }
}
</script>

<template>
  <div class="header-container">
    <header class="app-topbar login-topbar">
      <button
        type="button"
        class="header-brand-button"
        :aria-label="openSettings?.title || PRODUCT_TITLE"
        @click="onLogoClick"
      >
        <ProductBrand class="header-product-brand" compact :context-label="resolvedContextLabel" />
      </button>

      <div class="header-top-actions">
        <ProductSurfaceLinks :items="surfaceItems" :aria-label="t('surfaces')" />
        <AppUtilityMenu />
      </div>
    </header>
  </div>
</template>

<style scoped>
.header-container {
  width: 100%;
  height: var(--ets-header-height, 56px);
  min-height: var(--ets-header-height, 56px);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}

.app-topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: var(--ets-header-height, 56px);
  min-height: var(--ets-header-height, 56px);
  flex-shrink: 0;
  padding: 0 16px;
  background: var(--ets-glass-bg, var(--ets-surface));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--ets-border);
  box-sizing: border-box;
  transition: background-color var(--ets-motion-base), border-color var(--ets-motion-base);
}

@media (min-width: 768px) {
  .app-topbar {
    padding: 0 20px;
  }
}

.header-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-brand-button {
  display: block;
  max-width: min(360px, 45vw);
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.header-brand-button:focus-visible {
  border-radius: var(--ets-radius-sm);
  outline: 2px solid var(--ets-focus-ring);
  outline-offset: 3px;
}

.header-product-brand {
  max-width: 100%;
}
</style>
