<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../api'
import { useGlobalState } from '../store'
import { hashPassword } from '../utils'
import { processItem } from '../utils/email-parser'
import { adminApi, loadAdminSnapshot } from '../admin/admin-api'
import { useAdminConsoleActions } from '../admin/admin-console-actions'
import { useAdminFeedback } from '../admin/admin-feedback'
import AdminConsoleShell from '../admin/components/AdminConsoleShell.vue'
import AdminLoginView from '../admin/components/AdminLoginView.vue'
import AdminOverlays from '../admin/components/AdminOverlays.vue'
import AdminToast from '../admin/components/AdminToast.vue'
import AdminWorkspace from '../admin/components/AdminWorkspace.vue'
import { buildAdminMailHierarchy, buildAdminMailRail, useAdminMailFlow } from '../admin/admin-mail-flow'
import {
    buildAdminAddressRail,
    buildAdminAddressRows,
    buildAdminAuditRows,
    buildAdminExceptionRail,
    buildAdminProcessingRows,
    buildAdminShareRows,
    buildAdminUserRows,
} from '../admin/admin-identity-access'
import {
    buildAdminNotificationRail,
    buildAdminNotificationRows,
    buildAdminOpsBoundaryItems,
    buildAdminOpsRail,
    buildAdminOpsRows,
    buildAdminSendBoxRows,
    buildAdminSenderAccessRows,
    buildAdminStateCards,
} from '../admin/admin-operations-delivery'
import {
    createInitialAdminRouteState,
    useAdminRouteState,
} from '../admin/admin-route-state'
import {
    buildAdminDomainRail,
    buildAdminDomainRows,
    buildAdminRouteRows,
    buildRoutingActivationRows,
} from '../admin/admin-routing-domain'
import { useAdminSession } from '../admin/admin-session'
import {
    clampNumber,
    formatNumber,
    getDomain,
} from '../admin/admin-formatters'
import {
    ROADMAP_ROWS as roadmapRows,
    SIDEBAR_COLLAPSED_KEY,
    STATIC_RISKS as staticRisks,
    TABLE_SPECS as tableSpecs,
    VIEW_META as viewMeta,
} from '../admin/admin-view-config'

const route = useRoute()
const router = useRouter()

const {
    adminAuth,
    showAdminAuth,
    loading,
    openSettings,
    showAdminPage,
    userSettings,
} = useGlobalState()

const detailOpen = ref(false)
const initialRouteState = createInitialAdminRouteState(
    route.query,
    typeof localStorage === 'undefined' ? undefined : localStorage,
)

const ui = reactive({
    ...initialRouteState,
    syncing: false,
    mailRenderMode: 'html',
    mailColumns: {
        facets: 220,
        list: 540,
        detail: 820,
    },
    selected: {
        ...initialRouteState.selected,
        identity: 'addr-ops',
        routing: 'domain-cloudflare',
        delivery: 'notify-mailhook',
        access: 'risk-html',
        ops: 'worker',
        roadmap: 'road-mobile',
        logs: '',
        users: '',
        audit: '',
    },
})

const mailListRef = ref(null)
const shellRef = ref(null)
const collapsedMailDomains = ref(new Set())

if (typeof localStorage !== 'undefined') {
    try {
        collapsedMailDomains.value = new Set(JSON.parse(localStorage.getItem('ets-admin-collapsed-mail-domains') || '[]'))
    } catch {
        collapsedMailDomains.value = new Set()
    }
}

const resetMailListScroll = () => {
    nextTick(() => {
        mailListRef.value?.scrollMailToTop?.()
    })
}

const mailGridStyle = computed(() => ({
    '--mail-facets-width': `${ui.mailColumns.facets}px`,
    '--mail-list-width': `${ui.mailColumns.list}px`,
    '--mail-detail-width': `${ui.mailColumns.detail}px`,
}))

const startMailColumnResize = (edge, event) => {
    if (window.matchMedia('(max-width: 900px)').matches) return
    event.preventDefault()
    const startX = event.clientX
    const start = { ...ui.mailColumns }
    const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX
        if (edge === 'facets-list') {
            ui.mailColumns.facets = clampNumber(start.facets + delta, 180, 320)
        } else {
            const nextList = clampNumber(start.list + delta, 360, 760)
            const appliedDelta = nextList - start.list
            ui.mailColumns.list = nextList
            ui.mailColumns.detail = clampNumber(start.detail - appliedDelta, 480, 1100)
        }
    }
    const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
}

const live = reactive({
    overview: null,
    statistics: null,
    domains: [],
    domainAutomation: null,
    mailDomains: [],
    mailAddresses: [],
    mails: [],
    mailTotalCount: null,
    mailUnreadCount: null,
    unknownMails: [],
    addresses: [],
    accessPackages: [],
    auditEvents: [],
    accessEvents: [],
    users: [],
    workerConfig: null,
    dbVersion: null,
    mailWebhook: null,
    globalWebhook: null,
    telegram: null,
    aiSettings: null,
    senderAccess: [],
    sendBox: [],
    errors: [],
    fetchedAdmin: false,
    lastSynced: '',
})

const {
    disposeFeedback,
    showToast,
    toastState,
} = useAdminFeedback()
const sidebarCollapsed = ref(
    typeof localStorage === 'undefined'
        ? false
        : localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
)

const activeView = computed(() => viewMeta[ui.view] ? ui.view : 'overview')
const activeMeta = computed(() => viewMeta[activeView.value])
const pageTitle = computed(() => `${activeMeta.value.title} · Email Transfer Station`)
const detailContext = computed(() => ui.detailKind || activeView.value)
const workerStatusLabel = computed(() => {
    if (!showAdminPage.value) return '需登录'
    const database = live.workerConfig?.DIAGNOSTICS?.database
    if (!live.workerConfig) return live.fetchedAdmin ? '未知' : '待同步'
    return database?.ok === false ? '需巡检' : '可用'
})
const dbVersionLabel = computed(() => {
    if (!showAdminPage.value) return '需登录'
    return live.dbVersion?.code_db_version || live.workerConfig?.DIAGNOSTICS?.database?.code_version || '未知'
})
const syncLabel = computed(() => {
    if (ui.syncing) return '同步中'
    if (!showAdminPage.value) return '公开设置'
    if (blockingLoadErrors.value.length) return '同步部分失败'
    return live.lastSynced ? `已同步 ${live.lastSynced}` : '待同步'
})

useHead({
    title: () => pageTitle.value,
    meta: [
        { name: 'description', content: 'Email Transfer Station admin console' },
        { name: 'apple-mobile-web-app-title', content: 'Email Transfer Station Admin' },
    ],
})

const clearAdminSessionState = () => {
    live.overview = null
    live.statistics = null
    live.domains = []
    live.domainAutomation = null
    live.mailDomains = []
    live.mailAddresses = []
    live.mails = []
    live.mailTotalCount = null
    live.mailUnreadCount = null
    live.unknownMails = []
    live.addresses = []
    live.accessPackages = []
    live.auditEvents = []
    live.accessEvents = []
    live.users = []
    live.workerConfig = null
    live.dbVersion = null
    live.mailWebhook = null
    live.globalWebhook = null
    live.telegram = null
    live.aiSettings = null
    live.senderAccess = []
    live.sendBox = []
    live.errors = []
    live.fetchedAdmin = false
    live.lastSynced = ''
}

const {
    persistView,
    replaceRouteQuery,
    setView,
    syncMailQueryToRoute,
    syncSelectionFromRoute,
} = useAdminRouteState({
    route,
    router,
    ui,
    detailOpen,
    storage: typeof localStorage === 'undefined' ? undefined : localStorage,
})

const recordLoadError = (label, error) => {
    const text = `${label}: ${error?.message || error || 'error'}`
    if (!live.errors.includes(text)) live.errors.push(text)
}

const adminMessageSink = {
    error: (text) => recordLoadError('settings', text),
}

const adminNotificationSink = {
    info: () => {},
}

const fetchAdminData = async () => {
    if (!showAdminPage.value) return
    Object.assign(live, await loadAdminSnapshot())
    live.fetchedAdmin = true
    live.lastSynced = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

const refreshAll = async () => {
    ui.syncing = true
    try {
        if (!showAdminPage.value || showAdminAuth.value) return
        if (!openSettings.value.fetched) await api.getOpenSettings(adminMessageSink, adminNotificationSink)
        if (!userSettings.value.fetched) await api.getUserSettings(adminMessageSink)
        await fetchAdminData()
    } finally {
        ui.syncing = false
    }
}

const {
    authFunc,
    cfToken,
    initializeAdminSession,
    needsAdminLogin,
    resetAdminLogin,
    tmpAdminAccount,
    tmpAdminAuth,
    turnstileRef,
} = useAdminSession({
    client: adminApi,
    adminAuth,
    showAdminAuth,
    showAdminPage,
    openSettings,
    hashPassword,
    hasAdminData: () => live.fetchedAdmin,
    clearAdminData: clearAdminSessionState,
    refreshAdminData: refreshAll,
    notify: showToast,
})

const overviewDomains = computed(() => live.overview?.domains || [])

const domainRows = computed(() => buildAdminDomainRows({
    domains: live.domains,
    overviewDomains: overviewDomains.value,
    mailDomains: live.mailDomains,
    openSettings: openSettings.value,
}))

const addressRows = computed(() => buildAdminAddressRows(
    live.addresses,
    openSettings.value.enableAddressPassword,
))

const {
    canGoNextMail,
    canGoPrevMail,
    closeMailDetail,
    currentDisplayMail,
    currentMail,
    currentRendererMail,
    filterRows,
    filteredMailRows,
    filteredUnknownRows,
    mailRows,
    openMailFromAddress,
    selectAdjacentMail,
    setMailAddress,
    setMailDomain,
    setMailStatus,
    unknownRows,
    updateMailSearch,
} = useAdminMailFlow({
    getMails: () => live.mails,
    getUnknownMails: () => live.unknownMails,
    ui,
    activeView,
    parseItem: processItem,
    resetListScroll: resetMailListScroll,
    syncRoute: syncMailQueryToRoute,
    replaceRouteQuery,
    persistView,
    selectMail: (id) => selectRow('flow', id),
    onSelectionMissing: () => {
        if (activeView.value === 'flow') replaceRouteQuery({ mailId: undefined, mode: undefined }, ['item'])
    },
    onParseError: (error) => console.error(error),
})

const routeRows = computed(() => buildAdminRouteRows(domainRows.value, live.mailWebhook))
const routingActivationRows = computed(() => buildRoutingActivationRows(
    domainRows.value,
    live.domainAutomation,
))

const shareRows = computed(() => buildAdminShareRows(live.accessPackages))
const senderAccessRows = computed(() => buildAdminSenderAccessRows(live.senderAccess))
const sendBoxRows = computed(() => buildAdminSendBoxRows(live.sendBox))
const userRows = computed(() => buildAdminUserRows(live.users))
const notificationRows = computed(() => buildAdminNotificationRows({
    mailWebhook: live.mailWebhook,
    telegram: live.telegram,
    aiSettings: live.aiSettings,
    enableSendMail: openSettings.value.enableSendMail,
}))
const auditRows = computed(() => buildAdminAuditRows(live.auditEvents, live.accessEvents))
const processingRows = computed(() => buildAdminProcessingRows(auditRows.value))
const opsRows = computed(() => buildAdminOpsRows({
    workerConfig: live.workerConfig,
    dbVersion: live.dbVersion,
    showAdminPage: showAdminPage.value,
}))
const opsBoundaryItems = computed(() => buildAdminOpsBoundaryItems(opsRows.value))

const explicitUnreadMailCount = computed(() => {
    if (Number.isFinite(Number(live.mailUnreadCount))) return Number(live.mailUnreadCount)
    return mailRows.value.filter((row) => (
        row.unread === true
        || row.is_read === false
        || row.read_at === null
    )).length
})
const blockingLoadErrors = computed(() => live.errors.filter((item) => !String(item).startsWith('telegram:')))
const pageLoadErrors = computed(() => {
    const errors = blockingLoadErrors.value
    const pick = (patterns) => errors.filter((item) => patterns.some((pattern) => pattern.test(String(item))))
    if (activeView.value === 'flow') {
        return pick([/^mails:/, /^mail domains:/, /^mail addresses:/, /^unknown mails:/])
    }
    if (activeView.value === 'routing') {
        return pick([/^overview:/, /^domains:/, /^mail domains:/, /^worker configs:/])
    }
    if (activeView.value === 'identity') {
        return pick([/^addresses:/, /^users:/])
    }
    if (activeView.value === 'access') {
        return pick([/^access packages:/, /^audit events:/, /^access events:/])
    }
    if (activeView.value === 'delivery') {
        return pick([/^mail webhook:/, /^global webhook:/, /^ai extract:/, /^sender access:/, /^sendbox:/])
    }
    if (activeView.value === 'ops') return errors
    return []
})
const navBadges = computed(() => ({
    overview: null,
    mails: explicitUnreadMailCount.value > 0
        ? { value: explicitUnreadMailCount.value, label: `${formatNumber(explicitUnreadMailCount.value)} 封未读` }
        : null,
    addresses: null,
    domains: null,
    delivery: null,
    access: null,
    ops: blockingLoadErrors.value.length > 0 ? { dot: true, label: '部分后台接口暂不可用' } : null,
    roadmap: null,
}))
const activeStatusOptions = computed(() => {
    if (activeView.value === 'flow') return [
        { value: 'all', label: '全部状态' },
        { value: '未读', label: '未读' },
        { value: '已读', label: '已读' },
        { value: 'attachment', label: '有附件' },
        { value: '已保存', label: '已保存' },
        { value: '未知地址', label: '未知地址' },
    ]
    if (activeView.value === 'access') return [
        { value: 'all', label: '全部状态' },
        { value: 'active', label: 'active' },
        { value: 'success', label: 'success' },
    ]
    return []
})
const activeStatusValue = computed({
    get: () => activeStatusOptions.value.some((option) => option.value === ui.status) ? ui.status : 'all',
    set: (value) => {
        ui.status = value || 'all'
    },
})

const hasActiveFilters = computed(() =>
    !!ui.query
    || ui.domain !== 'all'
    || ui.address !== 'all'
    || ui.status !== 'all'
)

const domainOptions = computed(() => {
    const domains = new Set(domainRows.value.map((row) => row.domain).filter(Boolean))
    return ['all', ...domains]
})

const addressOptions = computed(() => {
    const addresses = new Set([
        ...addressRows.value.map((row) => row.address).filter(Boolean),
        ...mailRows.value.map((row) => row.to).filter((value) => value && value !== '-'),
    ])
    return ['all', ...addresses]
})

const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed.value ? '1' : '0')
    }
}

const mailHierarchy = computed(() => buildAdminMailHierarchy({
    mails: mailRows.value,
    unknownMails: unknownRows.value,
    domains: domainRows.value,
    addresses: addressOptions.value,
    totalCount: live.mailTotalCount,
    unreadCount: explicitUnreadMailCount.value,
}))

const selectedMailDomain = computed(() => (ui.address !== 'all' ? getDomain(ui.address) : ui.domain))

const isMailDomainCollapsed = (domain) => {
    if (!domain || domain === selectedMailDomain.value) return false
    return collapsedMailDomains.value.has(domain)
}

const persistCollapsedMailDomains = () => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem('ets-admin-collapsed-mail-domains', JSON.stringify([...collapsedMailDomains.value]))
}

const toggleMailDomain = (domain) => {
    if (!domain) return
    const next = new Set(collapsedMailDomains.value)
    if (next.has(domain)) next.delete(domain)
    else next.add(domain)
    collapsedMailDomains.value = next
    persistCollapsedMailDomains()
}

const stateCards = computed(() => buildAdminStateCards({
    workerConfig: live.workerConfig,
    workerStatusLabel: workerStatusLabel.value,
    showAdminPage: showAdminPage.value,
    mailTotalCount: live.mailTotalCount,
    mailRowCount: mailRows.value.length,
    mailWebhook: live.mailWebhook,
}))

const activePanels = computed(() => {
    const view = activeView.value
    if (view === 'overview') {
        return [
            { id: 'domains', title: '入口状态', columns: tableSpecs.domains, rows: filterRows(domainRows.value), kind: 'routing', layout: 'split' },
            { id: 'logs', title: '最近处理', columns: tableSpecs.logs, rows: filterRows(processingRows.value), kind: 'logs' },
        ]
    }
    if (view === 'flow') {
        return [
            { id: 'mails', title: '邮件记录', columns: tableSpecs.mails, rows: filterRows(mailRows.value), kind: 'flow', layout: 'split' },
            { id: 'unknown', title: '异常队列', columns: tableSpecs.risks, rows: filterRows(unknownRows.value), kind: 'access', layout: 'split' },
            { id: 'logs', title: '处理日志', columns: tableSpecs.logs, rows: filterRows(processingRows.value), kind: 'logs' },
        ]
    }
    if (view === 'identity') {
        return [
            { id: 'addresses', title: '地址账本', columns: tableSpecs.addresses, rows: filterRows(addressRows.value), kind: 'identity' },
            { id: 'users', title: '用户与角色', columns: tableSpecs.users, rows: filterRows(userRows.value), kind: 'users', layout: 'third' },
        ]
    }
    if (view === 'routing') {
        return [
            { id: 'domains', title: '域名与接收方式', columns: tableSpecs.routing, rows: filterRows(domainRows.value), kind: 'routing' },
            { id: 'destinations', title: '转发目的地', columns: tableSpecs.destinations, rows: filterRows(routeRows.value), kind: 'routing', layout: 'split' },
        ]
    }
    if (view === 'delivery') {
        return [
            { id: 'channels', title: '出站与通知通道', columns: tableSpecs.notifications, rows: filterRows(notificationRows.value), kind: 'delivery' },
            { id: 'sender', title: '地址级发送', columns: tableSpecs.sender, rows: filterRows(senderAccessRows.value), kind: 'delivery', layout: 'third' },
            { id: 'sendbox', title: '发送箱', columns: tableSpecs.mails, rows: filterRows(sendBoxRows.value), kind: 'delivery', layout: 'third' },
        ]
    }
    if (view === 'access') {
        return [
            { id: 'shares', title: '访问包', columns: tableSpecs.shares, rows: filterRows(shareRows.value), kind: 'access', layout: 'split' },
            { id: 'risks', title: '审阅风险', columns: tableSpecs.risks, rows: filterRows(staticRisks), kind: 'access', layout: 'split' },
            { id: 'audit', title: '审计与访问日志', columns: tableSpecs.audit, rows: filterRows(auditRows.value), kind: 'audit' },
        ]
    }
    if (view === 'ops') {
        return [
            { id: 'ops', title: '运行维护', columns: tableSpecs.ops, rows: filterRows(opsRows.value), kind: 'ops' },
        ]
    }
    return [
        { id: 'roadmap', title: '能力路线', columns: tableSpecs.roadmap, rows: filterRows(roadmapRows), kind: 'roadmap' },
    ]
})

const selectRow = (kind, id) => {
    if (ui.selected[kind] !== undefined) {
        ui.selected[kind] = id
    }
    if ((kind === 'flow' || kind === 'exception') && activeView.value !== 'flow') {
        ui.view = 'flow'
        ui.detailKind = kind
        ui.flowMode = 'detail'
        detailOpen.value = false
        persistView('flow')
        replaceRouteQuery({
            view: 'flow',
            mailId: kind === 'flow' ? id : undefined,
            item: kind === 'exception' ? id : undefined,
            mode: 'detail',
        }, kind === 'flow' ? ['item'] : ['mailId'])
        if (kind === 'flow') {
            const row = mailRows.value.find((item) => item.id === id)
            markAdminMailRead(row)
        }
        return
    }
    if (activeView.value === 'flow' && (kind === 'flow' || kind === 'exception')) {
        ui.detailKind = kind
        detailOpen.value = false
    } else if (['flow', 'exception', 'identity', 'routing', 'delivery', 'ops', 'roadmap'].includes(kind)) {
        ui.detailKind = kind
        detailOpen.value = true
    }
    if (kind === 'flow' || kind === 'exception') {
        ui.flowMode = 'detail'
        replaceRouteQuery({
            view: activeView.value,
            mailId: kind === 'flow' ? id : undefined,
            item: kind === 'exception' ? id : undefined,
            mode: 'detail',
        }, kind === 'flow' ? ['item'] : ['mailId'])
    }
    if (kind === 'flow') {
        const row = mailRows.value.find((item) => item.id === id)
        markAdminMailRead(row)
    }
}

const isSelected = (kind, row) => ui.selected[kind] === row.id

const handleRowKey = (event, kind, row) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectRow(kind, row.id)
}

const closeDetail = () => {
    detailOpen.value = false
}

const markAdminMailRead = async (row) => {
    if (!row?.sourceId || row.unread === false || row.is_read === true || !showAdminPage.value) return
    try {
        const result = await adminApi.markMailRead(row.sourceId)
        const target = live.mails.find((item) => String(item.id) === String(row.sourceId))
        if (target) {
            target.read_at = result?.read_at || target.read_at || new Date().toISOString()
            target.is_read = true
            target.unread = false
        }
        if (Number.isFinite(Number(live.mailUnreadCount))) {
            live.mailUnreadCount = Math.max(0, Number(live.mailUnreadCount) - 1)
        }
    } catch (error) {
        recordLoadError('mail read state', error)
    }
}

const currentException = computed(() => unknownRows.value.find((row) => row.id === ui.selected.exception) || unknownRows.value[0])
const currentAddress = computed(() => addressRows.value.find((row) => row.id === ui.selected.identity) || addressRows.value[0])
const currentDomain = computed(() => domainRows.value.find((row) => row.id === ui.selected.routing) || domainRows.value[0])
const currentNotification = computed(() => notificationRows.value.find((row) => row.id === ui.selected.delivery) || notificationRows.value[0])

const {
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
} = useAdminConsoleActions({
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
})

const toolbarActions = computed(() => {
    const view = activeView.value
    if (view === 'flow') return [
        { label: '保留选择刷新', icon: 'refresh', action: 'refresh' },
        { label: '复制收件地址', icon: 'copy', action: 'copy' },
        { label: '批量删除', icon: 'check', action: 'delete', danger: true },
    ]
    if (view === 'identity') return [
        { label: '新增地址', icon: 'plus', modal: 'new-address', primary: true },
        { label: '复制当前地址', icon: 'copy', action: 'copy' },
        { label: '显示凭证', icon: 'lock', action: 'show-credential' },
        { label: '轮换凭证', icon: 'refresh', action: 'rotate' },
        { label: '撤销访问包', icon: 'lock', action: 'revoke' },
        { label: '清空收件', icon: 'check', action: 'clear-inbox', danger: true },
        { label: '删除地址', icon: 'check', action: 'delete-address', danger: true },
    ]
    if (view === 'routing') return [
        { label: '新增域名', icon: 'plus', action: 'new-domain' },
    ]
    if (view === 'delivery') return [
        { label: '刷新通道', icon: 'refresh', action: 'refresh' },
    ]
    if (view === 'access') return []
    if (view === 'ops') return [
        { label: '健康检查', icon: 'check', action: 'health-check' },
    ]
    return []
})

const modalTitle = computed(() => {
    const titles = {
        'new-address': '新增地址身份',
        'share-package': '生成访问包',
    }
    return actionModal.value === 'one-time-result' ? oneTimeResult.title : titles[actionModal.value] || '操作'
})

const modalPrimaryLabel = computed(() => actionModal.value === 'share-package' ? '创建访问包' : '创建地址')

const submitActionModal = async () => {
    if (actionModal.value === 'share-package') {
        await createSharePackage()
        return
    }
    if (actionModal.value === 'new-address' || actionModal.value === 'quick-create') {
        await createAddressIdentity()
    }
}

const currentRail = computed(() => {
    const context = detailContext.value
    if (context === 'flow') return buildAdminMailRail(currentDisplayMail.value || currentMail.value)
    if (context === 'exception') return buildAdminExceptionRail(currentException.value)
    if (context === 'identity') return buildAdminAddressRail(currentAddress.value)
    if (context === 'routing') return buildAdminDomainRail(currentDomain.value)
    if (context === 'delivery') return buildAdminNotificationRail(currentNotification.value)
    if (context === 'ops') return buildAdminOpsRail(opsRows.value)
    if (context === 'roadmap') {
        return {
            title: '移动端兼容准备',
            subtitle: '现在不做移动版，但不能把结构堵死',
            tags: ['桌面三栏', '抽屉详情', '底部导航'],
            kv: [
                ['桌面结构', '侧栏 + 工作区 + 详情栏'],
                ['移动映射', '底部导航 + 列表页 + 抽屉详情'],
                ['当前约束', '预留', 'status'],
                ['下一步', '稳定模块边界后拆路由文件'],
            ],
        }
    }
    return {
        title: '近期告警',
        subtitle: '来自审阅和当前运行面',
        tags: ['P1', 'P2', '路线'],
        alerts: staticRisks,
    }
})

const runRailAction = (action) => (
    action.modal ? openActionModal(action.modal) : handleAction(action.action)
)

const shellModel = computed(() => ({
    activeView: activeView.value,
    activeMeta: activeMeta.value,
    sidebarCollapsed: sidebarCollapsed.value,
    domainOptions: domainOptions.value,
    ui,
    workerStatusLabel: workerStatusLabel.value,
    dbVersionLabel: dbVersionLabel.value,
    syncLabel: syncLabel.value,
    navBadges: navBadges.value,
}))

const workspaceModel = computed(() => ({
    activeView: activeView.value,
    ui,
    stateCards: stateCards.value,
    toolbarActions: toolbarActions.value,
    actionBusy: actionBusy.value,
    activeStatusOptions: activeStatusOptions.value,
    activeStatusValue: activeStatusValue.value,
    hasActiveFilters: hasActiveFilters.value,
    pageLoadErrors: pageLoadErrors.value,
    showAdminPage: showAdminPage.value,
    opsBoundaryItems: opsBoundaryItems.value,
    mailGridStyle: mailGridStyle.value,
    mailHierarchy: mailHierarchy.value,
    filteredMailRows: filteredMailRows.value,
    filteredUnknownRows: filteredUnknownRows.value,
    mailRows: mailRows.value,
    currentRail: currentRail.value,
    currentMail: currentMail.value,
    currentRendererMail: currentRendererMail.value,
    canGoPrevMail: canGoPrevMail.value,
    canGoNextMail: canGoNextMail.value,
    explicitUnreadMailCount: explicitUnreadMailCount.value,
    domainRows: domainRows.value,
    addressRows: addressRows.value,
    blockingLoadErrors: blockingLoadErrors.value,
    workerStatusLabel: workerStatusLabel.value,
    activePanels: activePanels.value,
    routingActivationRows: routingActivationRows.value,
}))

const overlayModel = computed(() => ({
    detailOpen: detailOpen.value,
    currentRail: currentRail.value,
    actionBusy: actionBusy.value,
    domainActivationOpen: domainActivationOpen.value,
    domainActivationBusy: domainActivationBusy.value,
    domainActivationForm,
    actionModal: actionModal.value,
    modalTitle: modalTitle.value,
    oneTimeResult,
    addressCreateForm,
    addressDomainOptions: addressDomainOptions.value,
    openSettings: openSettings.value,
    selectedAddressDomain: selectedAddressDomain.value,
    currentAddress: currentAddress.value,
    shareCreateForm,
    modalPrimaryLabel: modalPrimaryLabel.value,
}))

const shellActions = {
    toggleSidebar,
    setView,
    changeDomain: () => activeView.value === 'flow'
        ? setMailDomain(ui.domain)
        : replaceRouteQuery({ domain: ui.domain === 'all' ? undefined : ui.domain }),
    updateSearch: () => activeView.value === 'flow'
        ? updateMailSearch()
        : replaceRouteQuery({ q: ui.query || undefined }),
    resetAdminLogin,
    handleAction,
}

const workspaceActions = {
    openActionModal,
    handleAction,
    changeStatus: (value) => {
        activeStatusValue.value = value
        if (activeView.value === 'flow') setMailStatus(ui.status)
        else replaceRouteQuery({ status: ui.status === 'all' ? undefined : ui.status })
    },
    syncMailQueryToRoute,
    setMailStatus,
    setMailDomain,
    isMailDomainCollapsed,
    toggleMailDomain,
    setMailAddress,
    startMailColumnResize,
    isSelected,
    selectRow,
    handleRowKey,
    closeMailDetail,
    selectAdjacentMail,
    copyCurrent,
    deleteCurrentMail,
    runRailAction,
    setView,
    openMailFromAddress,
    copyText,
    openSharePackage,
    handleDomainRowAction,
}

const overlayActions = {
    closeDetail,
    runRailAction,
    closeDomainActivation: () => {
        domainActivationOpen.value = false
    },
    createAndActivateDomain,
    closeActionModal,
    submitActionModal,
    copyText,
}

watch(pageTitle, (title) => {
    if (typeof document !== 'undefined') {
        document.title = title
    }
}, { immediate: true })

const handleGlobalKeydown = (event) => {
    const target = event.target
    const tagName = target?.tagName
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)
    const key = event.key.toLowerCase()
    if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        nextTick(() => shellRef.value?.focusSearch?.())
        return
    }
    if (!isTyping && event.key === '/') {
        event.preventDefault()
        nextTick(() => shellRef.value?.focusSearch?.())
        return
    }
    if (event.key === 'Escape' && detailOpen.value && !actionModal.value && !domainActivationOpen.value) closeDetail()
}

onMounted(() => {
    syncSelectionFromRoute()
    initializeAdminSession()
    window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGlobalKeydown)
    disposeFeedback()
})
</script>

<template>
    <div class="admin-next-host">
        <AdminLoginView v-if="needsAdminLogin" ref="turnstileRef"
            v-model:account="tmpAdminAccount" v-model:password="tmpAdminAuth" v-model:cf-token="cfToken"
            :loading="loading" :open-settings="openSettings" @submit="authFunc" />

        <AdminConsoleShell v-else ref="shellRef" :model="shellModel" :actions="shellActions">
            <AdminWorkspace ref="mailListRef" :model="workspaceModel" :actions="workspaceActions" />
            <template #overlays>
                <AdminOverlays :model="overlayModel" :actions="overlayActions" />
            </template>
        </AdminConsoleShell>
        <AdminToast :state="toastState" />
    </div>
</template>

<style src="../admin/admin-next.css"></style>
