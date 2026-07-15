import { computed, nextTick, reactive, ref, watch } from 'vue'

import { adminApi } from './admin-api'
import { formatAddressCredential, toD1DateTime } from './admin-formatters'

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
    const addressDomainOptions = computed(() => domainRows.value.filter((row) => row.enabled === '启用'))
    const selectedAddressDomain = computed(() => (
        addressDomainOptions.value.find((row) => row.domain === addressCreateForm.domain)
    ))

    watch(() => addressCreateForm.domain, () => {
        if (!selectedAddressDomain.value?.allowRandomSubdomain) {
            addressCreateForm.enableRandomSubdomain = false
        }
    })

    const clearOneTimeResult = () => {
        oneTimeResult.title = ''
        oneTimeResult.value = ''
        oneTimeResult.note = ''
    }

    const openActionModal = (type) => {
        clearOneTimeResult()
        if (type === 'new-address' || type === 'quick-create') {
            addressCreateForm.name = ''
            addressCreateForm.domain = currentDomain.value?.enabled === '启用'
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
            showToast('已复制到剪贴板')
        } catch (error) {
            showToast(error?.message || '复制失败')
        }
    }

    const copyText = async (text) => {
        if (!text) {
            showToast('没有可复制内容')
            return
        }
        try {
            await navigator.clipboard.writeText(text)
            showToast('已复制到剪贴板')
        } catch (error) {
            showToast(error?.message || '复制失败')
        }
    }

    const deleteMailRows = async (rows, scopeLabel = '选中邮件') => {
        if (!showAdminPage.value) {
            showToast('请先登录管理员会话后再执行生产删除')
            return
        }
        const targets = rows
            .filter((row) => row?.sourceId)
            .map((row) => ({
                id: row.sourceId,
                label: row.subject || row.to || `Mail #${row.sourceId}`,
            }))
        if (targets.length === 0) {
            showToast('没有可删除的生产邮件')
            return
        }
        const confirmed = window.confirm(`确认从生产收件箱删除 ${targets.length} 封${scopeLabel}？此操作会删除 raw_mails 和对应已读状态，无法在后台撤销。`)
        if (!confirmed) return
        const previousSelected = ui.selected.flow
        let deleted = 0
        try {
            for (const target of targets) {
                const result = await adminApi.deleteMail(target.id)
                if (result?.success === false) throw new Error(`删除失败：${target.label}`)
                deleted += 1
            }
            showToast(`已删除 ${deleted} 封生产邮件`)
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
            showToast(error?.message || `已删除 ${deleted} 封后中断`)
            await refreshAll()
        }
    }

    const deleteCurrentMail = async () => {
        if (!currentMail.value) {
            showToast('请先选择一封邮件')
            return
        }
        await deleteMailRows([currentMail.value], '当前邮件')
    }

    const deleteFilteredMails = async () => {
        await deleteMailRows(filteredMailRows.value, '当前筛选结果')
    }

    const requireProductionWrite = (label) => {
        if (!showAdminPage.value) {
            showToast(`请先登录管理员会话后再执行${label}`)
            return false
        }
        return true
    }

    const runProductionAction = async (key, label, confirmText, task) => {
        if (!requireProductionWrite(label)) return
        if (actionBusy.value) {
            showToast('已有生产操作执行中')
            return
        }
        if (confirmText && !window.confirm(confirmText)) return
        actionBusy.value = key
        try {
            await task()
        } catch (error) {
            showToast(error?.message || `${label}失败`)
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
            showToast('请输入地址名并选择域名')
            return
        }
        if (!requireProductionWrite('新增地址')) return
        if (actionBusy.value) {
            showToast('已有生产操作执行中')
            return
        }
        if (!window.confirm(`确认创建 ${name}@${domain}？创建成功后地址凭证只显示一次。`)) return
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
                `地址已创建：${address}`,
                credential,
                result?.jwt || result?.password
                    ? '凭证只显示本次。请复制到可信密码管理器。'
                    : '地址已创建，但接口未返回凭证。',
            )
            showToast('地址已创建')
        } catch (error) {
            showToast(error?.message || '新增地址失败')
        } finally {
            actionBusy.value = ''
        }
    }

    const createSharePackage = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showToast('请先选择一个生产地址')
            return
        }
        if (!requireProductionWrite('创建访问包')) return
        if (actionBusy.value) {
            showToast('已有生产操作执行中')
            return
        }
        if (!window.confirm(`确认为 ${row.address} 创建只读访问包？分享链接只显示一次。`)) return
        actionBusy.value = 'share-create'
        try {
            const result = await adminApi.createShareToken(row.sourceId, {
                label: shareCreateForm.label.trim(),
                expiresAt: toD1DateTime(shareCreateForm.expiresAt),
            })
            await refreshAll()
            const shareUrl = result?.token ? `${window.location.origin}/i/${encodeURIComponent(result.token)}` : ''
            showOneTimeResult(
                `访问包已创建：${row.address}`,
                shareUrl,
                shareUrl ? '链接仅显示本次；持有者可只读查看该地址。' : '访问包已创建，但接口未返回 token。',
            )
            showToast('访问包已创建')
        } catch (error) {
            showToast(error?.message || '创建访问包失败')
        } finally {
            actionBusy.value = ''
        }
    }

    const deleteCurrentAddress = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showToast('当前地址不是生产地址，无法删除')
            return
        }
        await runProductionAction(
            'address-delete',
            '删除地址',
            `确认删除 ${row.address}？该地址的 ${row.mails} 封收件、${row.sent} 封发送记录和访问包会一起删除，无法撤销。`,
            async () => {
                const result = await adminApi.deleteAddress(row.sourceId)
                if (result?.success === false) throw new Error('删除地址失败')
                await refreshAll()
                ui.selected.identity = addressRows.value[0]?.id || ''
                showToast(`已删除 ${row.address}`)
            },
        )
    }

    const disableCurrentDomain = async () => {
        const row = currentDomain.value
        if (!row?.sourceId) {
            showToast('当前域名不是 D1 管理记录，无法停用')
            return
        }
        if (!requireProductionWrite('停用域名')) return
        if (actionBusy.value) {
            showToast('已有生产操作执行中')
            return
        }
        actionBusy.value = 'domain-disable'
        try {
            const impact = await adminApi.getDomainImpact(row.sourceId)
            const confirmed = window.confirm(
                `确认停用 ${row.domain}？影响 ${impact?.address_count ?? 0} 个地址和 ${impact?.mail_count ?? 0} 封邮件；已有数据不会自动迁移。`,
            )
            if (!confirmed) return
            const result = await adminApi.disableDomain(row.sourceId, {
                configVersion: row.configVersion,
            })
            if (result?.success === false) throw new Error('停用域名失败')
            await refreshAll()
            showToast(`已停用 ${row.domain}`)
        } catch (error) {
            showToast(error?.message || '停用域名失败')
        } finally {
            actionBusy.value = ''
        }
    }

    const showCurrentCredential = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showToast('当前地址不是生产地址，无法显示凭证')
            return
        }
        await runProductionAction(
            'credential-show',
            '显示地址凭证',
            `确认显示 ${row.address} 的当前 JWT 和固定登录链接？请确保屏幕不会被无关人员看到。`,
            async () => {
                const result = await adminApi.showAddressCredential(row.sourceId)
                showOneTimeResult(
                    `地址凭证：${row.address}`,
                    formatAddressCredential(row.address, result?.jwt, '', window.location.origin),
                    '结果在关闭后会从页面状态清除；轮换凭证前当前 JWT 仍然有效。',
                )
            },
        )
    }

    const rotateCurrentCredential = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showToast('当前地址不是生产地址，无法轮换凭证')
            return
        }
        await runProductionAction(
            'rotate',
            '凭证轮换',
            `确认轮换 ${row.address} 的地址凭证？旧地址 JWT 会失效，新的凭证只会显示一次，请在安全位置复制保存。`,
            async () => {
                const result = await adminApi.rotateAddressCredential(row.sourceId)
                await refreshAll()
                if (result?.jwt) {
                    showOneTimeResult(
                        `凭证已轮换：${row.address}`,
                        formatAddressCredential(result?.address || row.address, result.jwt, '', window.location.origin),
                        '旧 JWT 已失效；新凭证在关闭后会从页面状态清除。',
                    )
                } else {
                    showToast(`已轮换 ${row.address} 的凭证`)
                }
            }
        )
    }

    const revokeCurrentShareTokens = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showToast('当前地址不是生产地址，无法撤销访问包')
            return
        }
        await runProductionAction(
            'revoke',
            '撤销访问包',
            `确认撤销 ${row.address} 的全部活跃访问包？已分享的只读链接会立即失效。`,
            async () => {
                const result = await adminApi.revokeShareTokens(row.sourceId)
                if (result?.success === false) throw new Error('撤销访问包失败')
                await refreshAll()
                showToast(`已撤销 ${row.address} 的访问包`)
            }
        )
    }

    const clearCurrentAddressInbox = async () => {
        const row = currentAddress.value
        if (!row?.sourceId) {
            showToast('当前地址不是生产地址，无法清空收件')
            return
        }
        await runProductionAction(
            'clear-inbox',
            '清空地址收件',
            `确认清空 ${row.address} 的生产收件箱？此操作会删除该地址 raw_mails 和已读状态，无法在后台撤销。`,
            async () => {
                const result = await adminApi.clearAddressInbox(row.sourceId)
                if (result?.success === false) throw new Error('清空地址收件失败')
                await refreshAll()
                showToast(`已清空 ${row.address} 的收件箱`)
            }
        )
    }

    const checkCurrentDomainRoute = async () => {
        const row = currentDomain.value
        if (!row?.sourceId) {
            showToast('当前域名来自公开设置，无法执行生产检查')
            return
        }
        if (!requireProductionWrite('域名路由检查')) return
        if (actionBusy.value) {
            showToast('已有生产操作执行中')
            return
        }
        actionBusy.value = 'verify'
        try {
            if (String(row.mode || '').includes('Cloudflare')) {
                const result = await adminApi.checkCloudflareDomain(row.sourceId)
                const ruleCount = Array.isArray(result?.rules) ? result.rules.length : 0
                showToast(`Cloudflare 路由检查完成：${ruleCount} 条规则`)
            } else {
                const result = await adminApi.getDomainImpact(row.sourceId)
                showToast(`域名影响检查完成：${result?.address_count ?? 0} 个地址，${result?.mail_count ?? 0} 封邮件`)
            }
            await refreshAll()
        } catch (error) {
            showToast(error?.message || '域名路由检查失败')
        } finally {
            actionBusy.value = ''
        }
    }

    const checkCurrentDomainImpact = async () => {
        const row = currentDomain.value
        if (!row?.sourceId) {
            showToast('当前域名来自公开设置，无法计算生产停用影响')
            return
        }
        if (!showAdminPage.value) {
            showToast('请先登录管理员会话后再检查停用影响')
            return
        }
        if (actionBusy.value) {
            showToast('已有生产操作执行中')
            return
        }
        actionBusy.value = 'domain-impact'
        try {
            const result = await adminApi.getDomainImpact(row.sourceId)
            showToast(`停用影响：${result?.address_count ?? 0} 个地址，${result?.mail_count ?? 0} 封邮件`)
        } catch (error) {
            showToast(error?.message || '停用影响检查失败')
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
        if (!domainRow?.sourceId && !domainRow?.id) throw new Error('当前域名不是 D1 管理记录')
        const id = domainRow.sourceId || domainRow.id
        const configVersion = domainRow.configVersion || domainRow.config_version
        const result = await adminApi.startDomainVerification(id, configVersion)
        await refreshAll()
        if (!silent) {
            const target = result?.verification_address || '验证地址'
            showToast(`验证已开始，请向 ${target} 发送测试邮件`)
        }
        return result
    }

    const checkDomainVerification = async (domainRow) => {
        if (!domainRow?.sourceId) {
            showToast('当前域名不是 D1 管理记录，无法检查验证')
            return
        }
        await runProductionAction(
            'domain-verify-check',
            '检查域名验证',
            '',
            async () => {
                const result = await adminApi.checkDomainVerification(domainRow.sourceId, domainRow.configVersion)
                await refreshAll()
                if (result?.success === false) {
                    showToast(`还没有收到验证邮件：${result?.verification_address || domainRow.verificationAddress || domainRow.domain}`)
                } else {
                    showToast(`${domainRow.domain} 已验证，可进入地址创建流程`)
                }
            }
        )
    }

    const performCloudflareSetup = async (domainRow) => {
        const check = await adminApi.checkCloudflareDomain(domainRow.sourceId)
        if (!check?.automatic_setup_supported) {
            throw new Error('当前域名不是 Cloudflare zone 根域，暂不支持自动配置子域名')
        }
        const replaceCatchAll = !!check?.setup_preview?.catch_all_conflict
            && window.confirm(`Cloudflare 上已有 catch-all 规则。确认替换为发送到 Worker：${domainRow.domain}？`)
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
            showToast('当前域名不是 D1 管理记录，无法自动配置 Cloudflare')
            return
        }
        if (domainRow.receiveMode && domainRow.receiveMode !== 'cloudflare_email') {
            showToast('当前域名不是 Cloudflare Email Routing 模式')
            return
        }
        await runProductionAction(
            'cloudflare-setup',
            'Cloudflare 自动配置',
            `确认在 Cloudflare 为 ${domainRow.domain} 配置 Email Routing DNS 和 catch-all 到 Worker？如检测到已有 catch-all，会先要求二次确认。`,
            async () => {
                const verification = await performCloudflareSetup(domainRow)
                showToast(verification?.verification_address
                    ? `Cloudflare 已配置，请向 ${verification.verification_address} 发送测试邮件后检查验证`
                    : 'Cloudflare 已配置，请开始域名验证')
            }
        )
    }

    const createAndActivateDomain = async () => {
        if (domainActivationBusy.value) return
        const domain = domainActivationForm.domain.trim().toLowerCase()
        if (!domain) {
            showToast('请输入域名')
            return
        }
        if (!requireProductionWrite('新增接收域')) return
        const mode = domainActivationForm.receiveMode
        const label = mode === 'cloudflare_email' ? 'Cloudflare 自动配置' : 'ImprovMX 转发验证'
        if (!window.confirm(`确认新增 ${domain} 并启动 ${label}？`)) return
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
            if (!row) throw new Error('域名已创建，但刷新后未找到记录')
            const rowRef = {
                sourceId: row.id,
                domain: row.domain,
                receiveMode: row.receive_mode,
                configVersion: row.config_version,
            }
            if (mode === 'cloudflare_email') {
                const verification = await performCloudflareSetup(rowRef)
                showToast(verification?.verification_address
                    ? `Cloudflare 已配置，请向 ${verification.verification_address} 发送测试邮件后检查验证`
                    : 'Cloudflare 已配置，请开始域名验证')
            } else if (mode === 'improvmx_forward') {
                const verification = await startDomainVerification({
                    id: row.id,
                    config_version: row.config_version,
                }, true)
                showToast(`ImprovMX collector 已生成：${verification?.collector_address || row.collector_address || '请刷新查看'}`)
            }
            domainActivationOpen.value = false
        } catch (error) {
            showToast(error?.message || '新增域名失败')
        } finally {
            domainActivationBusy.value = false
            actionBusy.value = ''
        }
    }

    const runHealthCheck = async () => {
        if (!showAdminPage.value) {
            showToast('请先登录管理员会话后再执行健康检查')
            return
        }
        if (actionBusy.value) {
            showToast('已有生产操作执行中')
            return
        }
        actionBusy.value = 'health-check'
        try {
            await refreshAll()
            const apiState = workerStatusLabel.value
            const dbState = opsRows.value[1]?.status || dbVersionLabel.value
            showToast(`健康检查完成：Worker ${apiState}，D1 ${dbState}`)
        } catch (error) {
            showToast(error?.message || '健康检查失败')
        } finally {
            actionBusy.value = ''
        }
    }

    const handleAction = async (type) => {
        if (type === 'refresh') {
            await refreshAll()
            showToast('同步完成，当前选中项已保留')
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
            showToast('筛选已清除')
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
                '开始域名验证',
                `确认为 ${currentDomain.value?.domain || '当前域名'} 生成新的验证地址？旧验证地址会失效。`,
                async () => startDomainVerification(currentDomain.value)
            )
            return
        }
        if (type === 'verify-check') {
            await checkDomainVerification(currentDomain.value)
            return
        }
        showToast('该操作缺少可验证的生产写入合同')
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
