import { computed, nextTick, reactive, ref, watch } from 'vue'

import { adminApi } from './admin-api'
import { formatAddressCredential, toD1DateTime } from './admin-formatters'
import { adminT } from './admin-i18n'

const t = adminT('admin.actions')

export const useAdminConsoleActions = ({
    activeView,
    addressRows,
    currentAddress,
    currentDomain,
    currentMail,
    dbVersionLabel,
    domainRows,
    filteredMailRows,
    live,
    openSettings,
    opsRows,
    refreshAll,
    replaceRouteQuery,
    resetMailListScroll,
    showAdminPage,
    showToast,
    syncMailQueryToRoute,
    ui,
    workerStatusLabel,
}) => {
    const actionBusy = ref('')
    const actionModal = ref('')
    const domainActivationOpen = ref(false)
    const domainActivationBusy = ref(false)
    const domainActivationForm = reactive({
        domain: '',
        displayLabel: '',
        receiveMode: 'cloudflare_email',
        collectorAddress: '',
        cloudflareZoneId: '',
        allowRandomSubdomain: false,
    })
    const addressCreateForm = reactive({
        name: '',
        domain: '',
        enablePrefix: true,
        enableRandomSubdomain: false,
    })
    const shareCreateForm = reactive({
        label: '',
        expiresAt: '',
    })
    const oneTimeResult = reactive({
        title: '',
        value: '',
        note: '',
    })
    const addressDomainOptions = computed(() => domainRows.value.filter((row) => row.isEnabled))
    const selectedAddressDomain = computed(() => (
        addressDomainOptions.value.find((row) => row.domain === addressCreateForm.domain)
    ))

    watch(() => addressCreateForm.domain, () => {
        if (!selectedAddressDomain.value?.allowRandomSubdomain) {
            addressCreateForm.enableRandomSubdomain = false
        }
    })

    const showError = (text) => showToast(text, 'error')
    const showSuccess = (text) => showToast(text, 'success')
    const showWarning = (text) => showToast(text, 'warning')

    const clearOneTimeResult = () => {
        oneTimeResult.title = ''
        oneTimeResult.value = ''
        oneTimeResult.note = ''
    }

    const openActionModal = (type) => {
        clearOneTimeResult()
        if (type === 'new-address' || type === 'quick-create') {
            addressCreateForm.name = ''
            addressCreateForm.domain = currentDomain.value?.isEnabled
                ? currentDomain.value.domain
                : addressDomainOptions.value[0]?.domain || ''
            addressCreateForm.enablePrefix = !!openSettings.value.prefix
            addressCreateForm.enableRandomSubdomain = false
        }
        if (type === 'share-package') {
            shareCreateForm.label = ''
            shareCreateForm.expiresAt = ''
        }
        actionModal.value = type
    }

    const closeActionModal = () => {
        actionModal.value = ''
        clearOneTimeResult()
    }

    const openSharePackage = (row = currentAddress.value) => {
        if (row?.id) ui.selected.identity = row.id
        openActionModal('share-package')
    }

    const copyCurrent = async () => {
        const candidates = {
            identity: currentAddress.value?.address,
            routing: currentDomain.value?.collector,
            access: currentMail.value?.to,
            overview: currentDomain.value?.domain,
            flow: currentMail.value?.to,
        }
        const text = candidates[activeView.value] || window.location.href
        try {
            await navigator.clipboard.writeText(text)
            showSuccess(t('copied'))
        } catch (error) {
            showError(error?.message || t('copyFailed'))
        }
    }

    const copyText = async (text) => {
        if (!text) {
            showWarning(t('nothingToCopy'))
            return
        }
        try {
            await navigator.clipboard.writeText(text)
            showSuccess(t('copied'))
        } catch (error) {
            showError(error?.message || t('copyFailed'))
        }
    }

    const deleteMailRows = async (rows, scopeLabel = t('scopeSelectedMails')) => {
        if (!showAdminPage.value) {
            showWarning(t('signInBeforeDelete'))
            return
        }
        const targets = rows
            .filter((row) => row?.sourceId)
            .map((row) => ({
                id: row.sourceId,
                label: row.subject || row.to || `Mail #${row.sourceId}`,
            }))
        if (targets.length === 0) {
            showWarning(t('noProductionMailsToDelete'))
            return
        }
        const confirmed = window.confirm(t('confirmDeleteMails', { count: targets.length, scope: scopeLabel }))
        if (!confirmed) return
        const previousSelected = ui.selected.flow
        let deleted = 0
        try {
            for (const target of targets) {
                const result = await adminApi.deleteMail(target.id)
                if (result?.success === false) throw new Error(t('deleteMailFailed', { label: target.label }))
                deleted += 1
            }
            showSuccess(t('deletedMails', { count: deleted }))
            await refreshAll()
            const remaining = filteredMailRows.value
            if (remaining.some((row) => row.id === previousSelected)) {
                ui.selected.flow = previousSelected
            } else if (remaining.length > 0) {
                ui.selected.flow = remaining[0].id
            } else {
                ui.selected.flow = ''
                ui.flowMode = 'list'
            }
            syncMailQueryToRoute({ mailId: ui.selected.flow || undefined })
        } catch (error) {
            showError(error?.message || t('deleteInterrupted', { count: deleted }))
            await refreshAll()
        }
    }

    const deleteCurrentMail = async () => {
        if (!currentMail.value) {
            showWarning(t('selectMailFirst'))
            return
        }
        await deleteMailRows([currentMail.value], t('scopeCurrentMail'))
    }

    const deleteFilteredMails = async () => {
        await deleteMailRows(filteredMailRows.value, t('scopeFilteredMails'))
    }

    const requireProductionWrite = (label) => {
        if (!showAdminPage.value) {
            showWarning(t('signInBeforeAction', { action: label }))
            return false
        }
        return true
    }

    const runProductionAction = async (key, label, confirmText, task) => {
        if (!requireProductionWrite(label)) return
        if (actionBusy.value) {
            showWarning(t('busy'))
            return
        }
        if (confirmText && !window.confirm(confirmText)) return
        actionBusy.value = key
        try {
            await task()
        } catch (error) {
            showError(error?.message || t('actionFailed', { action: label }))
        } finally {
            actionBusy.value = ''
        }
    }

    const showOneTimeResult = (title, value, note) => {
        oneTimeResult.title = title
        oneTimeResult.value = value
        oneTimeResult.note = note
        actionModal.value = 'one-time-result'
    }

    const createAddressIdentity = async () => {
        const name = addressCreateForm.name.trim()
        const domain = addressCreateForm.domain.trim().toLowerCase()
        if (!name || !domain) {
            showWarning(t('addressNameAndDomainRequired'))
            return
        }
        if (!requireProductionWrite(t('labelCreateAddress'))) return
        if (actionBusy.value) {
            showWarning(t('busy'))
            return
        }
        if (!window.confirm(t('confirmCreateAddress', { address: `${name}@${domain}` }))) return
        actionBusy.value = 'address-create'
        try {
            const result = await adminApi.createAddress({
                name,
                domain,
                enablePrefix: addressCreateForm.enablePrefix,
                enableRandomSubdomain: addressCreateForm.enableRandomSubdomain,
            })
            await refreshAll()
            const address = result?.address || `${name}@${domain}`
            const credential = formatAddressCredential(address, result?.jwt, result?.password, window.location.origin)
            showOneTimeResult(
                t('addressCreatedTitle', { address }),
                credential,
                result?.jwt || result?.password
                    ? t('credentialShownOnce')
                    : t('addressCreatedNoCredential'),
            )
            showSuccess(t('addressCreated'))
        } catch (error) {
            showError(error?.message || t('createAddressFailed'))
        } finally {
            actionBusy.value = ''
        }
    }

    const createSharePackage = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showWarning(t('selectProductionAddressFirst'))
            return
        }
        if (!requireProductionWrite(t('labelCreateSharePackage'))) return
        if (actionBusy.value) {
            showWarning(t('busy'))
            return
        }
        if (!window.confirm(t('confirmCreateSharePackage', { address: row.address }))) return
        actionBusy.value = 'share-create'
        try {
            const result = await adminApi.createShareToken(row.sourceId, {
                label: shareCreateForm.label.trim(),
                expiresAt: toD1DateTime(shareCreateForm.expiresAt),
            })
            await refreshAll()
            const shareUrl = result?.token ? `${window.location.origin}/i/${encodeURIComponent(result.token)}` : ''
            showOneTimeResult(
                t('sharePackageCreatedTitle', { address: row.address }),
                shareUrl,
                shareUrl ? t('shareLinkShownOnce') : t('sharePackageCreatedNoToken'),
            )
            showSuccess(t('sharePackageCreated'))
        } catch (error) {
            showError(error?.message || t('createSharePackageFailed'))
        } finally {
            actionBusy.value = ''
        }
    }

    const deleteCurrentAddress = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showWarning(t('addressNotProductionDelete'))
            return
        }
        await runProductionAction(
            'address-delete',
            t('labelDeleteAddress'),
            t('confirmDeleteAddress', { address: row.address, mailCount: row.mails, sentCount: row.sent }),
            async () => {
                const result = await adminApi.deleteAddress(row.sourceId, {
                    credentialVersion: row.credentialVersion,
                    mailCount: row.mails,
                    sentCount: row.sent,
                    shareCount: row.packages,
                })
                if (result?.success === false) throw new Error(t('deleteAddressFailed'))
                await refreshAll()
                ui.selected.identity = addressRows.value[0]?.id || ''
                showSuccess(t('addressDeleted', { address: row.address }))
            },
        )
    }

    const disableCurrentDomain = async () => {
        const row = currentDomain.value
        if (!row?.sourceId) {
            showWarning(t('domainNotManagedDisable'))
            return
        }
        if (!requireProductionWrite(t('labelDisableDomain'))) return
        if (actionBusy.value) {
            showWarning(t('busy'))
            return
        }
        actionBusy.value = 'domain-disable'
        try {
            const impact = await adminApi.getDomainImpact(row.sourceId)
            const confirmed = window.confirm(
                t('confirmDisableDomain', { domain: row.domain, addressCount: impact?.address_count ?? 0, mailCount: impact?.mail_count ?? 0 }),
            )
            if (!confirmed) return
            const result = await adminApi.disableDomain(row.sourceId, {
                configVersion: row.configVersion,
            })
            if (result?.success === false) throw new Error(t('disableDomainFailed'))
            await refreshAll()
            showSuccess(t('domainDisabled', { domain: row.domain }))
        } catch (error) {
            showError(error?.message || t('disableDomainFailed'))
        } finally {
            actionBusy.value = ''
        }
    }

    const showCurrentCredential = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showWarning(t('addressNotProductionShowCredential'))
            return
        }
        await runProductionAction(
            'credential-show',
            t('labelShowCredential'),
            t('confirmShowCredential', { address: row.address }),
            async () => {
                const result = await adminApi.showAddressCredential(row.sourceId, row.credentialVersion)
                showOneTimeResult(
                    t('credentialTitle', { address: row.address }),
                    formatAddressCredential(row.address, result?.jwt, '', window.location.origin),
                    t('credentialNote'),
                )
            },
        )
    }

    const rotateCurrentCredential = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showWarning(t('addressNotProductionRotate'))
            return
        }
        await runProductionAction(
            'rotate',
            t('labelRotateCredential'),
            t('confirmRotateCredential', { address: row.address }),
            async () => {
                const result = await adminApi.rotateAddressCredential(row.sourceId, row.credentialVersion)
                await refreshAll()
                if (result?.jwt) {
                    showOneTimeResult(
                        t('credentialRotatedTitle', { address: row.address }),
                        formatAddressCredential(result?.address || row.address, result.jwt, '', window.location.origin),
                        t('credentialRotatedNote'),
                    )
                } else {
                    showSuccess(t('credentialRotated', { address: row.address }))
                }
            }
        )
    }

    const revokeCurrentShareTokens = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showWarning(t('addressNotProductionRevoke'))
            return
        }
        await runProductionAction(
            'revoke',
            t('labelRevokeSharePackages'),
            t('confirmRevokeSharePackages', { address: row.address }),
            async () => {
                const result = await adminApi.revokeShareTokens(row.sourceId)
                if (result?.success === false) throw new Error(t('revokeSharePackagesFailed'))
                await refreshAll()
                showSuccess(t('sharePackagesRevoked', { address: row.address }))
            }
        )
    }

    const clearCurrentAddressInbox = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showWarning(t('addressNotProductionClearInbox'))
            return
        }
        await runProductionAction(
            'clear-inbox',
            t('labelClearInbox'),
            t('confirmClearInbox', { address: row.address }),
            async () => {
                const result = await adminApi.clearAddressInbox(row.sourceId, row.mails)
                if (result?.success === false) throw new Error(t('clearInboxFailed'))
                await refreshAll()
                showSuccess(t('inboxCleared', { address: row.address }))
            }
        )
    }

    const checkCurrentDomainRoute = async () => {
        const row = currentDomain.value
        if (!row?.sourceId) {
            showWarning(t('domainFromPublicSettingsCheck'))
            return
        }
        if (!requireProductionWrite(t('labelDomainRouteCheck'))) return
        if (actionBusy.value) {
            showWarning(t('busy'))
            return
        }
        actionBusy.value = 'verify'
        try {
            if (String(row.mode || '').includes('Cloudflare')) {
                const result = await adminApi.checkCloudflareDomain(row.sourceId)
                const ruleCount = Array.isArray(result?.rules) ? result.rules.length : 0
                showSuccess(t('cloudflareRouteCheckDone', { count: ruleCount }))
            } else {
                const result = await adminApi.getDomainImpact(row.sourceId)
                showSuccess(t('domainImpactCheckDone', { addressCount: result?.address_count ?? 0, mailCount: result?.mail_count ?? 0 }))
            }
            await refreshAll()
        } catch (error) {
            showError(error?.message || t('domainRouteCheckFailed'))
        } finally {
            actionBusy.value = ''
        }
    }

    const checkCurrentDomainImpact = async () => {
        const row = currentDomain.value
        if (!row?.sourceId) {
            showWarning(t('domainFromPublicSettingsImpact'))
            return
        }
        if (!showAdminPage.value) {
            showWarning(t('signInBeforeImpactCheck'))
            return
        }
        if (actionBusy.value) {
            showWarning(t('busy'))
            return
        }
        actionBusy.value = 'domain-impact'
        try {
            const result = await adminApi.getDomainImpact(row.sourceId)
            showSuccess(t('disableImpact', { addressCount: result?.address_count ?? 0, mailCount: result?.mail_count ?? 0 }))
        } catch (error) {
            showError(error?.message || t('disableImpactCheckFailed'))
        } finally {
            actionBusy.value = ''
        }
    }

    const resetDomainActivationForm = (mode = 'cloudflare_email') => {
        Object.assign(domainActivationForm, {
            domain: '',
            displayLabel: '',
            receiveMode: mode,
            collectorAddress: '',
            cloudflareZoneId: '',
            allowRandomSubdomain: false,
        })
    }

    const openDomainActivation = (mode = 'cloudflare_email') => {
        resetDomainActivationForm(mode)
        domainActivationOpen.value = true
    }

    const findLiveDomain = (id) => live.domains.find((row) => String(row.id) === String(id))

    const refreshAndFindDomain = async (id) => {
        await refreshAll()
        return findLiveDomain(id)
    }

    const startDomainVerification = async (domainRow, silent = false) => {
        if (!domainRow?.sourceId && !domainRow?.id) throw new Error(t('domainNotManaged'))
        const id = domainRow.sourceId || domainRow.id
        const configVersion = domainRow.configVersion || domainRow.config_version
        const result = await adminApi.startDomainVerification(id, configVersion)
        await refreshAll()
        if (!silent) {
            const target = result?.verification_address || t('verificationAddressFallback')
            showSuccess(t('verificationStarted', { target }))
        }
        return result
    }

    const checkDomainVerification = async (domainRow) => {
        if (!domainRow?.sourceId) {
            showWarning(t('domainNotManagedVerifyCheck'))
            return
        }
        await runProductionAction(
            'domain-verify-check',
            t('labelCheckVerification'),
            '',
            async () => {
                const result = await adminApi.checkDomainVerification(domainRow.sourceId, domainRow.configVersion)
                await refreshAll()
                if (result?.success === false) {
                    showWarning(t('verificationMailNotReceived', { address: result?.verification_address || domainRow.verificationAddress || domainRow.domain }))
                } else {
                    showSuccess(t('domainVerified', { domain: domainRow.domain }))
                }
            }
        )
    }

    const performCloudflareSetup = async (domainRow) => {
        const check = await adminApi.checkCloudflareDomain(domainRow.sourceId)
        if (!check?.automatic_setup_supported) {
            throw new Error(t('notCloudflareZoneRoot'))
        }
        const replaceCatchAll = !!check?.setup_preview?.catch_all_conflict
            && window.confirm(t('confirmReplaceCatchAll', { domain: domainRow.domain }))
        if (check?.setup_preview?.catch_all_conflict && !replaceCatchAll) return null
        await adminApi.setupCloudflareDomain(domainRow.sourceId, {
            configVersion: domainRow.configVersion,
            confirmReplaceCatchAll: replaceCatchAll,
        })
        const updated = await refreshAndFindDomain(domainRow.sourceId)
        return updated ? await startDomainVerification({
            id: updated.id,
            config_version: updated.config_version,
        }, true) : null
    }

    const setupCloudflareDomain = async (domainRow) => {
        if (!domainRow?.sourceId) {
            showWarning(t('domainNotManagedCloudflareSetup'))
            return
        }
        if (domainRow.receiveMode && domainRow.receiveMode !== 'cloudflare_email') {
            showWarning(t('domainNotCloudflareMode'))
            return
        }
        await runProductionAction(
            'cloudflare-setup',
            t('labelCloudflareSetup'),
            t('confirmCloudflareSetup', { domain: domainRow.domain }),
            async () => {
                const verification = await performCloudflareSetup(domainRow)
                showSuccess(verification?.verification_address
                    ? t('cloudflareConfiguredSendTest', { target: verification.verification_address })
                    : t('cloudflareConfiguredStartVerification'))
            }
        )
    }

    const createAndActivateDomain = async () => {
        if (domainActivationBusy.value) return
        const domain = domainActivationForm.domain.trim().toLowerCase()
        if (!domain) {
            showWarning(t('domainRequired'))
            return
        }
        if (!requireProductionWrite(t('labelCreateDomain'))) return
        const mode = domainActivationForm.receiveMode
        const label = mode === 'cloudflare_email' ? t('labelCloudflareSetup') : t('labelImprovmxVerification')
        if (!window.confirm(t('confirmCreateDomain', { domain, action: label }))) return
        domainActivationBusy.value = true
        actionBusy.value = mode === 'cloudflare_email' ? 'cloudflare-create' : 'improvmx-create'
        try {
            const created = await adminApi.createDomain({
                domain,
                displayLabel: domainActivationForm.displayLabel,
                receiveMode: mode,
                collectorAddress: domainActivationForm.collectorAddress,
                cloudflareZoneId: domainActivationForm.cloudflareZoneId,
                allowRandomSubdomain: domainActivationForm.allowRandomSubdomain,
            })
            const row = await refreshAndFindDomain(created?.id)
            if (!row) throw new Error(t('domainCreatedNotFound'))
            const rowRef = {
                sourceId: row.id,
                domain: row.domain,
                receiveMode: row.receive_mode,
                configVersion: row.config_version,
            }
            if (mode === 'cloudflare_email') {
                const verification = await performCloudflareSetup(rowRef)
                showSuccess(verification?.verification_address
                    ? t('cloudflareConfiguredSendTest', { target: verification.verification_address })
                    : t('cloudflareConfiguredStartVerification'))
            } else if (mode === 'improvmx_forward') {
                const verification = await startDomainVerification({
                    id: row.id,
                    config_version: row.config_version,
                }, true)
                showSuccess(t('improvmxCollectorReady', { address: verification?.collector_address || row.collector_address || t('refreshToView') }))
            }
            domainActivationOpen.value = false
        } catch (error) {
            showError(error?.message || t('createDomainFailed'))
        } finally {
            domainActivationBusy.value = false
            actionBusy.value = ''
        }
    }

    const runHealthCheck = async () => {
        if (!showAdminPage.value) {
            showWarning(t('signInBeforeHealthCheck'))
            return
        }
        if (actionBusy.value) {
            showWarning(t('busy'))
            return
        }
        actionBusy.value = 'health-check'
        try {
            await refreshAll()
            const apiState = workerStatusLabel.value
            const dbState = opsRows.value[1]?.status || dbVersionLabel.value
            showSuccess(t('healthCheckDone', { worker: apiState, database: dbState }))
        } catch (error) {
            showError(error?.message || t('healthCheckFailed'))
        } finally {
            actionBusy.value = ''
        }
    }

    const handleAction = async (type) => {
        if (type === 'refresh') {
            await refreshAll()
            showSuccess(t('syncDone'))
            return
        }
        if (type === 'reset-filters') {
            ui.query = ''
            ui.domain = 'all'
            ui.address = 'all'
            ui.status = 'all'
            ui.flowMode = 'list'
            resetMailListScroll()
            replaceRouteQuery({
                q: undefined,
                domain: undefined,
                address: undefined,
                status: undefined,
                mode: undefined,
            }, ['item'])
            showSuccess(t('filtersCleared'))
            return
        }
        if (type === 'copy') {
            await copyCurrent()
            return
        }
        if (type === 'delete' && activeView.value === 'flow') {
            await deleteFilteredMails()
            return
        }
        if (type === 'delete-current') {
            await deleteCurrentMail()
            return
        }
        if (type === 'delete-address') {
            await deleteCurrentAddress()
            return
        }
        if (type === 'clear-inbox') {
            await clearCurrentAddressInbox()
            return
        }
        if (type === 'rotate') {
            await rotateCurrentCredential()
            return
        }
        if (type === 'show-credential') {
            await showCurrentCredential()
            return
        }
        if (type === 'revoke') {
            await revokeCurrentShareTokens()
            return
        }
        if (type === 'verify') {
            await checkCurrentDomainRoute()
            return
        }
        if (type === 'domain-impact') {
            await checkCurrentDomainImpact()
            return
        }
        if (type === 'domain-disable') {
            await disableCurrentDomain()
            return
        }
        if (type === 'health-check') {
            await runHealthCheck()
            return
        }
        if (type === 'new-domain') {
            openDomainActivation('cloudflare_email')
            return
        }
        if (type === 'cloudflare-setup') {
            await setupCloudflareDomain(currentDomain.value)
            return
        }
        if (type === 'verify-start') {
            await runProductionAction(
                'domain-verify-start',
                t('labelStartDomainVerification'),
                t('confirmRegenerateVerification', { domain: currentDomain.value?.domain || t('currentDomainFallback') }),
                async () => startDomainVerification(currentDomain.value)
            )
            return
        }
        if (type === 'verify-check') {
            await checkDomainVerification(currentDomain.value)
            return
        }
        showWarning(t('unsupportedAction'))
    }

    const handleDomainRowAction = async (row, type) => {
        if (!row) return
        ui.selected.routing = row.id
        await nextTick()
        await handleAction(type)
    }

    return {
        actionBusy,
        actionModal,
        addressCreateForm,
        addressDomainOptions,
        selectedAddressDomain,
        shareCreateForm,
        oneTimeResult,
        domainActivationOpen,
        domainActivationBusy,
        domainActivationForm,
        openActionModal,
        closeActionModal,
        openSharePackage,
        copyCurrent,
        copyText,
        deleteCurrentMail,
        createAddressIdentity,
        createSharePackage,
        createAndActivateDomain,
        handleAction,
        handleDomainRowAction,
    }
}
