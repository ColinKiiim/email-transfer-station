<script setup>
import { ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'

import AppUtilityMenu from '../../components/AppUtilityMenu.vue'

import { formatBadgeCount } from '../admin-formatters'
import {
    ICON_SHAPES as iconShapes,
    NAV_GROUPS as navGroups,
} from '../admin-view-config'

defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t } = useScopedI18n('admin.shell')
const { t: tNav } = useScopedI18n('admin.nav')

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
        <aside class="sidebar" :aria-label="t('mainNav')">
            <div class="brand">
                <button class="sidebar-toggle" type="button"
                    :aria-label="model.sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')"
                    :aria-expanded="(!model.sidebarCollapsed).toString()" @click="actions.toggleSidebar">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <component :is="shape.tag" v-for="(shape, index) in shapeList('menu')" :key="index"
                            v-bind="shape.attrs" />
                    </svg>
                </button>
                <div class="brand-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M3.5 6.5h17v11h-17z" />
                        <path d="m4 7 8 6 8-6" />
                    </svg>
                </div>
                <div class="brand-title">Email Transfer<span>station admin</span></div>
            </div>

            <nav class="nav-scroll">
                <section v-for="group in navGroups" :key="group.label" class="nav-group">
                    <div class="nav-group-title">{{ tNav(group.labelKey) }}</div>
                    <button v-for="item in group.items" :key="item.id" class="nav-link"
                        :class="{ 'is-active': model.activeView === item.id }" type="button"
                        :title="model.sidebarCollapsed ? tNav(item.id) : ''"
                        :aria-current="model.activeView === item.id ? 'page' : undefined"
                        :aria-label="tNav(item.id)" @click="actions.setView(item.id)">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <component :is="shape.tag" v-for="(shape, index) in shapeList(item.icon)" :key="index"
                                v-bind="shape.attrs" />
                        </svg>
                        <span class="nav-text">{{ tNav(item.id) }}</span>
                        <span v-if="model.navBadges[item.badgeKey]?.value" class="nav-badge"
                            :aria-label="model.navBadges[item.badgeKey].label">
                            {{ formatBadgeCount(model.navBadges[item.badgeKey].value) }}
                        </span>
                        <span v-else-if="model.navBadges[item.badgeKey]?.dot" class="nav-dot"
                            :aria-label="model.navBadges[item.badgeKey].label"></span>
                    </button>
                </section>
            </nav>

            <div class="sidebar-foot">
                <span class="health-dot">Worker / D1 {{ model.workerStatusLabel }}</span>
                <span class="mono">DB_VERSION {{ model.dbVersionLabel }}</span>
            </div>
        </aside>

        <main class="workspace">
            <header class="topbar">
                <div class="page-title">
                    <h1>{{ tNav(model.activeView) }}</h1>
                </div>

                <div class="topbar-controls">
                    <select v-model="model.ui.domain" class="select domain-select" :aria-label="t('domainScope')"
                        @change="actions.changeDomain">
                        <option v-for="domain in model.domainOptions" :key="domain" :value="domain">
                            {{ domain === 'all' ? t('allDomains') : domain }}
                        </option>
                    </select>

                    <label class="searchbox">
                        <svg viewBox="0 0 24 24">
                            <component :is="shape.tag" v-for="(shape, index) in shapeList('search')" :key="index"
                                v-bind="shape.attrs" />
                        </svg>
                        <input ref="searchInput" v-model="model.ui.query" class="field"
                            :placeholder="t('searchPlaceholder')"
                            @input="actions.updateSearch" />
                        <span class="kbd">⌘K</span>
                    </label>

                    <div class="top-actions">
                        <AppUtilityMenu />
                        <span class="sync-state" :class="{ 'is-loading': model.ui.syncing }" role="status" aria-live="polite">
                            {{ model.syncLabel }}
                        </span>
                        <button class="btn" type="button" @click="actions.resetAdminLogin">{{ t('signOut') }}</button>
                        <button class="btn" type="button" @click="actions.handleAction('refresh')">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <component :is="shape.tag" v-for="(shape, index) in shapeList('refresh')" :key="index"
                                    v-bind="shape.attrs" />
                            </svg>
                            {{ t('sync') }}
                        </button>
                    </div>
                </div>
            </header>

            <slot />
        </main>

        <slot name="overlays" />
    </div>
</template>
