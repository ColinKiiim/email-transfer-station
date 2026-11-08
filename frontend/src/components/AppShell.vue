<script setup>
/*
 * The one application frame shared by every signed-in surface: the admin
 * console, the user workspace and the shared-inbox link.
 *
 * Layout (HIG sidebar + toolbar pattern):
 * - a top bar with the sidebar toggle and brand on the leading side, an
 *   optional search field, and window-level actions on the trailing side;
 * - a sidebar with at most two levels (group title → item) that collapses to
 *   an icon rail with a pointer and becomes a drawer on narrow screens;
 * - one workspace card that owns the page content.
 */
import { computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'

import ProductBrand from './ProductBrand.vue'
import '../styles/app-shell.css'

const props = defineProps({
    // [{ id, label?, items: [{ id, label, icon: shapes|paths, badge?, badgeLabel?, dot? }] }]
    navGroups: { type: Array, default: () => [] },
    activeId: { type: String, default: '' },
    collapsed: { type: Boolean, default: false },
    brandTitle: { type: String, default: '' },
    brandContext: { type: String, default: '' },
    navLabel: { type: String, default: 'Navigation' },
    toggleLabel: { type: String, default: 'Toggle sidebar' },
})

const emit = defineEmits(['select', 'toggle-sidebar'])

const slots = useSlots()
const hasSearch = computed(() => !!slots.search)
const hasNav = computed(() => props.navGroups.some((group) => group.items?.length))
const drawerOpen = ref(false)
const narrow = ref(false)
let mediaQuery = null

const syncNarrow = () => {
    narrow.value = !!mediaQuery?.matches
    if (!narrow.value) drawerOpen.value = false
}

onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mediaQuery = window.matchMedia('(max-width: 900px)')
    syncNarrow()
    mediaQuery.addEventListener?.('change', syncNarrow)
})

onBeforeUnmount(() => {
    mediaQuery?.removeEventListener?.('change', syncNarrow)
})

// The drawer is a modal layer on narrow screens; Escape closes it.
const onKeydown = (event) => {
    if (event.key === 'Escape' && drawerOpen.value) drawerOpen.value = false
}
watch(drawerOpen, (open) => {
    if (typeof window === 'undefined') return
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener?.('keydown', onKeydown))

const toggle = () => {
    if (narrow.value) {
        drawerOpen.value = !drawerOpen.value
        return
    }
    emit('toggle-sidebar')
}

const select = (id) => {
    drawerOpen.value = false
    emit('select', id)
}

// Icons come either as admin icon shapes ({ tag, attrs }) or as plain SVG path strings.
const shapesFor = (icon) => (icon || []).map((shape) => (
    typeof shape === 'string' ? { tag: 'path', attrs: { d: shape } } : shape
))

const isCollapsed = computed(() => props.collapsed && !narrow.value)
</script>

<template>
    <div class="ets-shell" :class="{
        'has-nav': hasNav,
        'has-search': hasSearch,
        'is-sidebar-collapsed': isCollapsed,
        'is-drawer-open': drawerOpen,
    }">
        <div class="shell-chrome">
            <div class="shell-brand">
                <button v-if="hasNav" class="shell-sidebar-toggle" type="button" :aria-label="toggleLabel"
                    :aria-expanded="(narrow ? drawerOpen : !collapsed).toString()" @click="toggle">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                </button>
                <ProductBrand class="shell-product-brand" :title="brandTitle" :context-label="brandContext" />
            </div>

            <header class="shell-topbar">
                <div v-if="hasSearch" class="shell-search">
                    <slot name="search" />
                </div>
                <div class="shell-actions top-actions">
                    <slot name="actions" />
                </div>
            </header>
        </div>

        <div v-if="hasNav" class="shell-scrim" aria-hidden="true" @click="drawerOpen = false"></div>

        <aside v-if="hasNav" class="shell-sidebar" :aria-label="navLabel">
            <nav class="shell-nav">
                <section v-for="group in navGroups" :key="group.id || group.label" class="shell-nav-group">
                    <div v-if="group.label" class="shell-nav-group-title">{{ group.label }}</div>
                    <button v-for="item in group.items" :key="item.id" class="shell-nav-link"
                        :class="{ 'is-active': activeId === item.id }" type="button"
                        :title="isCollapsed ? item.label : ''"
                        :aria-current="activeId === item.id ? 'page' : undefined"
                        :aria-label="item.label" @click="select(item.id)">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <component :is="shape.tag" v-for="(shape, index) in shapesFor(item.icon)" :key="index"
                                v-bind="shape.attrs" />
                        </svg>
                        <span class="shell-nav-text">{{ item.label }}</span>
                        <span v-if="item.badge" class="shell-nav-badge" :aria-label="item.badgeLabel || undefined">
                            {{ item.badge }}
                        </span>
                        <span v-else-if="item.dot" class="shell-nav-dot" :aria-label="item.badgeLabel || undefined"></span>
                    </button>
                </section>
            </nav>

            <div v-if="$slots['sidebar-footer']" class="shell-sidebar-foot">
                <slot name="sidebar-footer" />
            </div>
        </aside>

        <main class="shell-workspace">
            <slot />
        </main>

        <slot name="overlays" />
    </div>
</template>
