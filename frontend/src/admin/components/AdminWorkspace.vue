<script setup>
import { ref } from 'vue'

import { statusClass } from '../admin-formatters'
import { ICON_SHAPES as iconShapes } from '../admin-view-config'
import AdminMailWorkspace from './AdminMailWorkspace.vue'
import AdminResourceWorkspace from './AdminResourceWorkspace.vue'
import AdminViewFeedback from './AdminViewFeedback.vue'

defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const mailWorkspace = ref(null)
const shapeList = (name) => iconShapes[name] || iconShapes.check

defineExpose({
    scrollMailToTop: () => mailWorkspace.value?.scrollToTop?.(),
})
</script>

<template>
    <section class="view" :aria-busy="model.ui.syncing ? 'true' : 'false'" aria-live="polite">
        <div v-if="model.activeView === 'overview'" class="state-band" aria-label="运行状态">
            <div v-for="card in model.stateCards" :key="card.label" class="state-card"
                :class="{ warn: card.tone === 'warn', error: card.tone === 'danger' }">
                <strong>{{ card.value }}</strong>
                <span>{{ card.label }}</span>
            </div>
        </div>

        <div v-if="model.toolbarActions.length" class="toolbar">
            <button v-for="action in model.toolbarActions" :key="action.label" type="button" class="btn"
                :class="{ primary: action.primary, danger: action.danger }"
                :disabled="!!model.actionBusy"
                @click="action.modal ? actions.openActionModal(action.modal) : actions.handleAction(action.action)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <component :is="shape.tag" v-for="(shape, index) in shapeList(action.icon)" :key="index"
                        v-bind="shape.attrs" />
                </svg>
                {{ action.label }}
            </button>
            <select v-if="model.activeStatusOptions.length" :value="model.activeStatusValue" class="select"
                @change="actions.changeStatus($event.target.value)">
                <option v-for="option in model.activeStatusOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                </option>
            </select>
            <button v-if="model.hasActiveFilters" class="btn" type="button"
                @click="actions.handleAction('reset-filters')">清除筛选</button>
        </div>

        <AdminViewFeedback :syncing="model.ui.syncing" :errors="model.pageLoadErrors"
            :show-errors="model.showAdminPage" @retry="actions.handleAction('refresh')" />

        <div v-if="model.activeView === 'ops'" class="ops-boundary-strip" aria-label="运行边界">
            <div v-for="item in model.opsBoundaryItems" :key="item.label" class="ops-boundary-item">
                <span>{{ item.label }}</span>
                <strong class="status" :class="statusClass(item.value)">{{ item.value }}</strong>
            </div>
        </div>

        <AdminMailWorkspace v-if="model.activeView === 'flow'" ref="mailWorkspace"
            :model="model" :actions="actions" />
        <AdminResourceWorkspace v-else :model="model" :actions="actions" />
    </section>
</template>
