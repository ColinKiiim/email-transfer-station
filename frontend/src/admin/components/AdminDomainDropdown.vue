<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
    selectedDomain: { type: String, default: 'all' },
    allLabel: { type: String, required: true },
    allCount: { type: [String, Number], required: true },
    domains: { type: Array, default: () => [] },
})

const emit = defineEmits(['select'])
const root = ref(null)
const isOpen = ref(false)

const isAllSelected = computed(() => !props.selectedDomain || props.selectedDomain === 'all')

const select = (domain) => {
    emit('select', domain)
    isOpen.value = false
}

const handleClickOutside = (event) => {
    if (isOpen.value && root.value && !root.value.contains(event.target)) {
        isOpen.value = false
    }
}

const handleKeydown = (event) => {
    if (event.key === 'Escape') {
        isOpen.value = false
    }
}

onMounted(() => {
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('click', handleClickOutside)
    window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <div ref="root" class="domain-filter-wrapper">
        <button type="button" class="filter-chip domain-chip"
            :class="{ 'is-active': !isAllSelected }"
            :aria-expanded="isOpen"
            @click.stop="isOpen = !isOpen">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" x2="22" y1="12" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>{{ isAllSelected ? allLabel : selectedDomain }}</span>
            <span class="dropdown-arrow" aria-hidden="true">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </span>
        </button>
        <div v-show="isOpen" class="domain-dropdown-menu">
            <button type="button" class="domain-option" :class="{ 'is-selected': isAllSelected }"
                @click="select('all')">
                <span class="domain-option-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" x2="22" y1="12" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    {{ allLabel }}
                </span>
                <b class="domain-count-badge">{{ allCount }}</b>
            </button>
            <button v-for="domain in domains" :key="domain.domain" type="button"
                class="domain-option" :class="{ 'is-selected': selectedDomain === domain.domain }"
                @click="select(domain.domain)">
                <span class="domain-option-label">
                    <span class="domain-at">@</span>
                    {{ domain.domain }}
                </span>
                <b class="domain-count-badge">{{ domain.count }}</b>
            </button>
        </div>
    </div>
</template>
