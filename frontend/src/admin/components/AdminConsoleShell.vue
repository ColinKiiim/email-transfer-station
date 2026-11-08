<script setup>
import { computed, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import AppShell from '../../components/AppShell.vue'
import AppUtilityMenu from '../../components/AppUtilityMenu.vue'
import ProductSurfaceLinks from '../../components/ProductSurfaceLinks.vue'
import { getRouterPathWithLang } from '../../utils'

import { formatBadgeCount, formatNumber } from '../admin-formatters'
import {
    ICON_SHAPES as iconShapes,
    NAV_GROUPS as navGroups,
} from '../admin-view-config'

const props = defineProps({
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

const shellNavGroups = computed(() => navGroups.map((group) => ({
    id: group.labelKey,
    label: tNav(group.labelKey),
    items: group.items.map((item) => {
        const badge = props.model.navBadges[item.badgeKey]
        return {
            id: item.id,
            label: tNav(item.id),
            icon: shapeList(item.icon),
            badge: badge?.value
                ? (props.model.sidebarCollapsed ? formatBadgeCount(badge.value) : formatNumber(badge.value))
                : '',
            badgeLabel: badge?.label,
            dot: !badge?.value && !!badge?.dot,
        }
    }),
})))
const searchInput = ref(null)

defineExpose({
    focusSearch: () => searchInput.value?.focus?.(),
})
</script>

<template>
    <AppShell class="admin-next" :class="{ 'is-flow-view': model.activeView === 'flow' }"
        :nav-groups="shellNavGroups" :active-id="model.pendingView || model.activeView"
        :collapsed="model.sidebarCollapsed" brand-title="ETS Mail" :nav-label="t('mainNav')"
        :toggle-label="model.sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')"
        @select="actions.setView" @toggle-sidebar="actions.toggleSidebar">
        <template #search>
            <h1 class="sr-only">{{ tNav(model.activeView) }}</h1>
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
        </template>

        <template #actions>
            <ProductSurfaceLinks :items="surfaceItems" :aria-label="t('surfaceLinksLabel')" />
            <AppUtilityMenu />
            <div class="shell-divider" role="separator"></div>
            <span class="sync-state sr-only" :class="{ 'is-loading': model.ui.syncing }" role="status" aria-live="polite">
                {{ model.syncLabel }}
            </span>
            <button class="shell-btn is-bordered" type="button" :aria-label="t('sync')"
                @click="actions.handleAction('refresh')">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <component :is="shape.tag" v-for="(shape, index) in shapeList('refresh')" :key="index"
                        v-bind="shape.attrs" />
                </svg>
                <span class="shell-btn-label">{{ t('sync') }}</span>
            </button>
            <button class="shell-btn is-destructive" type="button" :aria-label="t('signOut')"
                @click="actions.resetAdminLogin">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                    <path d="M10 17l-5-5 5-5M5 12h11" />
                </svg>
                <span class="shell-btn-label">{{ t('signOut') }}</span>
            </button>
        </template>

        <template #sidebar-footer>
            <div class="admin-health"
                :title="`${t('serviceStatus', { status: model.workerStatusLabel })} · ${t('versionLabel', { version: model.dbVersionLabel })}`">
                <span class="health-dot" :class="`health-dot--${model.workerStatusTone || 'neutral'}`">
                    {{ t('serviceStatus', { status: model.workerStatusLabel }) }}
                </span>
                <span class="mono">{{ t('versionLabel', { version: model.dbVersionLabel }) }}</span>
            </div>
        </template>

        <slot />

        <template #overlays>
            <slot name="overlays" />
        </template>
    </AppShell>
</template>
