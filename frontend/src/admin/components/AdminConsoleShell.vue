<script setup>
import { computed, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import AppUtilityMenu from '../../components/AppUtilityMenu.vue'
import ProductBrand from '../../components/ProductBrand.vue'
import ProductSurfaceLinks from '../../components/ProductSurfaceLinks.vue'
import { getRouterPathWithLang } from '../../utils'

import { formatBadgeCount, formatNumber } from '../admin-formatters'
import {
    ICON_SHAPES as iconShapes,
    NAV_GROUPS as navGroups,
} from '../admin-view-config'

defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t, locale } = useScopedI18n('admin.shell')
const { t: tNav } = useScopedI18n('admin.nav')

const surfaceItems = computed(() => [
    { id: 'home', label: t('home'), to: getRouterPathWithLang('/', locale.value) },
    { id: 'user', label: t('userView'), to: getRouterPathWithLang('/user', locale.value) },
])

const searchShortcut = computed(() => {
    if (typeof navigator !== 'undefined') {
        const platform = navigator.platform || navigator.userAgent || ''
        if (/Mac/i.test(platform)) {
            return '⌘K'
        }
    }
    return 'Ctrl+K'
})

const shapeList = (name) => iconShapes[name] || iconShapes.check
const searchInput = ref(null)

defineExpose({
    focusSearch: () => searchInput.value?.focus?.(),
})
</script>

<template>
    <div class="admin-next app" :class="{
        'is-flow-view': model.activeView === 'flow',
        'is-sidebar-collapsed': model.sidebarCollapsed,
    }">
        <div class="app-chrome">
            <div class="brand">
                <button class="sidebar-toggle" type="button"
                    :aria-label="model.sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')"
                    :aria-expanded="(!model.sidebarCollapsed).toString()" @click="actions.toggleSidebar">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <component :is="shape.tag" v-for="(shape, index) in shapeList('menu')" :key="index"
                            v-bind="shape.attrs" />
                    </svg>
                </button>
                <ProductBrand class="admin-product-brand" title="ETS Mail" />
            </div>

            <header class="topbar">
                <h1 class="sr-only">{{ tNav(model.activeView) }}</h1>

                <div class="topbar-controls">
                    <div class="topbar-search-wrap">
                        <label class="searchbox">
                            <svg viewBox="0 0 24 24">
                                <component :is="shape.tag" v-for="(shape, index) in shapeList('search')" :key="index"
                                    v-bind="shape.attrs" />
                            </svg>
                            <input ref="searchInput" v-model="model.ui.query" class="field"
                                :placeholder="t('searchPlaceholder')"
                                @input="actions.updateSearch" />
                            <span class="kbd">{{ searchShortcut }}</span>
                        </label>
                        <transition name="loading-pill-fade">
                            <div v-if="model.isNavigating || model.ui.syncing" class="gmail-loading-pill" role="status" aria-live="polite">
                                {{ t('loading') }}
                            </div>
                        </transition>
                    </div>

                    <div class="top-actions">
                        <ProductSurfaceLinks :items="surfaceItems" :aria-label="t('surfaceLinksLabel')" />
                        <AppUtilityMenu />
                        <div class="topbar-divider" role="separator"></div>
                        <span class="sync-state sr-only" :class="{ 'is-loading': model.ui.syncing }" role="status" aria-live="polite">
                            {{ model.syncLabel }}
                        </span>
                        <div class="topbar-action-group">
                            <button class="btn btn-sync" type="button" @click="actions.handleAction('refresh')">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <component :is="shape.tag" v-for="(shape, index) in shapeList('refresh')" :key="index"
                                        v-bind="shape.attrs" />
                                </svg>
                                {{ t('sync') }}
                            </button>
                            <button class="btn btn-signout" type="button" @click="actions.resetAdminLogin">{{ t('signOut') }}</button>
                        </div>
                    </div>
                </div>
            </header>
        </div>

        <aside class="sidebar" :aria-label="t('mainNav')">
            <nav class="nav-scroll">
                <section v-for="group in navGroups" :key="group.label" class="nav-group">
                    <div class="nav-group-title">{{ tNav(group.labelKey) }}</div>
                    <button v-for="item in group.items" :key="item.id" class="nav-link"
                        :class="{ 'is-active': (model.pendingView || model.activeView) === item.id }" type="button"
                        :title="model.sidebarCollapsed ? tNav(item.id) : ''"
                        :aria-current="(model.pendingView || model.activeView) === item.id ? 'page' : undefined"
                        :aria-label="tNav(item.id)" @click="actions.setView(item.id)">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <component :is="shape.tag" v-for="(shape, index) in shapeList(item.icon)" :key="index"
                                v-bind="shape.attrs" />
                        </svg>
                        <span class="nav-text">{{ tNav(item.id) }}</span>
                        <span v-if="model.navBadges[item.badgeKey]?.value" class="nav-badge"
                            :aria-label="model.navBadges[item.badgeKey].label">
                            {{ model.sidebarCollapsed ? formatBadgeCount(model.navBadges[item.badgeKey].value) : formatNumber(model.navBadges[item.badgeKey].value) }}
                        </span>
                        <span v-else-if="model.navBadges[item.badgeKey]?.dot" class="nav-dot"
                            :aria-label="model.navBadges[item.badgeKey].label"></span>
                    </button>
                </section>
            </nav>

            <div class="sidebar-foot"
                :title="`${t('serviceStatus', { status: model.workerStatusLabel })} · ${t('versionLabel', { version: model.dbVersionLabel })}`">
                <span class="health-dot" :class="`health-dot--${model.workerStatusTone || 'neutral'}`">
                    <span class="foot-text">{{ t('serviceStatus', { status: model.workerStatusLabel }) }}</span>
                </span>
                <span class="mono foot-text">{{ t('versionLabel', { version: model.dbVersionLabel }) }}</span>
            </div>
        </aside>

        <main class="workspace">
            <slot />
        </main>

        <slot name="overlays" />
    </div>
</template>
