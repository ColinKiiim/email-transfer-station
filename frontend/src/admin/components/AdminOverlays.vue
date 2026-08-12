<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { useScopedI18n } from '@/i18n/app'

import { statusClass } from '../admin-formatters'

const props = defineProps({
    model: { type: Object, required: true },
    actions: { type: Object, required: true },
})

const { t } = useScopedI18n('admin.overlay')

const detailDialog = ref(null)
const domainDialog = ref(null)
const actionDialog = ref(null)
let previousFocus = null

const activeOverlay = computed(() => {
    if (props.model.actionModal) return `action:${props.model.actionModal}`
    if (props.model.domainActivationOpen) return 'domain'
    if (props.model.detailOpen) return 'detail'
    return ''
})

const activeDialog = () => {
    if (activeOverlay.value.startsWith('action:')) return actionDialog.value
    if (activeOverlay.value === 'domain') return domainDialog.value
    if (activeOverlay.value === 'detail') return detailDialog.value
    return null
}

const focusableSelector = [
    '[data-autofocus]',
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

const focusActiveOverlay = async () => {
    await nextTick()
    const dialog = activeDialog()
    const target = dialog?.querySelector?.('[data-autofocus]')
        || dialog?.querySelector?.(focusableSelector)
        || dialog
    target?.focus?.()
}

watch(activeOverlay, async (value, previous) => {
    if (value && !previous) previousFocus = document.activeElement
    if (value) {
        await focusActiveOverlay()
        return
    }
    if (previous) {
        await nextTick()
        previousFocus?.focus?.()
        previousFocus = null
    }
})

const handleOverlayKeydown = (event, close, dialog) => {
    if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialog?.querySelectorAll?.(focusableSelector) || [])]
        .filter((element) => !element.hasAttribute('disabled'))
    if (focusable.length === 0) {
        event.preventDefault()
        dialog?.focus?.()
        return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
    }
}

onBeforeUnmount(() => {
    previousFocus?.focus?.()
})
</script>

<template>
    <div v-if="model.detailOpen" ref="detailDialog" class="detail-drawer-backdrop" role="dialog" aria-modal="true"
        aria-labelledby="detail-drawer-title" aria-describedby="detail-drawer-description" tabindex="-1"
        @click.self="actions.closeDetail"
        @keydown="handleOverlayKeydown($event, actions.closeDetail, detailDialog)">
        <aside class="detail-drawer" tabindex="-1" :aria-label="t('detailDrawerLabel')">
            <div class="modal-head">
                <div>
                    <h2 id="detail-drawer-title">{{ model.currentRail.title }}</h2>
                    <p id="detail-drawer-description">{{ model.currentRail.subtitle }}</p>
                </div>
                <button class="icon-btn" type="button" :aria-label="t('closeDetail')" @click="actions.closeDetail">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
            </div>
            <div class="inner-pad detail-drawer-body">
                <div v-if="model.currentRail.tags?.length" class="tag-row rail-tags">
                    <span v-for="tag in model.currentRail.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
                <dl v-if="model.currentRail.kv" class="kv">
                    <template v-for="item in model.currentRail.kv" :key="item[0]">
                        <dt>{{ item[0] }}</dt>
                        <dd>
                            <span v-if="item[2] === 'status'" class="status"
                                :class="statusClass(item[1])">{{ item[1] }}</span>
                            <span v-else>{{ item[1] }}</span>
                        </dd>
                    </template>
                </dl>
                <p v-if="model.currentRail.body" class="quoted">{{ model.currentRail.body }}</p>
                <div v-if="model.currentRail.actions" class="tag-row rail-actions">
                    <button v-for="action in model.currentRail.actions" :key="action.label" type="button" class="btn"
                        :class="{ primary: action.primary, danger: action.danger }"
                        :disabled="!!model.actionBusy" @click="actions.runRailAction(action)">
                        {{ action.label }}
                    </button>
                </div>
                <div v-if="model.currentRail.alerts" class="timeline">
                    <div v-for="risk in model.currentRail.alerts" :key="risk.id" class="timeline-row">
                        <span class="mono">{{ risk.level }}</span>
                        <div>
                            <strong>{{ risk.title }}</strong>
                            <div class="cell-sub">{{ risk.detail }}</div>
                        </div>
                        <span class="status" :class="statusClass(risk.status)">{{ risk.status }}</span>
                    </div>
                </div>
            </div>
        </aside>
    </div>

    <div v-if="model.domainActivationOpen" ref="domainDialog" class="modal-backdrop is-open" role="dialog"
        aria-modal="true" aria-labelledby="domain-activation-title" aria-describedby="domain-activation-description"
        tabindex="-1" @click.self="actions.closeDomainActivation"
        @keydown="handleOverlayKeydown($event, actions.closeDomainActivation, domainDialog)">
        <form class="modal domain-activation-modal" :aria-busy="model.domainActivationBusy ? 'true' : 'false'"
            @submit.prevent="actions.createAndActivateDomain">
            <div class="modal-head">
                <div>
                    <h2 id="domain-activation-title">{{ t('domainActivationTitle') }}</h2>
                    <p>{{ model.domainActivationForm.receiveMode === 'cloudflare_email' ? t('cloudflareSubtitle') : t('improvmxSubtitle') }}</p>
                </div>
                <button class="icon-btn" type="button" :aria-label="t('close')" @click="actions.closeDomainActivation">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="activation-tabs" role="tablist" :aria-label="t('activationTabsLabel')">
                    <button type="button" class="btn"
                        :class="{ primary: model.domainActivationForm.receiveMode === 'cloudflare_email' }"
                        @click="model.domainActivationForm.receiveMode = 'cloudflare_email'">
                        Cloudflare
                    </button>
                    <button type="button" class="btn"
                        :class="{ primary: model.domainActivationForm.receiveMode === 'improvmx_forward' }"
                        @click="model.domainActivationForm.receiveMode = 'improvmx_forward'">
                        ImprovMX
                    </button>
                </div>
                <div class="form-grid">
                    <label class="form-field full">
                        <span>{{ t('domain') }}</span>
                        <input v-model="model.domainActivationForm.domain" data-autofocus class="field"
                            placeholder="example.com" autocomplete="off" />
                    </label>
                    <label class="form-field">
                        <span>{{ t('displayLabel') }}</span>
                        <input v-model="model.domainActivationForm.displayLabel" class="field" :placeholder="t('optionalPlaceholder')"
                            autocomplete="off" />
                    </label>
                    <label v-if="model.domainActivationForm.receiveMode === 'cloudflare_email'" class="form-field">
                        <span>Cloudflare Zone ID</span>
                        <input v-model="model.domainActivationForm.cloudflareZoneId" class="field"
                            :placeholder="t('zoneIdPlaceholder')" autocomplete="off" />
                    </label>
                    <label v-else class="form-field">
                        <span>{{ t('collectorAddress') }}</span>
                        <input v-model="model.domainActivationForm.collectorAddress" class="field"
                            :placeholder="t('collectorPlaceholder')" autocomplete="off" />
                    </label>
                </div>
                <label class="check-row">
                    <input v-model="model.domainActivationForm.allowRandomSubdomain" type="checkbox" />
                    <span>{{ t('allowRandomSubdomain') }}</span>
                </label>
                <div id="domain-activation-description" class="notice modal-notice">
                    <strong>{{ model.domainActivationForm.receiveMode === 'cloudflare_email' ? t('cloudflareScopeTitle') : t('improvmxScopeTitle') }}</strong>
                    <span v-if="model.domainActivationForm.receiveMode === 'cloudflare_email'">
                        {{ t('cloudflareScopeNote') }}
                    </span>
                    <span v-else>
                        {{ t('improvmxScopeNote') }}
                    </span>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn" type="button" :disabled="model.domainActivationBusy"
                    @click="actions.closeDomainActivation">{{ t('cancel') }}</button>
                <button class="btn primary" type="submit" :disabled="model.domainActivationBusy">
                    {{ model.domainActivationBusy ? t('running') : t('createAndActivate') }}
                </button>
            </div>
        </form>
    </div>

    <div v-if="model.actionModal" ref="actionDialog" class="modal-backdrop is-open" role="dialog" aria-modal="true"
        aria-labelledby="action-modal-title" aria-describedby="action-modal-description" tabindex="-1"
        @click.self="actions.closeActionModal"
        @keydown="handleOverlayKeydown($event, actions.closeActionModal, actionDialog)">
        <form class="modal" :aria-busy="model.actionBusy ? 'true' : 'false'"
            @submit.prevent="actions.submitActionModal">
            <div class="modal-head">
                <h2 id="action-modal-title">{{ model.modalTitle }}</h2>
                <button class="icon-btn" type="button" :aria-label="t('close')" @click="actions.closeActionModal">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
            </div>
            <div class="modal-body">
                <template v-if="model.actionModal === 'one-time-result'">
                    <div id="action-modal-description" class="notice modal-notice">
                        <strong>{{ t('oneTimeOnlyTitle') }}</strong>
                        <span>{{ model.oneTimeResult.note }}</span>
                    </div>
                    <label class="form-field full">
                        <span>{{ t('oneTimeResultLabel') }}</span>
                        <textarea data-testid="one-time-result" data-autofocus :value="model.oneTimeResult.value"
                            rows="6" readonly />
                    </label>
                </template>
                <template v-else-if="model.actionModal === 'new-address' || model.actionModal === 'quick-create'">
                    <div id="action-modal-description" class="notice modal-notice">
                        <strong>{{ t('productionAddressTitle') }}</strong>
                        <span>{{ t('productionAddressNote') }}</span>
                    </div>
                    <div class="form-grid">
                        <label class="form-field">
                            <span>{{ t('addressName') }}</span>
                            <input v-model="model.addressCreateForm.name" data-testid="address-name" data-autofocus
                                class="field" placeholder="team-inbox" autocomplete="off" required />
                        </label>
                        <label class="form-field">
                            <span>{{ t('domain') }}</span>
                            <select v-model="model.addressCreateForm.domain" data-testid="address-domain" class="select" required>
                                <option v-for="domain in model.addressDomainOptions" :key="domain.id" :value="domain.domain">
                                    {{ domain.domain }}
                                </option>
                            </select>
                        </label>
                    </div>
                    <label v-if="model.openSettings.prefix" class="check-row">
                        <input v-model="model.addressCreateForm.enablePrefix" data-testid="address-prefix" type="checkbox" />
                        <span>{{ t('usePrefix', { prefix: model.openSettings.prefix }) }}</span>
                    </label>
                    <label v-if="model.selectedAddressDomain?.allowRandomSubdomain" class="check-row">
                        <input v-model="model.addressCreateForm.enableRandomSubdomain"
                            data-testid="address-random-subdomain" type="checkbox" />
                        <span>{{ t('randomSubdomainUnderDomain') }}</span>
                    </label>
                    <div v-if="model.addressDomainOptions.length === 0" class="notice warn">
                        <strong>{{ t('noDomainsTitle') }}</strong>
                        <span>{{ t('noDomainsNote') }}</span>
                    </div>
                </template>
                <template v-else-if="model.actionModal === 'share-package'">
                    <div id="action-modal-description" class="notice modal-notice">
                        <strong>{{ t('readOnlyAccessTitle') }}</strong>
                        <span>{{ t('readOnlyAccessNote') }}</span>
                    </div>
                    <div class="form-grid">
                        <label class="form-field full">
                            <span>{{ t('address') }}</span>
                            <input data-testid="share-address" class="field"
                                :value="model.currentAddress?.address || '-'" readonly />
                        </label>
                        <label class="form-field">
                            <span>{{ t('label') }}</span>
                            <input v-model="model.shareCreateForm.label" data-testid="share-label" data-autofocus
                                class="field" :placeholder="t('labelPlaceholder')" autocomplete="off" />
                        </label>
                        <label class="form-field">
                            <span>{{ t('expiresAt') }}</span>
                            <input v-model="model.shareCreateForm.expiresAt" data-testid="share-expiry" class="field"
                                type="datetime-local" />
                        </label>
                    </div>
                </template>
            </div>
            <div class="modal-actions">
                <template v-if="model.actionModal === 'one-time-result'">
                    <button class="btn primary" type="button" :disabled="!model.oneTimeResult.value"
                        @click="actions.copyText(model.oneTimeResult.value)">{{ t('copyResult') }}</button>
                    <button class="btn" type="button" @click="actions.closeActionModal">{{ t('savedSecurely') }}</button>
                </template>
                <template v-else>
                    <button class="btn" type="button" :disabled="!!model.actionBusy"
                        @click="actions.closeActionModal">{{ t('cancel') }}</button>
                    <button class="btn primary" data-testid="action-submit" type="submit"
                        :disabled="!!model.actionBusy || (model.actionModal === 'new-address' && model.addressDomainOptions.length === 0)">
                        {{ model.actionBusy ? t('running') : model.modalPrimaryLabel }}
                    </button>
                </template>
            </div>
        </form>
    </div>
</template>
