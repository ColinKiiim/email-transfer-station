<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../api'
import { useGlobalState } from '../store'
import { hashPassword } from '../utils'
import Turnstile from '../components/Turnstile.vue'
import ShadowHtmlComponent from '../components/ShadowHtmlComponent.vue'
import MailContentRenderer from '../components/MailContentRenderer.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const {
    adminAuth,
    showAdminAuth,
    loading,
    openSettings,
    showAdminPage,
    userSettings,
    isDark,
} = useGlobalState()

const viewMeta = {
    overview: { title: '运行总控', kicker: 'receiving operations' },
    flow: { title: '收件流', kicker: 'mail intake and rendering' },
    identity: { title: '地址身份', kicker: 'address ledger and credentials' },
    routing: { title: '域名与路由', kicker: 'domains and ingress routes' },
    delivery: { title: '出站与通知', kicker: 'send access and notifications' },
    access: { title: '访问治理', kicker: 'share packages and audit' },
    ops: { title: '运行维护', kicker: 'worker, d1, kv and policies' },
    roadmap: { title: '能力路线', kicker: 'planned product capabilities' },
}

const navGroups = [
    {
        label: '工作台',
        items: [
            { id: 'overview', title: '运行总控', badgeKey: 'overview', icon: 'overview' },
            { id: 'flow', title: '收件流', badgeKey: 'mails', icon: 'flow' },
        ],
    },
    {
        label: '资源',
        items: [
            { id: 'identity', title: '地址身份', badgeKey: 'addresses', icon: 'identity' },
            { id: 'routing', title: '域名与路由', badgeKey: 'domains', icon: 'routing' },
            { id: 'delivery', title: '出站与通知', badgeKey: 'delivery', icon: 'delivery' },
        ],
    },
    {
        label: '治理',
        items: [
            { id: 'access', title: '访问治理', badgeKey: 'access', icon: 'access' },
            { id: 'ops', title: '运行维护', badgeKey: 'ops', icon: 'ops' },
            { id: 'roadmap', title: '能力路线', badgeKey: 'roadmap', icon: 'roadmap' },
        ],
    },
]

const iconShapes = {
    overview: [{ tag: 'path', attrs: { d: 'M4 13h7V4H4zM13 20h7V4h-7zM4 20h7v-5H4z' } }],
    flow: [{ tag: 'path', attrs: { d: 'M4 6h16v12H4z' } }, { tag: 'path', attrs: { d: 'm4 7 8 6 8-6' } }],
    identity: [{ tag: 'path', attrs: { d: 'M4 7h16v10H4z' } }, { tag: 'path', attrs: { d: 'M8 11h5M8 14h8' } }],
    routing: [
        { tag: 'circle', attrs: { cx: '12', cy: '12', r: '8' } },
        { tag: 'path', attrs: { d: 'M4 12h16M12 4c2 2.2 3 4.8 3 8s-1 5.8-3 8M12 4c-2 2.2-3 4.8-3 8s1 5.8 3 8' } },
    ],
    delivery: [{ tag: 'path', attrs: { d: 'M4 12 20 4l-5 16-3-7z' } }],
    access: [{ tag: 'path', attrs: { d: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z' } }, { tag: 'path', attrs: { d: 'm9 12 2 2 4-5' } }],
    ops: [{ tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } }, { tag: 'path', attrs: { d: 'M19 12a7.7 7.7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.2 7.2 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a7.2 7.2 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.2 7.2 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a7.2 7.2 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z' } }],
    roadmap: [{ tag: 'path', attrs: { d: 'M5 19V5h14v14z' } }, { tag: 'path', attrs: { d: 'M8 9h8M8 13h5M8 17h6' } }],
    collapse: [{ tag: 'path', attrs: { d: 'M4 5h16v14H4z' } }, { tag: 'path', attrs: { d: 'M9 5v14M15 9l-3 3 3 3' } }],
    expand: [{ tag: 'path', attrs: { d: 'M4 5h16v14H4z' } }, { tag: 'path', attrs: { d: 'M9 5v14M12 9l3 3-3 3' } }],
    search: [{ tag: 'path', attrs: { d: 'm21 21-4.2-4.2' } }, { tag: 'circle', attrs: { cx: '11', cy: '11', r: '7' } }],
    refresh: [{ tag: 'path', attrs: { d: 'M20 12a8 8 0 1 1-2.3-5.7' } }, { tag: 'path', attrs: { d: 'M20 4v6h-6' } }],
    plus: [{ tag: 'path', attrs: { d: 'M12 5v14M5 12h14' } }],
    copy: [{ tag: 'path', attrs: { d: 'M8 8h11v11H8z' } }, { tag: 'path', attrs: { d: 'M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1' } }],
    lock: [{ tag: 'rect', attrs: { x: '5', y: '10', width: '14', height: '10', rx: '2' } }, { tag: 'path', attrs: { d: 'M8 10V7a4 4 0 0 1 8 0v3' } }],
    check: [{ tag: 'path', attrs: { d: 'm5 12 4 4L19 6' } }],
}

const designSeed = {
    domains: [
        { id: 'domain-cloudflare', domain: '20030405.xyz', label: 'Cloudflare 主收件域', mode: 'Cloudflare Email Routing', setup: '已验证', enabled: '启用', creation: '允许管理员创建', default: '默认', collector: 'catch-all -> Worker', verification: 'routing rule active', auth: 'SPF / DKIM / DMARC 巡检通过', addresses: 9, mails: 1284, updated: '2026-06-25 10:42' },
        { id: 'domain-fnrry', domain: 'colin.fnrry.com', label: '非 Cloudflare 转发域', mode: 'ImprovMX free forwarding', setup: '需复核', enabled: '启用', creation: '仅管理员', default: '否', collector: 'mx-colin-fnrry-com@20030405.xyz', verification: 'collector receiving', auth: 'DMARC 未强制', addresses: 5, mails: 642, updated: '2026-06-25 09:18' },
        { id: 'domain-cmd', domain: 'colin.cmd.gd', label: '非 Cloudflare 转发域', mode: 'ImprovMX free forwarding', setup: '已验证', enabled: '启用', creation: '仅管理员', default: '否', collector: 'mx-colin-cmd-gd@20030405.xyz', verification: 'collector receiving', auth: 'SPF 正常，DMARC 观察中', addresses: 4, mails: 304, updated: '2026-06-24 18:32' },
    ],
    addresses: [
        { id: 'addr-ops', address: 'ops@20030405.xyz', label: '运行告警入口', domain: '20030405.xyz', owner: 'admin', tags: ['系统告警', '值班'], source: '管理员创建', mails: 428, sent: 23, packages: 2, credential: '已轮换', password: '启用', note: 'Cloudflare / D1 / Worker 运行告警进入此地址', updated: '2026-06-25 10:51' },
        { id: 'addr-support', address: 'support@colin.fnrry.com', label: '外部联系入口', domain: 'colin.fnrry.com', owner: 'shared', tags: ['支持', 'ImprovMX'], source: '域名规则', mails: 612, sent: 84, packages: 3, credential: '正常', password: '启用', note: '非 Cloudflare 域转入 collector 后写入本站', updated: '2026-06-25 09:44' },
        { id: 'addr-collector-a', address: 'mx-colin-fnrry-com@20030405.xyz', label: 'collector · fnrry', domain: '20030405.xyz', owner: 'system', tags: ['Collector', '只接收入站'], source: '路由策略', mails: 642, sent: 0, packages: 0, credential: '系统保留', password: '关闭', note: 'ImprovMX 免费转发落点，不作为普通共享地址', updated: '2026-06-24 22:09' },
        { id: 'addr-lab', address: 'lab@20030405.xyz', label: '渲染验证', domain: '20030405.xyz', owner: 'admin', tags: ['测试隔离', 'HTML'], source: '管理员创建', mails: 96, sent: 18, packages: 1, credential: '待轮换', password: '启用', note: '用于 HTML 隔离渲染与附件下载策略验证', updated: '2026-06-24 16:37' },
    ],
    mails: [
        { id: 'mail-240625-03', time: '2026-06-25 11:24:31', sender: 'alerts@cloudflare.com', to: 'ops@20030405.xyz', domain: '20030405.xyz', subject: 'D1 query latency exceeded baseline', size: '12.2 KB', result: '已保存', auth: 'SPF DKIM DMARC', ip: '198.41.200.13', risk: '入站副作用已排队', body: 'Cloudflare 告警已写入 raw_mails。转发、Webhook、自动回复会等待保存结果确认后执行，避免保存失败仍触发副作用。', attachments: '0' },
        { id: 'mail-240625-02', time: '2026-06-25 11:17:36', sender: 'invoice@vendor.example', to: 'support@colin.fnrry.com', domain: 'colin.fnrry.com', subject: '月度账单与附件', size: '146.8 KB', result: '已保存', auth: 'SPF DMARC', ip: '203.0.113.44', risk: '附件可下载', body: '该邮件带 PDF 附件。访问包允许只读查看与附件下载，不允许删除、转发或查看原始凭证。', attachments: '2' },
        { id: 'mail-240625-01', time: '2026-06-25 11:12:09', sender: 'mailer-daemon@remote.net', to: 'unknown@colin.fnrry.com', domain: 'colin.fnrry.com', subject: 'Delivery status notification', size: '7.1 KB', result: '未知地址', auth: 'SPF', ip: '192.0.2.61', risk: '进入异常队列', body: '收件人没有匹配地址。当前策略保留在异常队列，管理员可创建地址、合并到现有地址或清理。', attachments: '0' },
        { id: 'mail-240624-19', time: '2026-06-24 22:09:48', sender: 'github@github.com', to: 'lab@20030405.xyz', domain: '20030405.xyz', subject: '[GitHub] Email Transfer Station workflow failed', size: '18.7 KB', result: '已保存', auth: 'SPF DKIM DMARC', ip: '140.82.113.21', risk: 'HTML 隔离渲染', body: 'HTML 正文通过隔离容器展示，详情栏保留文本和原始内容切换，避免把邮件源码直接暴露给普通阅读路径。', attachments: '0' },
    ],
    shares: [
        { id: 'pkg-duty', label: '值班只读包', address: 'ops@20030405.xyz', scopes: 'read, attachment', status: '活跃', expires: '2026-07-02 09:00', last: '2026-06-25 10:26', path: '/i/:token' },
        { id: 'pkg-support', label: '外部协作包', address: 'support@colin.fnrry.com', scopes: 'read', status: '活跃', expires: '2026-06-30 18:00', last: '2026-06-25 09:14', path: '/i/:token' },
        { id: 'pkg-old', label: '迁移观察包', address: 'lab@20030405.xyz', scopes: 'read', status: '已撤销', expires: '2026-06-20 18:00', last: '2026-06-19 20:11', path: '/i/:token' },
    ],
    users: [
        { id: 'u-admin', user: 'Admin User', role: 'Super Admin', addresses: '全部地址', auth: '管理员密码', status: '启用', last: '2026-06-25 10:59' },
        { id: 'u-friend', user: 'friend-account', role: '受限协作者', addresses: 'support@colin.fnrry.com', auth: 'OAuth / Passkey', status: '启用', last: '2026-06-24 21:07' },
        { id: 'u-ops', user: 'ops-reviewer', role: '值班审阅', addresses: 'ops@20030405.xyz', auth: '只读访问包', status: '观察', last: '2026-06-23 18:20' },
    ],
}

const staticRisks = [
    { id: 'risk-html', level: 'P1', title: 'HTML 渲染策略', owner: '邮件阅读器', status: '隔离中', detail: '所有邮件正文入口应走隔离容器、附件链接策略和文本回退，不把原始源码作为默认阅读内容。' },
    { id: 'risk-side-effect', level: 'P1', title: '入站保存失败后的副作用门禁', owner: 'Email ingress', status: '设计中', detail: '转发、Webhook、自动回复必须在保存成功后进入副作用队列。' },
    { id: 'risk-loading', level: 'P2', title: '全局 loading 竞争', owner: 'Frontend state', status: '待拆分', detail: '全局 loading 仅保留路由启动，邮件刷新、多删、域名验证使用局部状态。' },
    { id: 'risk-token', level: 'P1', title: '凭证与 token 存储模型', owner: 'Security model', status: '需决策', detail: '固定地址凭证、分享 token、管理员登录 token 需要产品级会话边界。' },
]

const roadmapRows = [
    { id: 'road-renderer', capability: '统一安全渲染层', status: '必须保留', maps: 'MailContentRenderer / ShadowHtmlComponent / SendMail HTML 预览', next: '收敛邮件正文入口，所有 HTML sink 强制走隔离渲染策略' },
    { id: 'road-gate', capability: '入站副作用门禁', status: '必须保留', maps: 'email/index.ts / forward.ts / mail webhook', next: '保存成功后再触发转发、Webhook、自动回复' },
    { id: 'road-mobile', capability: '移动端后台壳', status: '预留', maps: 'Admin.vue 顶层导航 / MailBox mobile drawer', next: '桌面信息架构稳定后拆成底部导航 + 抽屉详情' },
    { id: 'road-rbac', capability: '访问评审与 JIT 操作', status: '规划中', maps: 'AccessPackages / AuditLogs / RoleAddressConfig', next: '高风险操作先请求授权，再写审计事件' },
    { id: 'road-send', capability: '出站提供商决策', status: '待决策', maps: 'SendMail / SendBox / SenderAccess', next: '确定 Resend、SMTP 或 Cloudflare Send Email 后再固化表单' },
    { id: 'road-loading', capability: '局部请求状态', status: '必须保留', maps: 'api/index.js global loading / MailBox refresh', next: '每个模块维护自己的 pending key，刷新保留选中邮件' },
]

const migrationMapRows = [
    { id: 'map-1', newName: '地址身份', old: 'Account / CreateAccount / AddressCredentialModal / SenderAccess', rule: '按邮箱地址聚合凭证、标签、发送权限和分享包' },
    { id: 'map-2', newName: '收件流', old: 'Mails / MailsUnknow / MailBox / SendBox', rule: '按邮件生命周期聚合列表、详情、异常、刷新状态和附件操作' },
    { id: 'map-3', newName: '域名与路由', old: 'Domains / QuickSetup / WorkerConfig domains', rule: '按接收域、collector 和验证动作组织' },
    { id: 'map-4', newName: '访问治理', old: 'AccessPackages / AccessLogs / AuditLogs', rule: '按权限生命周期和审计证据组织' },
    { id: 'map-5', newName: '出站与通知', old: 'SendMail / SenderAccess / Webhook / MailWebhook / Telegram / AI', rule: '按通道与副作用队列组织' },
]

const selectedInitialView = () => {
    const queryView = Array.isArray(route.query.view) ? route.query.view[0] : route.query.view
    const stored = typeof localStorage === 'undefined' ? '' : localStorage.getItem('ets-admin-next-view')
    return viewMeta[queryView] ? queryView : (viewMeta[stored] ? stored : 'overview')
}

const queryValue = (value, fallback = '') => {
    const text = Array.isArray(value) ? value[0] : value
    return text == null || text === '' ? fallback : String(text)
}

const ui = reactive({
    view: selectedInitialView(),
    query: queryValue(route.query.q),
    domain: queryValue(route.query.domain, 'all'),
    address: queryValue(route.query.address, 'all'),
    status: queryValue(route.query.status, 'all'),
    syncing: false,
    mailRenderMode: 'html',
    flowMode: queryValue(route.query.mode, 'list'),
    mailColumns: {
        facets: 220,
        list: 540,
        detail: 820,
    },
    detailKind: '',
    selected: {
        flow: queryValue(route.query.mailId || route.query.item),
        identity: 'addr-ops',
        routing: 'domain-cloudflare',
        delivery: 'notify-mailhook',
        access: 'risk-html',
        ops: 'worker',
        roadmap: 'road-mobile',
        exception: '',
        logs: '',
        users: '',
        audit: '',
    },
})

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value))

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
            ui.mailColumns.list = clampNumber(start.list - delta, 360, 720)
        } else {
            ui.mailColumns.list = clampNumber(start.list + delta, 360, 760)
            ui.mailColumns.detail = clampNumber(start.detail - delta, 480, 1100)
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
    mailDomains: [],
    mailAddresses: [],
    mails: [],
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

const tmpAdminAuth = ref('')
const cfToken = ref('')
const turnstileRef = ref(null)
const actionModal = ref('')
const detailOpen = ref(false)
const searchInput = ref(null)
const toastState = reactive({ visible: false, text: '已处理' })
let toastTimer = 0
const SIDEBAR_COLLAPSED_KEY = 'ets-admin-next-sidebar-collapsed'
const sidebarCollapsed = ref(
    typeof localStorage === 'undefined'
        ? false
        : localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
)

const activeView = computed(() => viewMeta[ui.view] ? ui.view : 'overview')
const activeMeta = computed(() => viewMeta[activeView.value])
const pageTitle = computed(() => `${activeMeta.value.title} · Email Transfer Station`)
const demoMode = computed(() => {
    const value = Array.isArray(route.query.demo) ? route.query.demo[0] : route.query.demo
    return value === '1' || value === 'true'
})
const showAdminPasswordModal = computed(() => !demoMode.value && (!showAdminPage.value || showAdminAuth.value))
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
    return live.lastSynced ? `已同步 ${live.lastSynced}` : '待同步'
})
const dataSourceNotice = computed(() => {
    if (demoMode.value) return {
        tone: 'warn',
        title: 'Demo 数据模式',
        text: '当前显示显式 demo seed，用于原型审阅；不要按这些邮件、用户、访问包判断生产状态。',
    }
    if (!showAdminPage.value) return {
        tone: 'warn',
        title: '未登录只读预览',
        text: '当前只读取公开域名设置；邮件、用户、访问包和审计表不会用 seed 数据伪装真实后台。',
    }
    return {
        tone: 'warn',
        title: '生产后端只读试接入',
        text: '当前灰度后台连接生产 Worker/D1。本页写入和破坏性按钮保持前端 no-op，未执行生产写入。',
    }
})

useHead({
    title: () => pageTitle.value,
    meta: [
        { name: 'description', content: 'Email Transfer Station admin console' },
        { name: 'apple-mobile-web-app-title', content: 'Email Transfer Station Admin' },
    ],
})

const authFunc = async () => {
    try {
        await api.fetch('/open_api/admin_login', {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(tmpAdminAuth.value),
                cf_token: cfToken.value,
            }),
        })
        adminAuth.value = tmpAdminAuth.value
        showAdminAuth.value = false
        await refreshAll()
        showToast('管理员会话已建立')
    } catch (error) {
        showToast(error.message || '管理员登录失败')
        turnstileRef.value?.refresh?.()
    }
}

const shapeList = (name) => iconShapes[name] || iconShapes.check

const showToast = (text) => {
    toastState.text = text
    toastState.visible = true
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
        toastState.visible = false
    }, 1800)
}

const replaceRouteQuery = (patch = {}, remove = []) => {
    const query = { ...route.query, ...patch }
    remove.forEach((key) => {
        delete query[key]
    })
    Object.keys(query).forEach((key) => {
        if (query[key] === '' || query[key] == null || query[key] === 'all') delete query[key]
    })
    router.replace({
        path: route.path,
        query,
        hash: route.hash,
    }).catch(() => {})
}

const setView = async (view) => {
    if (!viewMeta[view]) return
    ui.view = view
    ui.detailKind = ''
    detailOpen.value = false
    localStorage.setItem('ets-admin-next-view', view)
    await replaceRouteQuery({ view })
}

const getDomain = (value) => {
    const text = String(value || '')
    const at = text.lastIndexOf('@')
    return at >= 0 ? text.slice(at + 1).toLowerCase() : ''
}

const modeLabel = (mode) => {
    const map = {
        cloudflare_email: 'Cloudflare Email Routing',
        improvmx_forward: 'ImprovMX free forwarding',
        external_webhook: 'External webhook',
        manual: 'Manual',
    }
    return map[mode] || mode || '-'
}

const setupLabel = (status) => {
    const map = {
        active: '已验证',
        pending_verification: '需验证',
        draft: '草稿',
        error: '失败',
        disabled: '停用',
    }
    return map[status] || status || '需复核'
}

const statusClass = (value) => {
    const v = String(value || '')
    if (/失败|撤销|异常|删除|危险|阻止|未知地址|停用|关闭|denied|failed|revoked/i.test(v)) return 'danger'
    if (/待|需|观察|警告|复核|灰度|规划|巡检|设计|pending|draft|expired|skipped/i.test(v)) return 'warn'
    if (/可用|启用|活跃|成功|已保存|已验证|正常|通过|默认|active|success|ok/i.test(v)) return 'ok'
    return 'neutral'
}

const cellText = (row, key) => row?.[key] == null || row?.[key] === '' ? '-' : row[key]

const formatNumber = (value) => Number(value || 0).toLocaleString('zh-CN')
const formatBadgeCount = (value) => Number(value || 0) > 99 ? '99+' : formatNumber(value)

const formatDate = (value) => {
    if (!value) return '-'
    return String(value).replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
}

const formatShortDate = (value) => {
    const full = formatDate(value)
    if (full === '-') return full
    const match = full.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})(?::\d{2})?/)
    if (match) return `${match[2]}-${match[3]} ${match[4]}`
    return full
}

const extractHeader = (raw, name) => {
    if (!raw) return ''
    const match = String(raw).match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))
    return match?.[1]?.trim() || ''
}

const stripHtml = (html) => String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")

const compactText = (value, fallback = '') => {
    const text = String(value || '')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
    return text || fallback
}

const compactRaw = (raw) => {
    const text = String(raw || '')
        .replace(/\r/g, '')
        .split('\n\n')
        .slice(1)
        .join('\n\n')
        .replace(/\s+/g, ' ')
        .trim()
    return text ? text.slice(0, 240) : '邮件正文会在详情页通过安全渲染策略呈现。'
}

const normalizedAttachments = (value) => {
    if (Array.isArray(value)) return value
    if (Number.isFinite(Number(value)) && Number(value) > 0) {
        return Array.from({ length: Number(value) }, (_, index) => ({
            filename: `attachment-${index + 1}`,
            size: 0,
        }))
    }
    return []
}

const formatAttachmentCount = (value) => {
    const count = Number(value || 0)
    return count > 0 ? `${count} 个附件` : '无附件'
}

const mailRenderLabel = (row) => {
    if (row?.html) return 'HTML 已隔离渲染'
    if (row?.text) return '纯文本'
    if (row?.parseStatus === 'parsed') return '已解析'
    return '仅原始邮件'
}

const safeFetch = async (label, path) => {
    try {
        return await api.fetch(path)
    } catch (error) {
        live.errors.push(`${label}: ${error.message || 'error'}`)
        return null
    }
}

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

const demoRows = (rows) => demoMode.value ? rows : []

const fetchAdminData = async () => {
    if (!showAdminPage.value) return
    live.errors = []
    const [
        overview,
        statistics,
        domains,
        mailDomains,
        mailAddresses,
        mails,
        unknownMails,
        addresses,
        accessPackages,
        auditEvents,
        accessEvents,
        users,
        workerConfig,
        dbVersion,
        mailWebhook,
        globalWebhook,
        telegram,
        aiSettings,
        senderAccess,
        sendBox,
    ] = await Promise.all([
        safeFetch('overview', '/admin/overview'),
        safeFetch('statistics', '/admin/statistics'),
        safeFetch('domains', '/admin/domains'),
        safeFetch('mail domains', '/admin/mail_domains'),
        safeFetch('mail addresses', '/admin/mail_addresses'),
        safeFetch('mails', '/admin/mails?limit=20&offset=0'),
        safeFetch('unknown mails', '/admin/mails_unknow?limit=20&offset=0'),
        safeFetch('addresses', '/admin/address?limit=50&offset=0'),
        safeFetch('access packages', '/admin/access_packages?limit=50&offset=0'),
        safeFetch('audit events', '/admin/audit_events?limit=20&offset=0'),
        safeFetch('access events', '/admin/access_events?limit=20&offset=0'),
        safeFetch('users', '/admin/users?limit=20&offset=0'),
        safeFetch('worker configs', '/admin/worker/configs'),
        safeFetch('db version', '/admin/db_version'),
        safeFetch('mail webhook', '/admin/mail_webhook/settings'),
        safeFetch('global webhook', '/admin/webhook/settings'),
        safeFetch('telegram', '/admin/telegram/status'),
        safeFetch('ai extract', '/admin/ai_extract/settings'),
        safeFetch('sender access', '/admin/address_sender?limit=20&offset=0'),
        safeFetch('sendbox', '/admin/sendbox?limit=10&offset=0'),
    ])

    live.overview = overview
    live.statistics = statistics
    live.domains = domains?.results || []
    live.mailDomains = mailDomains?.results || []
    live.mailAddresses = mailAddresses?.results || []
    live.mails = mails?.results || []
    live.mailUnreadCount = Number.isFinite(Number(mails?.unread_count)) ? Number(mails.unread_count) : null
    live.unknownMails = unknownMails?.results || []
    live.addresses = addresses?.results || []
    live.accessPackages = accessPackages?.results || []
    live.auditEvents = auditEvents?.results || []
    live.accessEvents = accessEvents?.results || []
    live.users = users?.results || []
    live.workerConfig = workerConfig
    live.dbVersion = dbVersion
    live.mailWebhook = mailWebhook
    live.globalWebhook = globalWebhook
    live.telegram = telegram
    live.aiSettings = aiSettings
    live.senderAccess = senderAccess?.results || []
    live.sendBox = sendBox?.results || []
    live.fetchedAdmin = true
    live.lastSynced = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

const refreshAll = async () => {
    ui.syncing = true
    try {
        if (!openSettings.value.fetched) await api.getOpenSettings(adminMessageSink, adminNotificationSink)
        if (!userSettings.value.fetched) await api.getUserSettings(adminMessageSink)
        await fetchAdminData()
    } finally {
        ui.syncing = false
    }
}

const overviewTotals = computed(() => live.overview?.totals || {})
const overviewDomains = computed(() => live.overview?.domains || [])

const domainRows = computed(() => {
    const overviewByDomain = new Map(overviewDomains.value.map((row) => [row.domain, row]))
    const mailByDomain = new Map(live.mailDomains.map((row) => [row.domain, row]))
    if (live.domains.length > 0) {
        return live.domains.map((row) => {
            const overviewRow = overviewByDomain.get(row.domain) || {}
            const mailRow = mailByDomain.get(row.domain) || {}
            return {
                id: `domain-${row.id || row.domain}`,
                sourceId: row.id,
                domain: row.domain,
                label: row.display_label || row.domain,
                mode: modeLabel(row.receive_mode),
                setup: setupLabel(row.setup_status),
                enabled: row.enabled ? '启用' : '关闭',
                creation: row.allow_address_creation ? '允许创建' : '仅管理员',
                default: row.is_default ? '默认' : '否',
                collector: row.collector_address || (row.receive_mode === 'cloudflare_email' ? 'catch-all -> Worker' : '-'),
                verification: row.verification_address || row.setup_status || '-',
                auth: row.source === 'env' ? 'env fallback' : row.cloudflare_zone_id ? 'Cloudflare token ready' : 'managed domain',
                addresses: overviewRow.address_count ?? mailRow.address_count ?? 0,
                mails: overviewRow.mail_count ?? mailRow.mail_count ?? 0,
                updated: row.last_verified_at || row.updated_at || '-',
            }
        })
    }
    if (Array.isArray(openSettings.value.domainRegistry) && openSettings.value.domainRegistry.length > 0) {
        return openSettings.value.domainRegistry.map((row, index) => ({
            id: `registry-${row.domain || index}`,
            domain: row.domain,
            label: row.display_label || row.label || row.domain,
            mode: modeLabel(row.receive_mode),
            setup: setupLabel(row.setup_status),
            enabled: row.enabled === false ? '关闭' : '启用',
            creation: row.allow_address_creation ? '允许创建' : '仅管理员',
            default: row.is_default ? '默认' : '否',
            collector: row.collector_address || '-',
            verification: row.verification_address || '-',
            auth: row.source || 'open settings',
            addresses: 0,
            mails: 0,
            updated: row.last_verified_at || '-',
        }))
    }
    if (Array.isArray(openSettings.value.domains) && openSettings.value.domains.length > 0) {
        return openSettings.value.domains.map((row) => ({
            id: `open-${row.value}`,
            domain: row.value,
            label: row.label || row.value,
            mode: 'Worker env registry',
            setup: '需复核',
            enabled: '启用',
            creation: openSettings.value.defaultDomains?.includes(row.value) ? '允许创建' : '仅管理员',
            default: openSettings.value.defaultDomains?.[0] === row.value ? '默认' : '否',
            collector: '-',
            verification: '-',
            auth: 'open settings',
            addresses: 0,
            mails: 0,
            updated: '-',
        }))
    }
    return demoRows(designSeed.domains)
})

const addressRows = computed(() => {
    if (live.addresses.length > 0) {
        return live.addresses.map((row) => {
            const tags = Array.isArray(row.labels)
                ? row.labels.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean)
                : (row.display_label ? [row.display_label] : [])
            return {
                id: `addr-${row.id}`,
                sourceId: row.id,
                address: row.name,
                label: row.display_label || row.name,
                domain: getDomain(row.name),
                owner: row.user_id ? `user:${row.user_id}` : 'admin',
                tags,
                source: row.source || '管理员创建',
                mails: row.mail_count || 0,
                sent: row.send_count || 0,
                packages: row.active_share_token_count || 0,
                credential: row.credential_version ? `v${row.credential_version}` : '正常',
                password: openSettings.value.enableAddressPassword ? '启用' : '关闭',
                note: row.owner_note || row.source_meta || '地址身份记录',
                updated: row.updated_at || '-',
            }
        })
    }
    return demoRows(designSeed.addresses)
})

const mailRows = computed(() => {
    const rows = live.mails.length > 0 ? live.mails : []
    if (rows.length > 0) {
        return rows.map((row) => {
            const subject = compactText(row.subject, extractHeader(row.raw, 'Subject') || row.message_id || `Mail #${row.id}`)
            const sender = compactText(row.sender, extractHeader(row.raw, 'From') || row.source || '-')
            const address = row.address || row.original_recipient || '-'
            const text = compactText(row.text)
            const html = String(row.html || row.message || '')
            const body = text || compactText(stripHtml(html), compactRaw(row.raw))
            const attachments = normalizedAttachments(row.attachments)
            const attachmentCount = Number.isFinite(Number(row.attachment_count))
                ? Number(row.attachment_count)
                : attachments.length
            const hasReadState = row.read_at !== undefined || row.is_read !== undefined || row.unread !== undefined
            const hasReadAt = typeof row.read_at === 'string' && row.read_at.length > 0
            const isRead = hasReadState
                ? row.is_read === true || row.is_read === 1 || row.is_read === '1' || hasReadAt
                : undefined
            const unread = hasReadState
                ? row.unread === true || row.unread === 1 || row.unread === '1' || !isRead
                : undefined
            return {
                id: `mail-${row.id}`,
                sourceId: row.id,
                read_at: row.read_at,
                is_read: isRead,
                unread,
                time: formatShortDate(row.created_at),
                fullTime: formatDate(row.created_at),
                created_at: row.created_at,
                sender,
                to: address,
                domain: row.original_domain || getDomain(address),
                subject,
                size: row.raw ? `${(String(row.raw).length / 1024).toFixed(1)} KB` : '-',
                result: address === '-' ? '未知地址' : '已保存',
                auth: row.recipient_confidence || row.ingress_source || '-',
                ip: row.source || '-',
                risk: row.ingress_source === 'collector-unresolved' ? '进入异常队列' : mailRenderLabel({ html, text, parseStatus: row.parse_status }),
                body,
                text,
                html,
                message: html || text,
                raw: row.raw || '',
                attachments,
                attachmentCount,
                attachmentLabel: formatAttachmentCount(attachmentCount),
                parseStatus: row.parse_status || 'unknown',
            }
        })
    }
    return demoRows(designSeed.mails).map((row) => {
        const attachments = normalizedAttachments(row.attachments)
        const attachmentCount = Number.isFinite(Number(row.attachments))
            ? Number(row.attachments)
            : attachments.length
        return {
            ...row,
            fullTime: row.time,
            is_read: true,
            unread: false,
            text: row.body,
            html: '',
            raw: '',
            attachments,
            attachmentCount,
            attachmentLabel: formatAttachmentCount(attachmentCount),
            parseStatus: 'demo',
        }
    })
})

const unknownRows = computed(() => {
    const rows = live.unknownMails.length > 0 ? live.unknownMails : []
    if (rows.length > 0) {
        return rows.map((row) => {
            const title = compactText(row.subject, extractHeader(row.raw, 'Subject') || `未知收件人 #${row.id}`)
            const detail = compactText(row.text, compactText(stripHtml(row.html || row.message), compactRaw(row.raw)))
            return {
                id: `unknown-${row.id}`,
                level: 'P2',
                title,
                owner: row.address || row.original_recipient || '收件流',
                status: '未知地址',
                detail,
                domain: row.original_domain || getDomain(row.address),
            }
        })
    }
    return demoRows(staticRisks)
})

const routeRows = computed(() => {
    const routes = domainRows.value.map((row) => ({
        id: `route-${row.domain}`,
        destination: row.collector || 'Worker Email Handler',
        domain: row.domain,
        type: row.mode,
        inUse: row.addresses,
        status: row.enabled,
        next: row.mode.includes('ImprovMX') ? '复核 collector 与 DMARC' : '保持 catch-all 到 Worker',
    }))
    routes.push({
        id: 'route-hook',
        destination: '/admin/mail_webhook/settings',
        domain: '全部域名',
        type: 'Webhook',
        inUse: live.mailWebhook?.enabled ? 1 : 0,
        status: live.mailWebhook?.enabled ? '启用' : '需更新',
        next: '保存成功门禁未接入前仅显示配置状态',
    })
    return routes
})

const shareRows = computed(() => {
    if (live.accessPackages.length > 0) {
        return live.accessPackages.map((row) => ({
            id: `pkg-${row.id}`,
            sourceId: row.id,
            label: row.label || `访问包 #${row.id}`,
            address: row.address,
            scopes: row.scopes || 'read',
            status: row.status || 'active',
            expires: formatDate(row.expires_at),
            last: formatDate(row.last_used_at),
            path: '/i/:token',
        }))
    }
    return demoRows(designSeed.shares)
})

const senderAccessRows = computed(() => {
    if (live.senderAccess.length > 0) {
        return live.senderAccess.map((row) => ({
            id: `sender-${row.id}`,
            sourceId: row.id,
            address: row.address || '-',
            balance: Number.isFinite(Number(row.balance)) ? Number(row.balance) : 0,
            status: row.enabled === 0 || row.enabled === false ? '关闭' : '启用',
            created: formatDate(row.created_at),
            note: row.enabled === 0 || row.enabled === false
                ? '发送权限已关闭'
                : '地址级发送权限记录',
        }))
    }
    return demoRows([])
})

const sendBoxRows = computed(() => {
    if (live.sendBox.length > 0) {
        return live.sendBox.map((row) => {
            const raw = String(row.raw || '')
            const subject = compactText(extractHeader(raw, 'Subject') || `Sendbox #${row.id}`)
            const sender = compactText(extractHeader(raw, 'From') || row.address || '-')
            const to = compactText(extractHeader(raw, 'To') || '-')
            return {
                id: `sendbox-${row.id}`,
                sourceId: row.id,
                time: formatShortDate(row.created_at),
                fullTime: formatDate(row.created_at),
                sender,
                to,
                domain: getDomain(row.address),
                subject,
                result: '已发送',
                risk: '发送箱记录',
                auth: 'sendbox',
                ip: row.address || '-',
                body: compactRaw(raw),
                raw,
                attachmentCount: 0,
            }
        })
    }
    return demoRows([])
})

const userRows = computed(() => {
    if (live.users.length > 0) {
        return live.users.map((row) => ({
            id: `user-${row.id}`,
            user: row.display_name || row.username || row.email || `user:${row.id}`,
            role: row.role || '-',
            addresses: `${row.address_count || 0} 个地址`,
            auth: row.oauth_provider || '本地账号',
            status: row.enabled === false ? '停用' : '启用',
            last: formatDate(row.updated_at || row.created_at),
        }))
    }
    return demoRows(designSeed.users)
})

const notificationRows = computed(() => [
    {
        id: 'notify-mailhook',
        channel: '邮件 Webhook',
        target: '/admin/mail_webhook/settings',
        type: '入站通知',
        status: live.mailWebhook?.enabled ? '可用' : '需更新',
        detail: live.mailWebhook?.url ? `Endpoint: ${live.mailWebhook.url}` : '后端副作用门禁未接入前，只作为通知配置入口展示',
    },
    {
        id: 'notify-telegram',
        channel: 'Telegram Bot',
        target: 'Telegram WebApp',
        type: '移动通知',
        status: live.telegram?.enabled || live.telegram?.ok ? '可用' : '待配置',
        detail: '保留旧 Telegram 能力，但在新版里归入通知通道',
    },
    {
        id: 'notify-send',
        channel: '地址级发送',
        target: '/admin/send_mail',
        type: '出站邮件',
        status: openSettings.value.enableSendMail ? '可用' : '待产品化',
        detail: '发送提供商决策尚未完成时，保持为受控能力',
    },
    {
        id: 'notify-ai',
        channel: 'AI 提取',
        target: 'AiExtractInfo',
        type: '内容处理',
        status: live.aiSettings?.enabled ? '可用' : '灰度中',
        detail: '从邮件详情进入，不单独占用顶层菜单',
    },
])

const auditRows = computed(() => {
    const audit = live.auditEvents.map((row) => ({
        id: `audit-${row.id}`,
        time: formatDate(row.created_at),
        actor: row.actor_label || row.actor_type || '-',
        action: row.action,
        resource: row.resource_label || row.resource_type || '-',
        status: row.status,
        ip: row.ip || '-',
    }))
    const access = live.accessEvents.map((row) => ({
        id: `access-${row.id}`,
        time: formatDate(row.created_at),
        actor: row.actor_label || row.actor_type || '-',
        action: row.event_type,
        resource: row.resource_label || row.resource_type || '-',
        status: row.status,
        ip: row.ip || '-',
    }))
    if (audit.length || access.length) return [...audit, ...access]
    return demoRows([
        { id: 'audit-1', time: '11:22:18', actor: 'share_token', action: 'mail.read', resource: '值班只读包', status: 'success', ip: '198.51.100.23' },
        { id: 'audit-2', time: '11:19:42', actor: 'admin', action: 'domain.cloudflare_check', resource: 'colin.fnrry.com', status: 'warning', ip: '203.0.113.45' },
        { id: 'audit-3', time: '10:58:03', actor: 'admin', action: 'address.rotate_credential', resource: 'lab@20030405.xyz', status: 'success', ip: '203.0.113.45' },
    ])
})

const processingRows = computed(() => {
    const events = auditRows.value.slice(0, 8).map((row) => ({
        id: `log-${row.id}`,
        time: row.time,
        event: row.action,
        detail: row.resource,
        domain: '-',
        inbox: row.actor,
        duration: row.status,
    }))
    if (events.length) return events
    return demoRows([
        { id: 'log-1', time: '11:24:31', event: 'Saved', detail: 'raw_mails 写入成功，副作用队列等待确认', domain: '20030405.xyz', inbox: 'ops@20030405.xyz', duration: '210 ms' },
        { id: 'log-2', time: '11:24:32', event: 'Webhook queued', detail: '入站通知排队，避免保存失败时误触发', domain: '20030405.xyz', inbox: 'ops@20030405.xyz', duration: '8 ms' },
    ])
})

const opsRows = computed(() => {
    const diagnostics = live.workerConfig?.DIAGNOSTICS || {}
    const database = diagnostics.database || {}
    return [
        {
            id: 'worker',
            name: 'Worker 运行配置',
            status: !showAdminPage.value ? '需登录' : diagnostics.bindings ? '可用' : '需巡检',
            detail: `API: mail-api.20030405.xyz · bindings: ${Object.keys(diagnostics.bindings || {}).join(', ') || '-'}`,
            action: '打开配置',
        },
        {
            id: 'database',
            name: 'D1 数据库',
            status: !showAdminPage.value ? '需登录' : database.need_migration || live.dbVersion?.need_migration ? '需巡检' : '可用',
            detail: `current ${database.current_version || live.dbVersion?.current_db_version || '-'} / code ${database.code_version || live.dbVersion?.code_db_version || '-'}`,
            action: '检查迁移',
        },
        {
            id: 'kv',
            name: 'KV / 附件索引',
            status: !showAdminPage.value ? '需登录' : diagnostics.bindings?.KV ? '可用' : '待确认',
            detail: '附件、Webhook 配置、运行缓存需要在详情页暴露恢复动作',
            action: '查看空间',
        },
        {
            id: 'blacklist',
            name: '阻止与限流',
            status: '待整理',
            detail: 'IP 黑名单、地址创建权限、发送权限合并到策略中心',
            action: '打开策略',
        },
    ]
})

const opsBoundaryItems = computed(() => [
    { label: 'Worker', value: opsRows.value[0]?.status || '-' },
    { label: 'D1', value: opsRows.value[1]?.status || '-' },
    { label: 'KV', value: opsRows.value[2]?.status || '-' },
    { label: 'Pages', value: 'admin-next preview' },
])

const explicitUnreadMailCount = computed(() => {
    if (Number.isFinite(Number(live.mailUnreadCount))) return Number(live.mailUnreadCount)
    return mailRows.value.filter((row) => (
        row.unread === true
        || row.is_read === false
        || row.read_at === null
    )).length
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
    ops: live.errors.length > 0 ? { dot: true, label: '部分后台接口暂不可用' } : null,
    roadmap: null,
}))
const navBadgeFor = (item) => navBadges.value[item.badgeKey] || null

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

const queryTokens = (value) => String(value || '')
    .trim()
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((token) => token.replace(/^"|"$/g, '').toLowerCase())
    .filter(Boolean) || []

const matchesMailOperator = (row, token) => {
    const [rawKey, ...rest] = token.split(':')
    if (!rest.length) return null
    const key = rawKey.trim()
    const value = rest.join(':').trim()
    if (key === 'from') return String(row.sender || '').toLowerCase().includes(value)
    if (key === 'to') return String(row.to || row.address || '').toLowerCase().includes(value)
    if (key === 'subject') return String(row.subject || '').toLowerCase().includes(value)
    if (key === 'has' && value === 'attachment') return Number(row.attachmentCount || 0) > 0
    if (key === 'is' && value === 'unread') return row.unread === true
    if (key === 'is' && value === 'read') return row.is_read === true || row.unread === false
    if (key === 'after') return String(row.fullTime || row.time || '').slice(0, 10) >= value
    if (key === 'before') return String(row.fullTime || row.time || '').slice(0, 10) <= value
    return null
}

const matchesQuery = (row) => {
    const tokens = queryTokens(ui.query)
    if (!tokens.length) return true
    const text = [
        row.subject,
        row.sender,
        row.to,
        row.address,
        row.domain,
        row.body,
        row.text,
        row.risk,
        row.result,
        row.auth,
    ].filter(Boolean).join(' ').toLowerCase()
    return tokens.every((token) => {
        const operatorResult = matchesMailOperator(row, token)
        if (operatorResult !== null) return operatorResult
        return text.includes(token)
    })
}

const matches = (row) => {
    const inQuery = matchesQuery(row)
    const inDomain = ui.domain === 'all'
        || row.domain === ui.domain
        || row.address?.endsWith(`@${ui.domain}`)
        || row.to?.endsWith(`@${ui.domain}`)
    const inAddress = ui.address === 'all'
        || row.address === ui.address
        || row.to === ui.address
        || row.owner === ui.address
    const statusText = [
        row.status,
        row.result,
        row.risk,
        row.auth,
        row.is_read ? '已读 read' : '',
        row.unread ? '未读 unread' : '',
        Number(row.attachmentCount || 0) > 0 ? 'attachment 有附件' : '',
    ].filter(Boolean).join(' ').toLowerCase()
    const inStatus = ui.status === 'all' || statusText.includes(ui.status.toLowerCase())
    return inQuery && inDomain && inAddress && inStatus
}

const filterRows = (rows) => rows.filter(matches)

const filteredMailRows = computed(() => filterRows(mailRows.value))
const filteredUnknownRows = computed(() => filterRows(unknownRows.value))
const activeFilterChips = computed(() => [
    ui.query ? { key: 'q', label: `搜索: ${ui.query}` } : null,
    ui.domain !== 'all' ? { key: 'domain', label: `域名: ${ui.domain}` } : null,
    ui.address !== 'all' ? { key: 'address', label: `地址: ${ui.address}` } : null,
    ui.status !== 'all' ? { key: 'status', label: `状态: ${ui.status}` } : null,
].filter(Boolean))

const mailHierarchy = computed(() => {
    const allCount = mailRows.value.length
    const unreadCount = explicitUnreadMailCount.value
    const attachmentCount = mailRows.value.filter((row) => Number(row.attachmentCount || 0) > 0).length
    const unknownCount = unknownRows.value.length
    return {
        queues: [
            { id: 'queue-all', label: '全部邮件', count: allCount, status: 'all' },
            { id: 'queue-unread', label: '未读', count: unreadCount, status: '未读' },
            { id: 'queue-saved', label: '已保存', count: mailRows.value.filter((row) => row.result === '已保存').length, status: '已保存' },
            { id: 'queue-attachment', label: '有附件', count: attachmentCount, status: 'attachment' },
            { id: 'queue-unknown', label: '未知收件人', count: unknownCount, status: '未知地址' },
        ],
        domains: domainRows.value.map((domain) => ({
            ...domain,
            addresses: addressOptions.value
                .filter((address) => address !== 'all' && address.endsWith(`@${domain.domain}`))
                .map((address) => ({
                    address,
                    count: mailRows.value.filter((row) => row.to === address || row.address === address).length,
                })),
        })),
    }
})

const syncMailQueryToRoute = (extra = {}) => {
    replaceRouteQuery({
        view: 'flow',
        q: ui.query || undefined,
        domain: ui.domain === 'all' ? undefined : ui.domain,
        address: ui.address === 'all' ? undefined : ui.address,
        status: ui.status === 'all' ? undefined : ui.status,
        mailId: ui.selected.flow || undefined,
        mode: ui.flowMode === 'list' ? undefined : ui.flowMode,
        ...extra,
    }, ['item'])
}

const setMailStatus = (status) => {
    ui.status = status
    ui.flowMode = 'list'
    syncMailQueryToRoute({ status: status === 'all' ? undefined : status, mode: undefined })
}

const setMailDomain = (domain) => {
    ui.domain = domain || 'all'
    ui.address = 'all'
    ui.flowMode = 'list'
    syncMailQueryToRoute({ domain: ui.domain === 'all' ? undefined : ui.domain, address: undefined, mode: undefined })
}

const setMailAddress = (address) => {
    ui.address = address || 'all'
    ui.domain = address && address !== 'all' ? getDomain(address) || ui.domain : ui.domain
    ui.flowMode = 'list'
    syncMailQueryToRoute({
        address: ui.address === 'all' ? undefined : ui.address,
        domain: ui.domain === 'all' ? undefined : ui.domain,
        mode: undefined,
    })
}

const clearMailFilter = (key) => {
    if (key === 'q') ui.query = ''
    if (key === 'domain') {
        ui.domain = 'all'
        ui.address = 'all'
    }
    if (key === 'address') ui.address = 'all'
    if (key === 'status') ui.status = 'all'
    syncMailQueryToRoute({
        q: ui.query || undefined,
        domain: ui.domain === 'all' ? undefined : ui.domain,
        address: ui.address === 'all' ? undefined : ui.address,
        status: ui.status === 'all' ? undefined : ui.status,
    })
}

const currentMailIndex = computed(() => filteredMailRows.value.findIndex((row) => row.id === ui.selected.flow))
const canGoPrevMail = computed(() => currentMailIndex.value > 0)
const canGoNextMail = computed(() => currentMailIndex.value >= 0 && currentMailIndex.value < filteredMailRows.value.length - 1)

const selectAdjacentMail = (step) => {
    const index = currentMailIndex.value
    if (index < 0) return
    const next = filteredMailRows.value[index + step]
    if (next) selectRow('flow', next.id)
}

const closeMailDetail = () => {
    ui.flowMode = 'list'
    ui.detailKind = ''
    ui.selected.flow = ''
    replaceRouteQuery({ mode: undefined, mailId: undefined }, ['item'])
}

const openMailFromAddress = (address) => {
    if (!address) return
    ui.view = 'flow'
    ui.domain = getDomain(address) || 'all'
    ui.address = address
    ui.status = 'all'
    ui.flowMode = 'list'
    if (typeof localStorage !== 'undefined') localStorage.setItem('ets-admin-next-view', 'flow')
    syncMailQueryToRoute({ address, domain: ui.domain === 'all' ? undefined : ui.domain, status: undefined, mode: undefined })
}

const openMailFromDomain = (domain) => {
    if (!domain) return
    ui.view = 'flow'
    ui.domain = domain
    ui.address = 'all'
    ui.status = 'all'
    ui.flowMode = 'list'
    if (typeof localStorage !== 'undefined') localStorage.setItem('ets-admin-next-view', 'flow')
    syncMailQueryToRoute({ domain, address: undefined, status: undefined, mode: undefined })
}
const stateCards = computed(() => {
    const db = live.workerConfig?.DIAGNOSTICS?.database || {}
    const webhookStatus = live.mailWebhook?.enabled ? '入站通知已启用' : '通知通道需复核'
    return [
        { value: workerStatusLabel.value, label: 'Worker / D1', tone: db.ok === false || !showAdminPage.value ? 'warn' : 'ok' },
        { value: `${mailRows.value.length}`, label: '最近收件', tone: 'ok' },
        { value: webhookStatus, label: '通知通道', tone: live.mailWebhook?.enabled ? 'ok' : 'warn' },
    ]
})

const tableSpecs = {
    domains: [
        { label: '域名', type: 'entity', main: 'domain', sub: 'label' },
        { label: '接收方式', key: 'mode' },
        { label: '地址', key: 'addresses', type: 'number' },
        { label: '邮件', key: 'mails', type: 'number' },
        { label: '配置', key: 'setup', type: 'status' },
        { label: '认证', key: 'auth' },
    ],
    mails: [
        { label: '接收时间', key: 'time', type: 'time' },
        { label: '发件人', key: 'sender' },
        { label: '收件地址', key: 'to' },
        { label: '主题', type: 'entity', main: 'subject', sub: 'risk' },
        { label: '附件', key: 'attachmentCount', type: 'number' },
        { label: '结果', key: 'result', type: 'status' },
        { label: 'Auth', key: 'auth' },
        { label: 'IP / Source', key: 'ip', type: 'mono' },
    ],
    mailSummary: [
        { label: '接收时间', key: 'time', type: 'time' },
        { label: '发件人', type: 'entity', main: 'sender', sub: 'to' },
        { label: '主题', type: 'entity', main: 'subject', sub: 'risk' },
        { label: '附件', key: 'attachmentCount', type: 'number' },
        { label: '结果', key: 'result', type: 'status' },
    ],
    roadmap: [
        { label: '新版模块', key: 'capability', type: 'strong' },
        { label: '承接旧功能', key: 'maps' },
        { label: '状态', key: 'status', type: 'status' },
    ],
    logs: [
        { label: '时间', key: 'time', type: 'time' },
        { label: '事件', key: 'event', type: 'strong' },
        { label: '详情', key: 'detail' },
        { label: '域名', key: 'domain' },
        { label: '地址 / Actor', key: 'inbox' },
        { label: '耗时 / 状态', key: 'duration', type: 'mono' },
    ],
    risks: [
        { label: '级别', key: 'level', type: 'mono' },
        { label: '问题', type: 'entity', main: 'title', sub: 'detail' },
        { label: '负责人', key: 'owner' },
        { label: '状态', key: 'status', type: 'status' },
    ],
    addresses: [
        { label: '地址', type: 'entity', main: 'address', sub: 'note', tags: 'tags' },
        { label: '归属', key: 'owner' },
        { label: '来源', key: 'source' },
        { label: '收件', key: 'mails', type: 'number' },
        { label: '发送', key: 'sent', type: 'number' },
        { label: '访问包', key: 'packages', type: 'number' },
        { label: '密码', key: 'password', type: 'status' },
        { label: '凭证', key: 'credential', type: 'status' },
    ],
    users: [
        { label: '用户', key: 'user', type: 'strong' },
        { label: '角色', key: 'role' },
        { label: '地址范围', key: 'addresses' },
        { label: '登录', key: 'auth' },
        { label: '状态', key: 'status', type: 'status' },
    ],
    routing: [
        { label: '域名', type: 'entity', main: 'domain', sub: 'label' },
        { label: '接收方式', key: 'mode' },
        { label: '配置', key: 'setup', type: 'status' },
        { label: '启用', key: 'enabled', type: 'status' },
        { label: '地址创建', key: 'creation' },
        { label: '默认', key: 'default' },
        { label: 'Collector / 规则', key: 'collector', type: 'mono' },
        { label: '最后验证', key: 'updated', type: 'time' },
    ],
    destinations: [
        { label: '目的地', type: 'entity', main: 'destination', sub: 'next' },
        { label: '域名', key: 'domain' },
        { label: '类型', key: 'type' },
        { label: '使用', key: 'inUse', type: 'number' },
        { label: '状态', key: 'status', type: 'status' },
    ],
    notifications: [
        { label: '通道', type: 'entity', main: 'channel', sub: 'detail' },
        { label: '入口', key: 'target', type: 'mono' },
        { label: '类型', key: 'type' },
        { label: '状态', key: 'status', type: 'status' },
    ],
    sender: [
        { label: '地址', key: 'address' },
        { label: '余额', key: 'balance', type: 'number' },
        { label: '状态', key: 'status', type: 'status' },
        { label: '创建时间', key: 'created', type: 'time' },
        { label: '说明', key: 'note' },
    ],
    shares: [
        { label: '标签', type: 'entity', main: 'label', sub: 'path' },
        { label: '地址', key: 'address' },
        { label: '权限', key: 'scopes' },
        { label: '状态', key: 'status', type: 'status' },
        { label: '过期', key: 'expires', type: 'time' },
        { label: '最近使用', key: 'last', type: 'time' },
    ],
    audit: [
        { label: '时间', key: 'time', type: 'time' },
        { label: 'Actor', key: 'actor' },
        { label: 'Action', key: 'action' },
        { label: 'Resource', key: 'resource' },
        { label: 'Status', key: 'status', type: 'status' },
        { label: 'IP', key: 'ip', type: 'mono' },
    ],
    ops: [
        { label: '项目', type: 'entity', main: 'name', sub: 'detail' },
        { label: '状态', key: 'status', type: 'status' },
        { label: '动作', key: 'action' },
    ],
    mapping: [
        { label: '新对象', key: 'newName', type: 'strong' },
        { label: '吸收旧功能', key: 'old' },
        { label: '处理原则', key: 'rule' },
    ],
}

const activePanels = computed(() => {
    const view = activeView.value
    if (view === 'overview') {
        return [
            { id: 'domains', title: '入口状态', note: '域名、collector 和接收方式的当前状态。', columns: tableSpecs.domains, rows: filterRows(domainRows.value), kind: 'routing', layout: 'split' },
            { id: 'logs', title: '最近处理', note: '保存、异常和通知排队的最近记录。', columns: tableSpecs.logs, rows: filterRows(processingRows.value), kind: 'logs' },
        ]
    }
    if (view === 'flow') {
        return [
            { id: 'mails', title: '邮件记录', note: '按域名、地址和状态查看收件。', columns: tableSpecs.mails, rows: filterRows(mailRows.value), kind: 'flow', layout: 'split' },
            { id: 'unknown', title: '异常队列', note: '未知收件人和失败记录。', columns: tableSpecs.risks, rows: filterRows(unknownRows.value), kind: 'access', layout: 'split' },
            { id: 'logs', title: '处理日志', note: '最近处理步骤和耗时。', columns: tableSpecs.logs, rows: filterRows(processingRows.value), kind: 'logs' },
        ]
    }
    if (view === 'identity') {
        return [
            { id: 'addresses', title: '地址账本', note: '地址、标签、凭证和分享状态。', columns: tableSpecs.addresses, rows: filterRows(addressRows.value), kind: 'identity' },
            { id: 'users', title: '用户与角色', note: '账号和可访问地址。', columns: tableSpecs.users, rows: filterRows(userRows.value), kind: 'users', layout: 'third' },
        ]
    }
    if (view === 'routing') {
        return [
            { id: 'domains', title: '域名与接收方式', note: '旧 Domains 的字段保留，但用新 UI 把 Cloudflare、ImprovMX、Webhook、Manual 合在一张路由表', columns: tableSpecs.routing, rows: filterRows(domainRows.value), kind: 'routing' },
            { id: 'destinations', title: '转发目的地', note: '参考图里的 Forwarding Destinations，但内容换成本项目真实接收链路', columns: tableSpecs.destinations, rows: filterRows(routeRows.value), kind: 'routing', layout: 'split' },
        ]
    }
    if (view === 'delivery') {
        return [
            { id: 'channels', title: '出站与通知通道', note: '通知、发送和外部通道状态。', columns: tableSpecs.notifications, rows: filterRows(notificationRows.value), kind: 'delivery' },
            { id: 'sender', title: '地址级发送', note: '来自 /admin/address_sender 的发送权限记录；空表不再用地址账本代替。', columns: tableSpecs.sender, rows: filterRows(senderAccessRows.value), kind: 'delivery', layout: 'third' },
            { id: 'sendbox', title: '发送箱', note: '来自 /admin/sendbox 的最近发送记录；空表不再用收件箱代替。', columns: tableSpecs.mails, rows: filterRows(sendBoxRows.value), kind: 'delivery', layout: 'third' },
        ]
    }
    if (view === 'access') {
        return [
            { id: 'shares', title: '访问包', note: '旧 AccessPackages 继续保留，但作为分享 token 生命周期管理', columns: tableSpecs.shares, rows: filterRows(shareRows.value), kind: 'access', layout: 'split' },
            { id: 'risks', title: '审阅风险', note: '审阅 P1/P2 不是文档摘要，而是后台里的治理队列', columns: tableSpecs.risks, rows: filterRows(staticRisks), kind: 'access', layout: 'split' },
            { id: 'audit', title: '审计与访问日志', note: '旧 AuditLogs / AccessLogs 合并筛选，actor、resource、IP 和结果始终可见', columns: tableSpecs.audit, rows: filterRows(auditRows.value), kind: 'audit' },
        ]
    }
    if (view === 'ops') {
        return [
            { id: 'ops', title: '运行维护', note: '旧 DatabaseManager / WorkerConfig / Maintenance / IpBlacklistSettings 合并成运行面板', columns: tableSpecs.ops, rows: filterRows(opsRows.value), kind: 'ops' },
        ]
    }
    return [
        { id: 'roadmap', title: '保留的新能力方向', note: '这些不是旧 UI 里的菜单，但对后续产品化有价值，所以在新版里保留为可开发入口', columns: tableSpecs.roadmap, rows: filterRows(roadmapRows), kind: 'roadmap' },
        { id: 'mapping', title: '旧功能归并规则', note: '迁移时看对象，不看旧菜单名', columns: tableSpecs.mapping, rows: migrationMapRows, kind: 'roadmap' },
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
        if (typeof localStorage !== 'undefined') localStorage.setItem('ets-admin-next-view', 'flow')
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
    if (!row?.sourceId || row.unread === false || row.is_read === true || demoMode.value || !showAdminPage.value) return
    try {
        const result = await api.fetch(`/admin/mails/${row.sourceId}/read_state`, {
            method: 'PATCH',
            body: JSON.stringify({ read: true }),
        })
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

const currentMail = computed(() => mailRows.value.find((row) => row.id === ui.selected.flow) || null)
const currentRendererMail = computed(() => {
    const row = currentMail.value
    if (!row) return null
    return {
        id: row.sourceId || row.id,
        subject: row.subject,
        source: row.sender,
        address: row.to,
        created_at: row.created_at || row.fullTime || row.time,
        message: row.html || row.text || row.body || '',
        messageIsHtml: !!row.html,
        text: row.text || (!row.html ? row.body : ''),
        raw: row.raw || '',
        attachments: row.attachments || [],
        metadata: row.metadata || {},
        parseFailed: row.parseStatus === 'failed',
    }
})
const currentException = computed(() => unknownRows.value.find((row) => row.id === ui.selected.exception) || unknownRows.value[0])
const currentAddress = computed(() => addressRows.value.find((row) => row.id === ui.selected.identity) || addressRows.value[0])
const currentDomain = computed(() => domainRows.value.find((row) => row.id === ui.selected.routing) || domainRows.value[0])
const currentNotification = computed(() => notificationRows.value.find((row) => row.id === ui.selected.delivery) || notificationRows.value[0])

const openActionModal = (type) => {
    actionModal.value = type
}

const closeActionModal = () => {
    actionModal.value = ''
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
    const messages = {
        rotate: '灰度预览未执行凭证轮换',
        revoke: '灰度预览未撤销访问包',
        verify: '灰度预览未执行 DNS / 路由检查',
        delete: '灰度预览未执行删除',
        send: '灰度预览未发送邮件',
        preview: '安全渲染策略尚未接入统一预览',
        'test-webhook': '灰度预览未发送 Webhook 测试',
        'health-check': '灰度预览未执行生产健康检查',
        migration: '灰度预览未运行数据库迁移',
        'purge-cache': '灰度预览未清理生产缓存',
    }
    showToast(messages[type] || '灰度预览未执行生产写入')
}

const toolbarActions = computed(() => {
    const view = activeView.value
    if (view === 'flow') return [
        { label: '保留选择刷新', icon: 'refresh', action: 'refresh' },
        { label: '复制收件地址', icon: 'copy', action: 'copy' },
        { label: '渲染策略', icon: 'lock', modal: 'mail-policy' },
        { label: '批量删除', icon: 'check', action: 'delete', danger: true },
    ]
    if (view === 'identity') return [
        { label: '新增地址身份', icon: 'plus', modal: 'new-address', primary: true },
        { label: '生成访问包', icon: 'lock', modal: 'share-package' },
        { label: '复制当前地址', icon: 'copy', action: 'copy' },
    ]
    if (view === 'routing') return [
        { label: '新增接收域', icon: 'plus', modal: 'new-domain', primary: true },
        { label: '检查 DNS / 路由', icon: 'check', action: 'verify' },
        { label: '接收策略', icon: 'routing', modal: 'route-policy' },
    ]
    if (view === 'delivery') return [
        { label: '写信', icon: 'delivery', modal: 'compose-mail', primary: true },
        { label: '配置通知', icon: 'routing', modal: 'webhook' },
        { label: '测试通道', icon: 'check', action: 'test-webhook' },
    ]
    if (view === 'access') return [
        { label: '新建访问包', icon: 'plus', modal: 'share-package', primary: true },
        { label: '导出审计', icon: 'copy', action: 'copy' },
        { label: '风险策略', icon: 'lock', modal: 'risk-policy' },
    ]
    if (view === 'ops') return [
        { label: '数据库迁移', icon: 'ops', modal: 'db-migration' },
        { label: '健康检查', icon: 'check', action: 'health-check' },
        { label: '清理缓存', icon: 'lock', action: 'purge-cache', danger: true },
    ]
    if (view === 'roadmap') return [
        { label: '记录路线事项', icon: 'plus', modal: 'roadmap-note', primary: true },
        { label: '复制迁移清单', icon: 'copy', action: 'copy' },
    ]
    return []
})

const modalTitle = computed(() => {
    const titles = {
        'quick-create': '新建入口',
        'new-address': '新增地址身份',
        'share-package': '生成访问包',
        'new-domain': '新增接收域',
        'route-policy': '接收策略',
        'compose-mail': '地址级发送',
        webhook: '通知通道',
        'mail-policy': '安全渲染策略',
        'risk-policy': '风险策略',
        'db-migration': '数据库迁移',
        'roadmap-note': '记录路线事项',
    }
    return titles[actionModal.value] || '操作'
})

const modalFields = computed(() => {
    const type = actionModal.value
    if (type === 'new-address' || type === 'quick-create') return [
        { label: '地址', value: `new-entry@${domainRows.value[0]?.domain || '20030405.xyz'}` },
        { label: '归属域名', value: domainRows.value[0]?.domain || '20030405.xyz' },
        { label: '地址用途', value: '临时协作入口' },
        { label: '访问模式', value: '管理员创建，允许分享包' },
        { label: '备注', value: '用于短期外部协作，默认启用地址密码与凭证轮换记录。', wide: true },
    ]
    if (type === 'new-domain') return [
        { label: '域名', value: 'new-domain.example' },
        { label: '接收方式', value: 'Cloudflare Email Routing / ImprovMX free forwarding' },
        { label: 'Collector 地址', value: 'mx-new-domain-example@20030405.xyz' },
        { label: '地址创建策略', value: '仅管理员' },
        { label: '配置备注', value: '非 Cloudflare 域默认走 ImprovMX 免费转发到 collector。', wide: true },
    ]
    if (type === 'share-package') return [
        { label: '地址', value: currentAddress.value?.address || addressRows.value[0]?.address || '-' },
        { label: '标签', value: '临时只读协作' },
        { label: '过期时间', value: '2026-07-02 18:00' },
        { label: '权限', value: '只读正文，可下载附件' },
    ]
    if (type === 'compose-mail') return [
        { label: 'From', value: currentAddress.value?.address || 'ops@20030405.xyz' },
        { label: 'To', value: 'recipient@example.net' },
        { label: '内容类型', value: '纯文本 / HTML 安全预览' },
        { label: '主题', value: '关于域名迁移的回复', wide: true },
        { label: '正文', value: '这里使用与用户发送页共享的验证和预览逻辑；发送提供商确定前保持为受控能力。', wide: true },
    ]
    if (type === 'webhook') return [
        { label: '通道', value: '邮件 Webhook / Telegram Bot' },
        { label: '触发时机', value: '待后端完成保存成功门禁后启用' },
        { label: 'Endpoint', value: live.mailWebhook?.url || 'https://hooks.example.net/email-transfer-station', wide: true },
        { label: '事件范围', value: 'mail.saved, mail.unknown_recipient, attachment.indexed, share_token.read', wide: true },
    ]
    if (type === 'db-migration') return [
        { label: '代码版本', value: live.dbVersion?.code_db_version || 'v0.0.11' },
        { label: '当前版本', value: live.dbVersion?.current_db_version || '-' },
        { label: '涉及表', value: 'address_share_tokens, audit_events, access_events, managed_domains, address_credentials', wide: true },
    ]
    if (type === 'mail-policy' || type === 'risk-policy') return [
        { label: '策略模块', value: 'HTML 隔离渲染' },
        { label: '默认模式', value: '隔离渲染，附件链接重写' },
        { label: '强制入口', value: 'MailContentRenderer, ShadowHtmlComponent, SendMail HTML preview, TokenInbox message body', wide: true },
    ]
    return [
        { label: '路线事项', value: '保留为后续开发入口，不作为当前已完成能力展示。', wide: true },
    ]
})

const saveModal = () => {
    closeActionModal()
    showToast('灰度预览未写入生产；该表单仅保留迁移入口')
}

const currentRail = computed(() => {
    const context = detailContext.value
    if (context === 'flow' && currentMail.value) {
        return {
            title: '邮件详情',
            subtitle: currentMail.value.subject,
            tags: [
                currentMail.value.unread ? '未读' : '已读',
                currentMail.value.risk,
                currentMail.value.attachmentLabel,
            ].filter(Boolean),
            kv: [
                ['发件人', currentMail.value.sender],
                ['收件地址', currentMail.value.to],
                ['接收时间', currentMail.value.fullTime || currentMail.value.time],
                ['认证', currentMail.value.auth],
                ['来源', currentMail.value.ip],
                ['附件', currentMail.value.attachmentLabel],
                ['渲染', currentMail.value.risk, 'status'],
            ],
            body: currentMail.value.body,
            mail: currentMail.value,
            actions: [
                { label: '回复', action: 'send' },
                { label: '转发', action: 'send' },
                { label: '删除', action: 'delete', danger: true },
            ],
        }
    }
    if (context === 'flow') {
        return {
            title: '选择一封邮件',
            subtitle: '从左侧列表打开邮件后，可查看正文、附件、纯文本和原始内容。',
            tags: ['未选择', '列表保留'],
            empty: true,
        }
    }
    if (context === 'exception' && currentException.value) {
        return {
            title: '异常邮件',
            subtitle: currentException.value.title,
            tags: [currentException.value.level, currentException.value.status, '未知收件人'],
            kv: [
                ['收件对象', currentException.value.owner],
                ['域名', currentException.value.domain || '-'],
                ['级别', currentException.value.level],
                ['状态', currentException.value.status, 'status'],
            ],
            body: currentException.value.detail,
            actions: [
                { label: '创建地址', modal: 'new-address', primary: true },
                { label: '保留观察', action: 'refresh' },
                { label: '删除', action: 'delete', danger: true },
            ],
        }
    }
    if (context === 'identity' && currentAddress.value) {
        return {
            title: '地址详情',
            subtitle: currentAddress.value.address,
            tags: currentAddress.value.tags,
            kv: [
                ['备注', currentAddress.value.note],
                ['收件 / 发送', `${currentAddress.value.mails} / ${currentAddress.value.sent}`],
                ['分享包', `${currentAddress.value.packages} 个`],
                ['地址密码', currentAddress.value.password],
                ['凭证', currentAddress.value.credential, 'status'],
            ],
            actions: [
                { label: '轮换凭证', action: 'rotate', primary: true },
                { label: '创建访问包', modal: 'share-package' },
                { label: '清空', action: 'delete', danger: true },
            ],
        }
    }
    if (context === 'routing' && currentDomain.value) {
        return {
            title: '域名详情',
            subtitle: currentDomain.value.domain,
            tags: [currentDomain.value.mode, currentDomain.value.enabled],
            kv: [
                ['配置', currentDomain.value.setup, 'status'],
                ['Collector', currentDomain.value.collector],
                ['认证', currentDomain.value.auth],
                ['验证', currentDomain.value.updated],
            ],
            actions: [
                { label: '检查路由', action: 'verify', primary: true },
                { label: '应用 Cloudflare', action: 'verify' },
                { label: '停用影响', action: 'delete', danger: true },
            ],
        }
    }
    if (context === 'delivery' && currentNotification.value) {
        return {
            title: '通道详情',
            subtitle: currentNotification.value.channel,
            tags: [currentNotification.value.type, currentNotification.value.status],
            kv: [
                ['入口', currentNotification.value.target],
                ['状态', currentNotification.value.status, 'status'],
                ['说明', currentNotification.value.detail],
            ],
            actions: [
                { label: '测试', action: 'test-webhook', primary: true },
                { label: '编辑', modal: 'webhook' },
            ],
        }
    }
    if (context === 'ops') {
        return {
            title: '运行边界',
            subtitle: '维护入口',
            tags: ['Worker', 'D1', 'KV', 'Pages'],
            kv: [
                ['Worker', opsRows.value[0]?.status || '-'],
                ['D1', opsRows.value[1]?.status || '-'],
                ['KV', opsRows.value[2]?.status || '-'],
                ['Pages', 'admin-next preview'],
            ],
        }
    }
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

watch(() => route.query.view, (value) => {
    const nextView = Array.isArray(value) ? value[0] : value
    if (viewMeta[nextView] && nextView !== ui.view) {
        ui.view = nextView
        ui.detailKind = ''
        detailOpen.value = false
    }
})

watch(() => route.query.q, (value) => {
    ui.query = queryValue(value)
})

watch(() => route.query.domain, (value) => {
    ui.domain = queryValue(value, 'all')
})

watch(() => route.query.address, (value) => {
    ui.address = queryValue(value, 'all')
})

watch(() => route.query.status, (value) => {
    ui.status = queryValue(value, 'all')
})

watch(() => route.query.mode, (value) => {
    ui.flowMode = queryValue(value, 'list')
})

watch(() => route.query.item, (value) => {
    const item = Array.isArray(value) ? value[0] : value
    if (!item) return
    if (String(item).startsWith('mail-')) {
        ui.selected.flow = String(item)
        ui.detailKind = 'flow'
    } else if (String(item).startsWith('unknown-')) {
        ui.selected.exception = String(item)
        ui.detailKind = 'exception'
    }
}, { immediate: true })

watch(mailRows, (rows) => {
    if (!rows.length) {
        ui.selected.flow = ''
        return
    }
    if (ui.selected.flow && !rows.some((row) => row.id === ui.selected.flow)) {
        ui.selected.flow = ''
        ui.detailKind = ''
        if (activeView.value === 'flow') replaceRouteQuery({ mailId: undefined, mode: undefined }, ['item'])
    }
}, { immediate: true })

watch(showAdminPage, async (allowed) => {
    if (allowed && !live.fetchedAdmin) await fetchAdminData()
})

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
        nextTick(() => searchInput.value?.focus?.())
        return
    }
    if (!isTyping && event.key === '/') {
        event.preventDefault()
        nextTick(() => searchInput.value?.focus?.())
        return
    }
    if (event.key === 'Escape' && detailOpen.value) closeDetail()
}

const syncSelectionFromRoute = () => {
    const mailId = queryValue(route.query.mailId)
    if (mailId) {
        ui.selected.flow = mailId
        ui.detailKind = 'flow'
        ui.flowMode = queryValue(route.query.mode, 'detail')
        return
    }
    const item = Array.isArray(route.query.item) ? route.query.item[0] : route.query.item
    if (!item) return
    if (String(item).startsWith('unknown-')) {
        ui.selected.exception = item
        ui.detailKind = 'exception'
        return
    }
    if (String(item).startsWith('mail-')) {
        ui.selected.flow = item
        ui.detailKind = 'flow'
    }
}

watch(() => [route.query.mailId, route.query.item], syncSelectionFromRoute)

onMounted(() => {
    syncSelectionFromRoute()
    refreshAll()
    window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGlobalKeydown)
    window.clearTimeout(toastTimer)
})
</script>

<template>
    <div class="admin-next app" :class="{ 'is-flow-view': activeView === 'flow', 'is-sidebar-collapsed': sidebarCollapsed }">
        <aside class="sidebar" aria-label="主导航">
            <div class="brand">
                <div class="brand-mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M3.5 6.5h17v11h-17z" />
                        <path d="m4 7 8 6 8-6" />
                    </svg>
                </div>
                <div class="brand-title">Email Transfer<span>station admin</span></div>
                <button class="sidebar-toggle" type="button" :aria-label="sidebarCollapsed ? '展开侧栏' : '折叠侧栏'"
                    :aria-expanded="(!sidebarCollapsed).toString()" @click="toggleSidebar">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <component :is="shape.tag"
                            v-for="(shape, index) in shapeList(sidebarCollapsed ? 'expand' : 'collapse')"
                            :key="index" v-bind="shape.attrs" />
                    </svg>
                </button>
            </div>

            <nav class="nav-scroll">
                <section v-for="group in navGroups" :key="group.label" class="nav-group">
                    <div class="nav-group-title">{{ group.label }}</div>
                    <button v-for="item in group.items" :key="item.id" class="nav-link"
                        :class="{ 'is-active': activeView === item.id }" type="button" :title="sidebarCollapsed ? item.title : ''"
                        :aria-label="item.title" @click="setView(item.id)">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <component :is="shape.tag" v-for="(shape, index) in shapeList(item.icon)" :key="index"
                                v-bind="shape.attrs" />
                        </svg>
                        <span class="nav-text">{{ item.title }}</span>
                        <span v-if="navBadgeFor(item)?.value" class="nav-badge"
                            :aria-label="navBadgeFor(item).label">
                            {{ formatBadgeCount(navBadgeFor(item).value) }}
                        </span>
                        <span v-else-if="navBadgeFor(item)?.dot" class="nav-dot"
                            :aria-label="navBadgeFor(item).label"></span>
                    </button>
                </section>
            </nav>

            <div class="sidebar-foot">
                <span class="health-dot">Worker / D1 {{ workerStatusLabel }}</span>
                <span class="mono">DB_VERSION {{ dbVersionLabel }}</span>
                <span>桌面后台 · 预留移动拆分</span>
            </div>
        </aside>

        <main class="workspace">
            <header class="topbar">
                <div class="page-title">
                    <h1>{{ activeMeta.title }}</h1>
                    <span>{{ activeMeta.kicker }}</span>
                </div>

                <div class="topbar-controls">
                    <select v-model="ui.domain" class="select domain-select" aria-label="域名范围"
                        @change="activeView === 'flow' ? setMailDomain(ui.domain) : replaceRouteQuery({ domain: ui.domain === 'all' ? undefined : ui.domain })">
                        <option v-for="domain in domainOptions" :key="domain" :value="domain">
                            {{ domain === 'all' ? '全部域名' : domain }}
                        </option>
                    </select>

                    <label class="searchbox">
                        <svg viewBox="0 0 24 24">
                            <component :is="shape.tag" v-for="(shape, index) in shapeList('search')" :key="index"
                                v-bind="shape.attrs" />
                        </svg>
                        <input ref="searchInput" v-model="ui.query" class="field"
                            placeholder="搜索：from:openai to:zkc subject:codex has:attachment is:unread"
                            @input="activeView === 'flow' ? syncMailQueryToRoute({ q: ui.query || undefined }) : replaceRouteQuery({ q: ui.query || undefined })" />
                        <span class="kbd">⌘K</span>
                    </label>

                    <div class="top-actions">
                        <span class="sync-state" :class="{ 'is-loading': ui.syncing }" role="status" aria-live="polite">
                            {{ syncLabel }}
                        </span>
                        <button class="btn" type="button" @click="handleAction('refresh')">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <component :is="shape.tag" v-for="(shape, index) in shapeList('refresh')" :key="index"
                                    v-bind="shape.attrs" />
                            </svg>
                            同步
                        </button>
                        <button class="btn primary" type="button" @click="openActionModal('quick-create')">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <component :is="shape.tag" v-for="(shape, index) in shapeList('plus')" :key="index"
                                    v-bind="shape.attrs" />
                            </svg>
                            新建入口
                        </button>
                    </div>
                </div>
            </header>

            <section class="view" :aria-busy="ui.syncing ? 'true' : 'false'" aria-live="polite">
                <div class="notice source-notice" :class="{ warn: dataSourceNotice.tone === 'warn' }">
                    <strong>{{ dataSourceNotice.title }}</strong>
                    <span>{{ dataSourceNotice.text }}</span>
                </div>

                <div v-if="activeView === 'overview'" class="state-band" aria-label="运行状态">
                    <div v-for="card in stateCards" :key="card.label" class="state-card"
                        :class="{ warn: card.tone === 'warn', error: card.tone === 'danger' }">
                        <strong>{{ card.value }}</strong>
                        <span>{{ card.label }}</span>
                    </div>
                </div>

                <div v-if="toolbarActions.length" class="toolbar">
                    <button v-for="action in toolbarActions" :key="action.label" type="button" class="btn"
                        :class="{ primary: action.primary, danger: action.danger }"
                        @click="action.modal ? openActionModal(action.modal) : handleAction(action.action)">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <component :is="shape.tag" v-for="(shape, index) in shapeList(action.icon)" :key="index"
                                v-bind="shape.attrs" />
                        </svg>
                        {{ action.label }}
                    </button>
                    <select v-if="activeView === 'flow' || activeView === 'access'" v-model="ui.status" class="select"
                        @change="activeView === 'flow' ? setMailStatus(ui.status) : replaceRouteQuery({ status: ui.status === 'all' ? undefined : ui.status })">
                        <option value="all">全部状态</option>
                        <option v-if="activeView === 'flow'" value="未读">未读</option>
                        <option v-if="activeView === 'flow'" value="已读">已读</option>
                        <option v-if="activeView === 'flow'" value="attachment">有附件</option>
                        <option value="已保存">已保存</option>
                        <option value="未知地址">未知地址</option>
                        <option value="active">active</option>
                        <option value="success">success</option>
                    </select>
                    <button class="btn" type="button" @click="handleAction('reset-filters')">清除筛选</button>
                </div>

                <div v-if="live.errors.length && showAdminPage" class="notice warn">
                    <strong>部分后台接口暂不可用</strong>
                    <span>{{ live.errors.slice(0, 2).join('；') }}</span>
                </div>

                <div v-if="activeView === 'ops'" class="ops-boundary-strip" aria-label="运行边界">
                    <div v-for="item in opsBoundaryItems" :key="item.label" class="ops-boundary-item">
                        <span>{{ item.label }}</span>
                        <strong class="status" :class="statusClass(item.value)">{{ item.value }}</strong>
                    </div>
                </div>

                <div v-if="activeView === 'flow'" class="mail-workbench" :class="`flow-mode-${ui.flowMode}`"
                    :style="mailGridStyle" aria-label="收件流工作台">
                    <aside class="mail-facets" aria-label="收件流筛选">
                        <div class="facet-card">
                            <div class="facet-title">
                                <strong>队列</strong>
                                <button type="button" class="facet-mini-action mobile-only" @click="ui.flowMode = 'list'; syncMailQueryToRoute({ mode: undefined })">返回列表</button>
                            </div>
                            <button v-for="queue in mailHierarchy.queues" :key="queue.id" class="facet-row"
                                :class="{ 'is-active': ui.status === queue.status }" type="button"
                                @click="setMailStatus(queue.status)">
                                <span>{{ queue.label }}</span>
                                <b>{{ formatNumber(queue.count) }}</b>
                            </button>
                            <div class="facet-note">
                                常规邮件、未知收件人和渲染风险归在同一条收件链路里，不再拆成互相抢空间的报表。
                            </div>
                        </div>

                        <div class="facet-card">
                            <div class="facet-title">
                                <strong>邮箱</strong>
                                <span>域名 / 地址</span>
                            </div>
                            <div class="mail-tree">
                                <button class="facet-row" :class="{ 'is-active': ui.domain === 'all' && ui.address === 'all' }"
                                    type="button" @click="setMailDomain('all')">
                                    <span>全部域名</span>
                                    <b>{{ formatNumber(mailRows.length) }}</b>
                                </button>
                                <div v-for="domain in mailHierarchy.domains" :key="domain.id || domain.domain" class="tree-group">
                                    <button class="facet-row domain-row" :class="{ 'is-active': ui.domain === domain.domain && ui.address === 'all' }"
                                        type="button" @click="setMailDomain(domain.domain)">
                                        <span>{{ domain.domain }}</span>
                                        <b>{{ formatNumber(domain.mails || 0) }}</b>
                                    </button>
                                    <button v-for="address in domain.addresses" :key="address.address"
                                        class="facet-row address-row" :class="{ 'is-active': ui.address === address.address }"
                                        type="button" @click="setMailAddress(address.address)">
                                        <span>{{ address.address }}</span>
                                        <b>{{ formatNumber(address.count) }}</b>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </aside>
                    <button type="button" class="column-resizer facets-resizer" aria-label="调整筛选列宽"
                        @pointerdown="startMailColumnResize('facets-list', $event)"></button>

                    <section class="mail-list-panel panel" aria-label="邮件列表">
                        <div class="panel-head">
                            <div>
                                <h2>收件箱</h2>
                                <p>支持 from:、to:、subject:、has:attachment、is:unread 搜索。</p>
                            </div>
                            <div class="panel-head-actions">
                                <button type="button" class="btn compact-btn" @click="ui.flowMode = 'filters'; syncMailQueryToRoute({ mode: 'filters' })">筛选</button>
                                <span class="status neutral">{{ formatNumber(filteredMailRows.length) }} 封</span>
                            </div>
                        </div>
                        <div class="filter-strip">
                            <span class="filter-scope">筛选当前已加载邮件</span>
                            <button v-for="chip in activeFilterChips" :key="chip.key" type="button" class="filter-chip"
                                @click="clearMailFilter(chip.key)">
                                {{ chip.label }}
                                <span aria-hidden="true">×</span>
                            </button>
                            <button v-if="activeFilterChips.length" type="button" class="filter-clear" @click="handleAction('reset-filters')">
                                清除全部
                            </button>
                        </div>
                        <div class="mail-list" role="listbox" aria-label="邮件记录">
                            <button v-for="row in filteredMailRows" :key="row.id" class="mail-row" type="button"
                                role="option" :aria-selected="isSelected('flow', row)"
                                :class="{ 'is-selected': isSelected('flow', row), 'is-unread': row.unread }"
                                @click="selectRow('flow', row.id)"
                                @keydown="handleRowKey($event, 'flow', row)">
                                <span class="mail-main">
                                    <span class="mail-row-top">
                                        <span v-if="row.unread" class="unread-dot" aria-label="未读"></span>
                                        <strong>{{ row.subject }}</strong>
                                        <span class="mail-time">{{ row.time }}</span>
                                    </span>
                                    <span class="mail-snippet">{{ row.sender }}</span>
                                    <small>{{ row.body }}</small>
                                </span>
                                <span v-if="row.result !== '已保存' || row.attachmentCount > 0" class="mail-meta">
                                    <span class="status" :class="statusClass(row.result)">{{ row.result }}</span>
                                    <span v-if="row.attachmentCount > 0">{{ row.attachmentCount }} 附件</span>
                                </span>
                            </button>

                            <div v-if="filteredUnknownRows.length" class="queue-section">
                                <div class="queue-title">异常队列</div>
                                <button v-for="row in filteredUnknownRows" :key="row.id" class="mail-row exception"
                                    type="button" role="option" :aria-selected="isSelected('exception', row)"
                                    :class="{ 'is-selected': isSelected('exception', row) }"
                                    @click="selectRow('exception', row.id)"
                                    @keydown="handleRowKey($event, 'exception', row)">
                                    <span class="mail-main">
                                        <span class="mail-row-top">
                                            <strong>{{ row.title }}</strong>
                                            <span class="mail-time">{{ row.level }}</span>
                                        </span>
                                        <span class="mail-snippet">{{ row.owner }}</span>
                                        <small>{{ row.detail }}</small>
                                    </span>
                                    <span class="mail-meta">
                                        <span class="status" :class="statusClass(row.status)">{{ row.status }}</span>
                                    </span>
                                </button>
                            </div>

                            <div v-if="filteredMailRows.length === 0 && filteredUnknownRows.length === 0" class="empty-state">
                                <strong>没有匹配结果</strong>
                                <button class="btn" type="button" @click="handleAction('reset-filters')">清除筛选</button>
                            </div>
                        </div>
                    </section>
                    <button type="button" class="column-resizer detail-resizer" aria-label="调整列表和详情列宽"
                        @pointerdown="startMailColumnResize('list-detail', $event)"></button>

                    <aside class="mail-detail-panel panel" aria-label="邮件详情">
                        <div class="panel-head">
                            <div>
                                <h2>{{ currentRail.title }}</h2>
                                <p>{{ currentRail.subtitle }}</p>
                            </div>
                        </div>
                        <div class="inner-pad detail-pane-body">
                            <div v-if="currentRail.empty" class="empty-state reader-empty">
                                <strong>{{ currentRail.title }}</strong>
                                <span>{{ currentRail.subtitle }}</span>
                            </div>
                            <template v-else>
                            <div v-if="activeView === 'flow' && currentMail" class="mail-reader-actions">
                                <button type="button" class="btn mobile-only" @click="closeMailDetail">返回列表</button>
                                <button type="button" class="btn" :disabled="!canGoPrevMail" @click="selectAdjacentMail(-1)">上一封</button>
                                <button type="button" class="btn" :disabled="!canGoNextMail" @click="selectAdjacentMail(1)">下一封</button>
                                <button type="button" class="btn" @click="copyCurrent">复制收件地址</button>
                                <button type="button" class="btn danger" @click="handleAction('delete')">删除</button>
                            </div>
                            <dl v-if="currentMail" class="mail-summary">
                                <div>
                                    <dt>发件人</dt>
                                    <dd>{{ currentMail.sender }}</dd>
                                </div>
                                <div>
                                    <dt>收件人</dt>
                                    <dd>{{ currentMail.to }}</dd>
                                </div>
                                <div>
                                    <dt>时间</dt>
                                    <dd>{{ currentMail.fullTime || currentMail.time }}</dd>
                                </div>
                            </dl>
                            <div v-if="currentRail.tags?.length" class="tag-row rail-tags">
                                <span v-for="tag in currentRail.tags" :key="tag" class="tag">{{ tag }}</span>
                            </div>
                            <section class="body-section">
                                <div class="body-section-head">
                                    <strong>正文</strong>
                                    <div class="render-toggle" role="group" aria-label="正文显示模式">
                                        <button type="button" :class="{ 'is-active': ui.mailRenderMode === 'html' }"
                                            :disabled="!currentRail.mail?.html"
                                            @click="ui.mailRenderMode = 'html'">HTML</button>
                                        <button type="button" :class="{ 'is-active': ui.mailRenderMode === 'text' }"
                                            :disabled="!currentRail.mail?.text"
                                            @click="ui.mailRenderMode = 'text'">文本</button>
                                        <button type="button" :class="{ 'is-active': ui.mailRenderMode === 'raw' }"
                                            :disabled="!currentRail.mail?.raw"
                                            @click="ui.mailRenderMode = 'raw'">原始</button>
                                    </div>
                                </div>
                                <div v-if="currentRendererMail && ui.mailRenderMode === 'html'" class="mail-body html-body">
                                    <MailContentRenderer :mail="currentRendererMail" :showEMailTo="true" :showReply="false" :showMetaBar="false" />
                                </div>
                                <pre v-else-if="currentRail.mail?.text && ui.mailRenderMode === 'text'" class="mail-body text-body">{{ currentRail.mail.text }}</pre>
                                <pre v-else-if="currentRail.mail?.raw && ui.mailRenderMode === 'raw'" class="mail-body raw-body">{{ currentRail.mail.raw }}</pre>
                                <p v-else-if="currentRail.body" class="mail-body text-fallback">{{ currentRail.body }}</p>
                                <p v-else class="mail-body text-fallback">当前记录没有可展示正文。</p>
                            </section>
                            <section v-if="currentRail.mail?.attachments?.length" class="attachment-section">
                                <div class="body-section-head">
                                    <strong>附件</strong>
                                    <span>{{ currentRail.mail.attachmentLabel }}</span>
                                </div>
                                <div class="attachment-list">
                                    <span v-for="item in currentRail.mail.attachments" :key="item.filename || item.id" class="attachment-chip">
                                        {{ item.filename || 'attachment' }}
                                    </span>
                                </div>
                            </section>
                            <details v-if="currentRail.kv" class="metadata-section">
                                <summary>技术信息</summary>
                                <dl class="kv">
                                    <template v-for="item in currentRail.kv" :key="item[0]">
                                        <dt>{{ item[0] }}</dt>
                                        <dd>
                                            <span v-if="item[2] === 'status'" class="status" :class="statusClass(item[1])">{{ item[1] }}</span>
                                            <span v-else>{{ item[1] }}</span>
                                        </dd>
                                    </template>
                                </dl>
                            </details>
                            <div v-if="currentRail.actions" class="tag-row rail-actions">
                                <button v-for="action in currentRail.actions" :key="action.label" type="button" class="btn"
                                    :class="{ primary: action.primary, danger: action.danger }"
                                    @click="action.modal ? openActionModal(action.modal) : handleAction(action.action)">
                                    {{ action.label }}
                                </button>
                            </div>
                            </template>
                        </div>
                    </aside>
                </div>

                <div v-else-if="activeView === 'overview'" class="overview-home" aria-label="运行总控入口">
                    <button type="button" class="overview-entry primary-entry" @click="setView('flow')">
                        <span class="overview-entry-kicker">收件工作区</span>
                        <strong>{{ formatNumber(explicitUnreadMailCount) }} 未读</strong>
                        <span>{{ formatNumber(mailRows.length) }} 封最近邮件，进入收件箱查看正文、附件和渲染状态。</span>
                    </button>
                    <button type="button" class="overview-entry" @click="setView('routing')">
                        <span class="overview-entry-kicker">入口与路由</span>
                        <strong>{{ formatNumber(domainRows.length) }} 个域名</strong>
                        <span>检查 collector、接收方式、验证状态和域名归属。</span>
                    </button>
                    <button type="button" class="overview-entry" @click="setView('identity')">
                        <span class="overview-entry-kicker">地址身份</span>
                        <strong>{{ formatNumber(addressRows.length) }} 个地址</strong>
                        <span>管理地址、标签、凭证、分享包和账号归属。</span>
                    </button>
                    <button type="button" class="overview-entry" @click="setView('ops')">
                        <span class="overview-entry-kicker">运行维护</span>
                        <strong>{{ live.errors.length ? '需复核' : workerStatusLabel }}</strong>
                        <span>查看 Worker、D1、KV、DB 版本和后台接口状态。</span>
                    </button>
                </div>

                <div v-else class="view-grid">
                    <section v-for="panel in activePanels" :key="panel.id" class="panel" :class="panel.layout">
                        <div class="panel-head">
                            <div>
                                <h2>{{ panel.title }}</h2>
                                <p>{{ panel.note }}</p>
                            </div>
                        </div>
                        <div class="table-wrap">
                            <table>
                                <caption class="sr-only">{{ panel.title }} 数据表</caption>
                                <thead>
                                    <tr>
                                        <th v-for="column in panel.columns" :key="column.label"
                                            :class="{ num: column.type === 'number' }">
                                            {{ column.label }}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="row in panel.rows" :key="row.id" tabindex="0"
                                        :aria-selected="isSelected(panel.kind, row)"
                                        :class="{ 'is-selected': isSelected(panel.kind, row) }"
                                        @click="selectRow(panel.kind, row.id)"
                                        @keydown="handleRowKey($event, panel.kind, row)">
                                        <td v-for="column in panel.columns" :key="column.label"
                                            :class="{ num: column.type === 'number' }">
                                            <template v-if="column.type === 'entity'">
                                                <div class="cell-main">
                                                    <strong>{{ cellText(row, column.main) }}</strong>
                                                    <span class="cell-sub">{{ cellText(row, column.sub) }}</span>
                                                    <span v-if="column.tags && row[column.tags]?.length" class="tag-row">
                                                        <span v-for="tag in row[column.tags]" :key="tag" class="tag">{{ tag }}</span>
                                                    </span>
                                                    <span v-if="panel.kind === 'identity' && column.main === 'address'" class="cell-actions">
                                                        <button type="button" @click.stop="openMailFromAddress(row.address)">查看收件</button>
                                                        <button type="button" @click.stop="copyText(row.address)">复制</button>
                                                        <button type="button" @click.stop="openActionModal('share-package')">分享</button>
                                                    </span>
                                                    <span v-if="panel.kind === 'routing' && column.main === 'domain'" class="cell-actions">
                                                        <button type="button" @click.stop="openMailFromDomain(row.domain)">查看邮件</button>
                                                        <button type="button" @click.stop="openActionModal('new-address')">创建地址</button>
                                                        <button type="button" @click.stop="copyText(row.collector)">复制 Collector</button>
                                                    </span>
                                                </div>
                                            </template>
                                            <span v-else-if="column.type === 'status'" class="status"
                                                :class="statusClass(row[column.key])">
                                                {{ cellText(row, column.key) }}
                                            </span>
                                            <strong v-else-if="column.type === 'strong'">{{ cellText(row, column.key) }}</strong>
                                            <span v-else-if="column.type === 'time'" class="time-text">{{ cellText(row, column.key) }}</span>
                                            <span v-else-if="column.type === 'mono'" class="mono">{{ cellText(row, column.key) }}</span>
                                            <span v-else-if="column.type === 'number'">{{ Number.isFinite(Number(row[column.key])) ? formatNumber(row[column.key]) : '-' }}</span>
                                            <span v-else>{{ cellText(row, column.key) }}</span>
                                        </td>
                                    </tr>
                                    <tr v-if="panel.rows.length === 0">
                                        <td :colspan="panel.columns.length">
                                            <div class="empty-state">
                                                <strong>没有匹配结果</strong>
                                                <button class="btn" type="button" @click="handleAction('reset-filters')">清除筛选</button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section v-if="activeView === 'identity'" class="panel third">
                        <div class="panel-head">
                            <div>
                                <h2>固定凭证链接</h2>
                                <p>保留旧 fixed credential 能力，但明确版本、轮换和泄露处理</p>
                            </div>
                        </div>
                        <div class="inner-pad">
                            <dl class="kv">
                                <dt>当前策略</dt><dd>credential_version 校验</dd>
                                <dt>显示方式</dt><dd>管理员确认后展示一次</dd>
                                <dt>泄露处理</dt><dd>轮换后旧链接立即失效</dd>
                                <dt>审计</dt><dd>show / rotate / revoke 均写入事件</dd>
                            </dl>
                        </div>
                    </section>

                    <section v-if="activeView === 'routing'" class="panel split">
                        <div class="panel-head">
                            <div>
                                <h2>配置检查</h2>
                                <p>旧说明卡片改为可执行检查清单</p>
                            </div>
                        </div>
                        <div class="inner-pad timeline">
                            <div class="timeline-row"><span class="mono">01</span><strong>Cloudflare token</strong><span class="status ok">可用</span></div>
                            <div class="timeline-row"><span class="mono">02</span><strong>catch-all 到 Worker</strong><span class="status ok">已验证</span></div>
                            <div class="timeline-row"><span class="mono">03</span><strong>ImprovMX collector 地址</strong><span class="status ok">可用</span></div>
                            <div class="timeline-row"><span class="mono">04</span><strong>DMARC enforcement</strong><span class="status warn">需复核</span></div>
                        </div>
                    </section>

                    <section v-if="activeView === 'delivery'" class="panel third">
                        <div class="panel-head">
                            <div>
                                <h2>内容处理</h2>
                                <p>AI 提取不删掉，但从独立配置页收敛成邮件详情里的处理能力</p>
                            </div>
                        </div>
                        <div class="inner-pad">
                            <dl class="kv">
                                <dt>AI 提取</dt><dd><span class="status warn">灰度中</span></dd>
                                <dt>HTML 预览</dt><dd><span class="status ok">隔离渲染</span></dd>
                                <dt>附件转存</dt><dd><span class="status warn">仅展示入口</span></dd>
                                <dt>自动回复</dt><dd><span class="status warn">暂未执行生产写入</span></dd>
                            </dl>
                        </div>
                    </section>
                </div>
            </section>
        </main>

        <div v-if="detailOpen" class="detail-drawer-backdrop" role="dialog" aria-modal="true"
            aria-labelledby="detail-drawer-title" @click.self="closeDetail" @keydown.esc="closeDetail">
            <aside class="detail-drawer" tabindex="-1" aria-label="上下文详情抽屉">
                <div class="modal-head">
                    <div>
                        <h2 id="detail-drawer-title">{{ currentRail.title }}</h2>
                        <p>{{ currentRail.subtitle }}</p>
                    </div>
                    <button class="icon-btn" type="button" aria-label="关闭详情" @click="closeDetail">
                        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                </div>
                <div class="inner-pad detail-drawer-body">
                    <div v-if="currentRail.tags?.length" class="tag-row rail-tags">
                        <span v-for="tag in currentRail.tags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                    <dl v-if="currentRail.kv" class="kv">
                        <template v-for="item in currentRail.kv" :key="item[0]">
                            <dt>{{ item[0] }}</dt>
                            <dd>
                                <span v-if="item[2] === 'status'" class="status" :class="statusClass(item[1])">{{ item[1] }}</span>
                                <span v-else>{{ item[1] }}</span>
                            </dd>
                        </template>
                    </dl>
                    <p v-if="currentRail.body" class="quoted">{{ currentRail.body }}</p>
                    <div v-if="currentRail.actions" class="tag-row rail-actions">
                        <button v-for="action in currentRail.actions" :key="action.label" type="button" class="btn"
                            :class="{ primary: action.primary, danger: action.danger }"
                            @click="action.modal ? openActionModal(action.modal) : handleAction(action.action)">
                            {{ action.label }}
                        </button>
                    </div>
                    <div v-if="currentRail.alerts" class="timeline">
                        <div v-for="risk in currentRail.alerts" :key="risk.id" class="timeline-row">
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

        <div v-if="showAdminPasswordModal" class="modal-backdrop is-open" role="dialog" aria-modal="true"
            aria-labelledby="admin-auth-title">
            <form class="modal" @submit.prevent="authFunc">
                <div class="modal-head">
                    <h2 id="admin-auth-title">管理员访问</h2>
                </div>
                <div class="modal-body">
                    <p class="modal-copy">请输入管理员密码进入 OpenDesign 灰度后台。当前接入生产后端，写入动作仍保持灰度 no-op。</p>
                    <div class="form-grid">
                        <label class="form-field full">
                            <span>管理员密码</span>
                            <input v-model="tmpAdminAuth" class="field" type="password" autocomplete="current-password" />
                        </label>
                    </div>
                    <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
                </div>
                <div class="modal-actions">
                    <button class="btn primary" type="submit" :disabled="loading">
                        {{ loading ? '进入中' : '进入' }}
                    </button>
                </div>
            </form>
        </div>

        <div v-if="actionModal" class="modal-backdrop is-open" role="dialog" aria-modal="true"
            aria-labelledby="action-modal-title" @click.self="closeActionModal">
            <div class="modal">
                <div class="modal-head">
                    <h2 id="action-modal-title">{{ modalTitle }}</h2>
                    <button class="icon-btn" type="button" aria-label="关闭" @click="closeActionModal">
                        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="notice modal-notice">
                        <strong>灰度 no-op</strong>
                        <span>此表单不会写入生产数据；真实写入需要后端策略和二次确认。</span>
                    </div>
                    <div class="form-grid">
                        <label v-for="field in modalFields" :key="field.label" class="form-field"
                            :class="{ full: field.wide }">
                            <span>{{ field.label }}</span>
                            <textarea v-if="field.wide" :value="field.value" readonly />
                            <input v-else class="field" :value="field.value" readonly />
                        </label>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn" type="button" @click="closeActionModal">取消</button>
                    <button class="btn primary" type="button" @click="saveModal">记录</button>
                </div>
            </div>
        </div>

        <div class="toast" :class="{ 'is-visible': toastState.visible }" role="status" aria-live="polite">
            {{ toastState.text }}
        </div>
    </div>
</template>

<style scoped>
:global(html:has(.admin-next)),
:global(body:has(.admin-next)) {
    height: 100dvh;
    overflow: hidden;
}

:global(body:has(.admin-next) .n-message-container) {
    display: none;
}

.admin-next {
    --shell: oklch(24% 0.035 252);
    --shell-2: oklch(30% 0.04 252);
    --bg: oklch(97.8% 0.004 250);
    --surface: oklch(100% 0 0);
    --surface-soft: oklch(98.2% 0.005 250);
    --fg: oklch(20% 0.026 252);
    --muted: oklch(50% 0.026 252);
    --subtle: oklch(62% 0.024 252);
    --border: oklch(89% 0.012 252);
    --border-strong: oklch(82% 0.016 252);
    --accent: oklch(53% 0.17 255);
    --accent-soft: oklch(94% 0.04 255);
    --success: oklch(55% 0.14 153);
    --success-soft: oklch(95% 0.045 153);
    --warn: oklch(68% 0.16 70);
    --warn-soft: oklch(96% 0.055 77);
    --danger: oklch(57% 0.2 28);
    --danger-soft: oklch(95% 0.05 28);
    --info: oklch(58% 0.13 220);
    --info-soft: oklch(94% 0.045 220);
    --shadow-border: 0 0 0 1px rgba(10, 24, 48, 0.07), 0 1px 2px -1px rgba(10, 24, 48, 0.08), 0 10px 30px -24px rgba(10, 24, 48, 0.45);
    --shadow-pop: 0 0 0 1px rgba(10, 24, 48, 0.08), 0 18px 48px -24px rgba(10, 24, 48, 0.45);
    --radius: 8px;
    --radius-sm: 5px;
    height: 100dvh;
    min-height: 0;
    background: var(--bg);
    color: var(--fg);
    font: 14px/1.5 "Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif;
    letter-spacing: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

.admin-next * {
    box-sizing: border-box;
}

.app {
    display: grid;
    grid-template-columns: 244px minmax(0, 1fr);
    justify-content: start;
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    transition-property: grid-template-columns;
    transition-duration: 180ms;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.app.is-flow-view {
    grid-template-columns: 244px minmax(0, 1fr);
}

.app.is-sidebar-collapsed {
    grid-template-columns: 72px minmax(0, 1fr);
}

.app.is-flow-view.is-sidebar-collapsed {
    grid-template-columns: 72px minmax(0, 1fr);
}

button,
input,
select,
textarea {
    font: inherit;
}

button {
    min-height: 40px;
    cursor: pointer;
    transition-property: background-color, color, box-shadow, scale, border-color, opacity;
    transition-duration: 150ms;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

button:active:not(:disabled) {
    scale: 0.96;
}

button:disabled {
    cursor: default;
    opacity: 0.48;
}

button:focus-visible,
.nav-link:focus-visible,
.field:focus-visible,
.select:focus-visible,
textarea:focus-visible,
tr[tabindex]:focus-visible {
    outline: 2px solid color-mix(in oklch, var(--accent) 72%, white);
    outline-offset: 2px;
}

svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
}

.sidebar {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 18px;
    min-height: 0;
    overflow: hidden;
    padding: 18px 12px;
    background: var(--surface);
    color: var(--fg);
    box-shadow: 1px 0 0 rgba(10, 24, 48, 0.08);
}

.brand {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 40px;
    gap: 10px;
    align-items: center;
    min-height: 44px;
}

.brand-mark {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: color-mix(in oklch, var(--accent) 84%, black);
    box-shadow: var(--shadow-border);
}

.brand-title {
    min-width: 0;
    font-size: 15px;
    font-weight: 760;
    line-height: 1.16;
}

.brand-title span {
    display: block;
    color: var(--muted);
    font-size: 12px;
    font-weight: 520;
}

.sidebar-toggle {
    display: grid;
    width: 40px;
    height: 40px;
    min-height: 40px;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--muted);
}

.sidebar-toggle:hover {
    color: var(--fg);
    box-shadow: var(--shadow-border);
}

.nav-scroll {
    min-height: 0;
    overflow: auto;
    padding-right: 3px;
}

.nav-group {
    display: grid;
    gap: 6px;
    margin-bottom: 18px;
}

.nav-group-title {
    padding: 0 10px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 760;
}

.nav-link {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 42px;
    border: 0;
    border-radius: var(--radius);
    padding: 8px 10px;
    background: transparent;
    color: var(--muted);
    text-align: left;
}

.nav-link:hover,
.nav-link.is-active {
    background: var(--accent-soft);
    color: color-mix(in oklch, var(--accent) 80%, black);
}

.nav-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.nav-badge {
    min-width: 22px;
    border-radius: 999px;
    padding: 1px 7px;
    background: var(--accent);
    color: white;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: center;
}

.nav-dot {
    justify-self: end;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--warn);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--warn) 16%, transparent);
}

.sidebar-foot {
    display: grid;
    gap: 6px;
    border-radius: var(--radius);
    padding: 10px;
    background: var(--surface-soft);
    color: var(--muted);
    font-size: 12px;
}

.is-sidebar-collapsed .sidebar {
    gap: 14px;
    padding: 18px 8px;
}

.is-sidebar-collapsed .brand {
    grid-template-columns: 1fr;
    gap: 8px;
    justify-items: center;
}

.is-sidebar-collapsed .brand-title,
.is-sidebar-collapsed .nav-group-title,
.is-sidebar-collapsed .sidebar-foot {
    display: none;
}

.is-sidebar-collapsed .nav-group {
    gap: 8px;
    margin-bottom: 12px;
}

.is-sidebar-collapsed .nav-link {
    grid-template-columns: 1fr;
    justify-items: center;
    min-height: 44px;
    padding: 0;
}

.is-sidebar-collapsed .nav-link svg {
    width: 18px;
    height: 18px;
}

.is-sidebar-collapsed .nav-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}

.is-sidebar-collapsed .nav-badge,
.is-sidebar-collapsed .nav-dot {
    position: absolute;
    top: 6px;
    right: 7px;
}

.is-sidebar-collapsed .nav-badge {
    min-width: 18px;
    padding: 0 5px;
    font-size: 10px;
}

.health-dot {
    display: inline-flex;
    gap: 6px;
    align-items: center;
}

.health-dot::before {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--success);
    box-shadow: 0 0 0 4px color-mix(in oklch, var(--success) 18%, transparent);
    content: "";
}

.workspace {
    min-width: 0;
    min-height: 0;
    height: 100dvh;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
}

.topbar {
    display: grid;
    grid-template-columns: minmax(160px, 280px) minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    padding: 14px 18px;
    background: color-mix(in oklch, var(--surface) 90%, transparent);
    box-shadow: 0 1px 0 rgba(10, 24, 48, 0.08);
}

.topbar-controls {
    display: grid;
    grid-template-columns: minmax(150px, 220px) minmax(280px, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-width: 0;
}

.domain-select {
    min-width: 0;
}

.page-title {
    min-width: 0;
}

.page-title h1 {
    margin: 0;
    font-size: 22px;
    line-height: 1.2;
    text-wrap: balance;
}

.page-title span {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: 12px;
}

.select,
.field,
textarea {
    width: 100%;
    min-height: 40px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--fg);
    box-shadow: var(--shadow-border);
}

.select {
    padding: 0 10px;
}

.field {
    padding: 0 10px;
}

textarea {
    min-height: 96px;
    padding: 10px;
    resize: vertical;
}

.searchbox {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    min-height: 40px;
    border-radius: var(--radius);
    padding: 0 10px;
    background: var(--surface);
    box-shadow: var(--shadow-border);
}

.searchbox .field {
    min-height: 36px;
    padding: 0;
    box-shadow: none;
    overflow: hidden;
    text-overflow: ellipsis;
}

.kbd {
    border-radius: 4px;
    padding: 1px 5px;
    background: var(--surface-soft);
    color: var(--subtle);
    font-size: 11px;
    font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

.top-actions,
.toolbar,
.tag-row,
.modal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.top-actions {
    justify-content: flex-end;
}

.sync-state {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
}

.sync-state::before {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--success);
    content: "";
}

.sync-state.is-loading::before {
    background: var(--warn);
}

.btn {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    border: 0;
    border-radius: var(--radius-sm);
    padding: 0 12px;
    background: var(--surface);
    color: var(--fg);
    box-shadow: var(--shadow-border);
    white-space: nowrap;
}

.btn:hover {
    box-shadow: var(--shadow-pop);
}

.btn.primary {
    background: var(--accent);
    color: white;
}

.btn.danger {
    background: var(--danger-soft);
    color: var(--danger);
}

.view {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 16px;
}

.app.is-flow-view .view {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
    overflow: hidden;
}

.view-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 14px;
}

.state-band,
.cols-4 {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
}

.state-band {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.state-card,
.panel,
.notice {
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-border);
}

.state-card {
    padding: 13px 14px;
}

.state-card strong,
.state-card span {
    display: block;
}

.state-card strong {
    font-size: 18px;
    font-variant-numeric: tabular-nums;
}

.state-card span,
.state-card small {
    color: var(--muted);
    font-size: 12px;
}

.state-card.warn {
    background: color-mix(in oklch, var(--warn-soft) 48%, white);
}

.state-card.error {
    background: color-mix(in oklch, var(--danger-soft) 42%, white);
}

.toolbar,
.notice {
    grid-column: 1 / -1;
    margin-bottom: 14px;
}

.toolbar {
    min-height: 48px;
    align-items: center;
    border-radius: var(--radius);
    padding: 8px;
    background: color-mix(in oklch, var(--surface) 72%, transparent);
    box-shadow: var(--shadow-border);
}

.toolbar .select {
    width: auto;
    min-width: 160px;
    flex: 0 0 180px;
}

.ops-boundary-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
}

.ops-boundary-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 44px;
    border-radius: var(--radius);
    padding: 0 12px;
    background: var(--surface);
    box-shadow: var(--shadow-border);
}

.ops-boundary-item > span {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    font-weight: 720;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.overview-home {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    max-width: 1280px;
}

.overview-entry {
    display: grid;
    gap: 8px;
    min-height: 142px;
    border: 0;
    border-radius: var(--radius);
    padding: 16px;
    background: var(--surface);
    color: var(--fg);
    text-align: left;
    box-shadow: var(--shadow-border);
}

.overview-entry:hover {
    box-shadow: var(--shadow-pop);
}

.overview-entry.primary-entry {
    background: color-mix(in oklch, var(--accent-soft) 42%, white);
}

.overview-entry-kicker {
    color: var(--muted);
    font-size: 12px;
    font-weight: 720;
}

.overview-entry strong {
    font-size: 24px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}

.overview-entry span:last-child {
    color: var(--muted);
    font-size: 12px;
    text-wrap: pretty;
}

.notice {
    display: grid;
    gap: 3px;
    padding: 12px 14px;
    background: var(--warn-soft);
}

.source-notice {
    margin-bottom: 14px;
}

.app.is-flow-view .source-notice {
    display: flex;
    align-items: center;
    min-height: 44px;
    margin-bottom: 0;
    padding: 9px 12px;
}

.app.is-flow-view .source-notice span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.notice span {
    color: var(--muted);
    font-size: 12px;
}

.panel {
    grid-column: 1 / -1;
    min-width: 0;
    overflow: hidden;
}

.mail-workbench {
    display: grid;
    grid-template-columns:
        minmax(180px, var(--mail-facets-width, 220px))
        8px
        minmax(360px, var(--mail-list-width, 540px))
        8px
        minmax(420px, 1fr);
    gap: 6px;
    align-items: stretch;
    height: 100%;
    min-height: 0;
    max-width: none;
}

.mail-workbench > .panel {
    grid-column: auto;
}

.column-resizer {
    align-self: stretch;
    width: 8px;
    min-height: 0;
    border: 0;
    border-radius: 999px;
    padding: 0;
    background: transparent;
    cursor: col-resize;
    box-shadow: none;
}

.column-resizer:hover,
.column-resizer:focus-visible {
    background: color-mix(in oklch, var(--accent) 18%, transparent);
    outline: none;
}

.column-resizer::before {
    display: block;
    width: 2px;
    height: 100%;
    margin: 0 auto;
    border-radius: 999px;
    background: color-mix(in oklch, var(--border-strong) 70%, transparent);
    content: "";
}

.mobile-only {
    display: none;
}

.app.is-flow-view .toolbar {
    min-height: 44px;
    margin-bottom: 0;
    padding: 6px;
}

.app.is-flow-view .toolbar .btn,
.app.is-flow-view .toolbar .select {
    min-height: 36px;
}

.mail-facets,
.mail-list-panel,
.mail-detail-panel {
    min-width: 0;
    min-height: 0;
}

.mail-facets {
    display: grid;
    gap: 10px;
    align-content: start;
    overflow: auto;
}

.facet-card {
    border-radius: var(--radius);
    padding: 12px;
    background: var(--surface);
    box-shadow: var(--shadow-border);
}

.facet-title,
.body-section-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
}

.facet-title span,
.body-section-head span {
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.facet-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 36px;
    border: 0;
    border-radius: var(--radius-sm);
    padding: 0 8px;
    background: transparent;
    color: var(--fg);
    text-align: left;
}

.facet-row:hover,
.facet-row.is-active {
    background: var(--accent-soft);
    color: color-mix(in oklch, var(--accent) 82%, black);
}

.facet-row b {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.facet-note {
    margin-top: 10px;
    color: var(--muted);
    font-size: 12px;
    text-wrap: pretty;
}

.safety-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.mail-tree {
    display: grid;
    gap: 4px;
}

.tree-group {
    display: grid;
    gap: 2px;
}

.domain-row span,
.address-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.address-row {
    padding-left: 18px;
    color: var(--muted);
}

.filter-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    border-top: 1px solid var(--border);
    padding: 8px 10px;
    background: var(--surface-soft);
}

.filter-scope,
.filter-clear,
.filter-chip {
    font-size: 12px;
}

.filter-scope {
    color: var(--muted);
}

.filter-chip,
.filter-clear {
    min-height: 28px;
    border: 0;
    border-radius: 999px;
    padding: 0 9px;
    background: var(--surface);
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--border);
}

.filter-chip span {
    margin-left: 5px;
    color: var(--muted);
}

.panel-head-actions {
    display: inline-flex;
    gap: 8px;
    align-items: center;
}

.compact-btn,
.facet-mini-action {
    min-height: 30px;
    font-size: 12px;
}

.facet-mini-action {
    border: 0;
    border-radius: 999px;
    padding: 0 8px;
    background: var(--surface-soft);
    color: var(--muted);
}

.cell-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
}

.cell-actions button {
    min-height: 26px;
    border: 0;
    border-radius: 999px;
    padding: 0 8px;
    background: var(--surface-soft);
    color: var(--muted);
    font-size: 12px;
}

.cell-actions button:hover {
    color: var(--fg);
    box-shadow: inset 0 0 0 1px var(--border);
}

.mail-list-panel,
.mail-detail-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
}

.mail-list {
    min-height: 0;
    overflow: auto;
    padding: 0 10px 10px;
}

.mail-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    width: 100%;
    min-height: 76px;
    border: 0;
    border-top: 1px solid var(--border);
    border-radius: 0;
    padding: 10px 8px;
    background: transparent;
    color: var(--fg);
    text-align: left;
}

.mail-row:hover,
.mail-row.is-selected {
    background: color-mix(in oklch, var(--accent-soft) 50%, white);
}

.mail-row.exception {
    background: color-mix(in oklch, var(--warn-soft) 28%, white);
}

.mail-row.is-unread .mail-main strong {
    font-weight: 650;
}

.unread-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
    align-self: center;
}

.mail-time {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.time-text {
    display: inline-block;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.mail-main {
    display: grid;
    gap: 2px;
    min-width: 0;
}

.mail-row-top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
}

.mail-row-top:not(:has(.unread-dot)) {
    grid-template-columns: minmax(0, 1fr) auto;
}

.mail-main strong {
    display: block;
    overflow: hidden;
    line-height: 1.28;
    overflow-wrap: anywhere;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mail-snippet,
.mail-main small {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mail-meta {
    display: grid;
    justify-items: end;
    gap: 5px;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
}

.queue-section {
    margin-top: 12px;
    border-top: 1px solid var(--border-strong);
}

.queue-title {
    padding: 10px 4px 2px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 760;
}

.detail-pane-body {
    min-height: 0;
    overflow: auto;
}

.mail-reader-actions {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    margin: -12px -12px 12px;
    padding: 8px 12px;
    background: color-mix(in oklch, var(--surface) 96%, transparent);
}

.mail-reader-actions .btn {
    min-height: 34px;
}

.mail-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0 0 8px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
}

.mail-summary div {
    display: grid;
    gap: 2px;
    min-width: 0;
}

.mail-summary dt {
    color: var(--muted);
    font-size: 12px;
}

.mail-summary dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--fg);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mail-detail-panel .panel-head {
    padding: 12px 16px 8px;
}

.mail-detail-panel .panel-head p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.reader-empty {
    min-height: 280px;
    align-content: center;
}

.body-section {
    margin-top: 10px;
}

.body-section-head {
    margin-bottom: 8px;
}

.metadata-section {
    margin-top: 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
}

.metadata-section summary {
    min-height: 38px;
    padding: 9px 10px;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 650;
}

.metadata-section .kv {
    padding: 0 10px 10px;
}

.render-toggle {
    display: inline-flex;
    gap: 2px;
    border-radius: var(--radius-sm);
    padding: 2px;
    background: var(--surface-soft);
    box-shadow: inset 0 0 0 1px var(--border);
}

.render-toggle button {
    min-height: 28px;
    border: 0;
    border-radius: 4px;
    padding: 0 8px;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
}

.render-toggle button.is-active {
    background: var(--surface);
    color: var(--fg);
    box-shadow: var(--shadow-border);
}

.render-toggle button:disabled {
    opacity: 0.38;
}

.mail-body {
    margin: 0;
    border-radius: var(--radius-sm);
    padding: 12px;
    background: var(--surface-soft);
    color: var(--fg);
    overflow: auto;
}

.html-body {
    max-height: none;
    background: white;
}

.html-body :deep(.mail-content-renderer) {
    gap: 0;
}

.html-body :deep(.mail-content) {
    margin-top: 0;
}

.html-body :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    outline: 1px solid rgba(0, 0, 0, 0.1);
}

.html-body :deep(img[alt]) {
    min-width: 72px;
    min-height: 32px;
}

.html-body :deep(a) {
    overflow-wrap: anywhere;
}

.text-body,
.raw-body {
    max-height: 520px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.text-body {
    font-family: inherit;
    line-height: 1.55;
}

.raw-body {
    font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.55;
}

.text-fallback {
    line-height: 1.55;
    text-wrap: pretty;
}

.attachment-section {
    margin-top: 12px;
}

.attachment-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.attachment-chip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border-radius: 999px;
    padding: 3px 9px;
    background: var(--surface-soft);
    color: var(--muted);
    font-size: 12px;
}

.panel.split {
    grid-column: span 6;
}

.panel.third {
    grid-column: span 4;
}

.panel-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 10px;
}

.panel-head h2 {
    margin: 0;
    font-size: 15px;
    line-height: 1.25;
    text-wrap: balance;
}

.panel-head p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12px;
    text-wrap: pretty;
}

.table-wrap {
    overflow: auto;
}

table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
}

th,
td {
    padding: 10px 12px;
    border-top: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
}

th {
    color: var(--muted);
    font-size: 11px;
    font-weight: 760;
}

tr[tabindex] {
    cursor: pointer;
}

tr[tabindex]:hover,
tr.is-selected {
    background: color-mix(in oklch, var(--accent-soft) 44%, white);
}

.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.cell-main {
    display: grid;
    gap: 3px;
    min-width: 170px;
}

.cell-main strong {
    overflow-wrap: anywhere;
    line-height: 1.3;
}

.cell-sub {
    color: var(--muted);
    font-size: 12px;
    text-wrap: pretty;
}

.status,
.tag {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    border-radius: 999px;
    padding: 2px 8px;
    background: var(--surface-soft);
    color: var(--muted);
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
}

.status.ok {
    background: var(--success-soft);
    color: color-mix(in oklch, var(--success) 78%, black);
}

.status.warn {
    background: var(--warn-soft);
    color: color-mix(in oklch, var(--warn) 78%, black);
}

.status.danger {
    background: var(--danger-soft);
    color: color-mix(in oklch, var(--danger) 78%, black);
}

.tag-row {
    margin-top: 4px;
}

.tag {
    border-radius: 5px;
}

.tag.subtle {
    background: transparent;
    color: var(--muted);
    box-shadow: inset 0 0 0 1px var(--border);
}

.inner-pad {
    padding: 0 16px 16px;
}

.kv {
    display: grid;
    grid-template-columns: minmax(90px, 0.45fr) minmax(0, 1fr);
    gap: 8px 12px;
    margin: 0;
}

.kv dt {
    color: var(--muted);
}

.kv dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
}

.quoted {
    margin: 12px 0 0;
    border-radius: var(--radius-sm);
    padding: 10px;
    background: var(--surface-soft);
    color: var(--muted);
    text-wrap: pretty;
}

.timeline {
    display: grid;
    gap: 8px;
}

.timeline-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    border-radius: var(--radius-sm);
    padding: 10px;
    background: var(--surface-soft);
}

.empty-state {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: center;
    padding: 22px;
    color: var(--muted);
}

.rail {
    min-width: 0;
    overflow: auto;
    padding: 16px 14px;
    background: color-mix(in oklch, var(--surface-soft) 82%, white);
    box-shadow: -1px 0 0 rgba(10, 24, 48, 0.08);
}

.rail .panel {
    position: sticky;
    top: 0;
}

.rail-tags,
.rail-actions {
    margin-bottom: 12px;
}

.modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(4, 12, 24, 0.45);
}

.modal {
    width: min(680px, calc(100vw - 36px));
    max-height: min(780px, calc(100dvh - 36px));
    overflow: auto;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-pop);
}

.modal-head,
.modal-actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 14px 16px;
}

.modal-head {
    box-shadow: 0 1px 0 rgba(10, 24, 48, 0.08);
}

.modal-head h2 {
    margin: 0;
    font-size: 16px;
}

.modal-body {
    padding: 16px;
}

.modal-copy {
    margin: 0 0 14px;
    color: var(--muted);
}

.modal-notice {
    margin-bottom: 14px;
}

.modal-actions {
    justify-content: flex-end;
    box-shadow: 0 -1px 0 rgba(10, 24, 48, 0.08);
}

.icon-btn {
    display: grid;
    width: 40px;
    height: 40px;
    min-height: 40px;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.form-field {
    display: grid;
    gap: 6px;
}

.form-field.full {
    grid-column: 1 / -1;
}

.form-field span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 650;
}

.toast {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 70;
    transform: translateY(10px);
    opacity: 0;
    border-radius: var(--radius);
    padding: 10px 12px;
    background: var(--shell);
    color: white;
    box-shadow: var(--shadow-pop);
    transition-property: opacity, transform;
    transition-duration: 160ms;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    pointer-events: none;
}

.toast.is-visible {
    transform: translateY(0);
    opacity: 1;
}

.detail-drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: grid;
    justify-items: end;
    background: rgba(4, 12, 24, 0.42);
}

.detail-drawer {
    width: min(520px, calc(100vw - 28px));
    height: 100dvh;
    overflow: auto;
    background: var(--surface);
    box-shadow: var(--shadow-pop);
}

.detail-drawer .modal-head p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12px;
}

.detail-drawer-body {
    padding-top: 16px;
}

.mono {
    font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
}

@media (max-width: 1600px) {
    .app {
        grid-template-columns: 232px minmax(0, 1fr);
    }

    .app.is-flow-view {
        grid-template-columns: 232px minmax(0, 1fr);
    }

    .rail {
        display: none;
    }

    .detail-drawer-backdrop {
        position: fixed;
        inset: 0;
        z-index: 45;
        display: grid;
        justify-items: end;
        background: rgba(4, 12, 24, 0.42);
    }

    .detail-drawer {
        width: min(520px, calc(100vw - 28px));
        height: 100dvh;
        overflow: auto;
    }
}

@media (max-width: 1180px) {
    .topbar {
        grid-template-columns: 1fr;
    }

    .topbar-controls {
        grid-template-columns: minmax(150px, 200px) minmax(240px, 1fr);
    }

    .top-actions {
        grid-column: 1 / -1;
        justify-content: flex-start;
    }

    .panel.split,
    .panel.third {
        grid-column: 1 / -1;
    }

    .state-band,
    .cols-4,
    .overview-home,
    .ops-boundary-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 1360px) {
    .topbar-controls {
        grid-template-columns: minmax(140px, 180px) minmax(260px, 1fr) auto;
    }

    .sync-state {
        display: none;
    }

    .mail-workbench {
        grid-template-columns:
            minmax(180px, var(--mail-facets-width, 200px))
            8px
            minmax(340px, var(--mail-list-width, 500px))
            8px
            minmax(360px, 1fr);
        height: 100%;
        min-height: 0;
        max-width: 100%;
    }

    .mail-list-panel {
        min-height: 0;
    }

    .mail-detail-panel {
        min-height: 0;
    }
}

@media (max-width: 1120px) {
    .mail-workbench {
        grid-template-columns:
            minmax(170px, var(--mail-facets-width, 190px))
            8px
            minmax(320px, var(--mail-list-width, 460px))
            8px
            minmax(320px, 1fr);
        height: 100%;
        min-height: 0;
    }

    .mail-list-panel {
        min-height: 0;
    }

    .mail-detail-panel {
        min-height: 0;
    }
}

@media (max-width: 900px) {
    .mail-workbench {
        grid-template-columns: minmax(0, 1fr);
    }

    .column-resizer {
        display: none;
    }

    .mobile-only {
        display: inline-flex;
    }

    .mail-detail-panel {
        order: 2;
    }

    .mail-list-panel {
        order: 3;
    }

    .mail-facets {
        order: 4;
    }
}

@media (max-width: 900px) {
    :global(html:has(.admin-next)) {
        height: 100dvh;
        min-height: 0;
        overflow: hidden;
    }

    :global(body:has(.admin-next)) {
        height: 100dvh;
        min-height: 0;
        overflow: hidden;
    }

    .app {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-columns: minmax(0, 1fr) !important;
        width: 100%;
        max-width: 100vw;
        height: 100dvh;
        min-height: 0;
        overflow: hidden;
    }

    .admin-next {
        width: 100%;
        max-width: 100vw;
        height: 100dvh;
        min-height: 0;
    }

    .workspace {
        display: grid;
        height: auto;
        min-height: 0;
        overflow: hidden;
    }

    .sidebar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: block;
        padding: 12px;
    }

    .brand {
        margin-bottom: 10px;
    }

    .nav-scroll {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        max-width: 100%;
    }

    .nav-group {
        display: contents;
    }

    .nav-group-title,
    .sidebar-foot {
        display: none;
    }

    .nav-link {
        min-width: 128px;
    }

    .topbar {
        grid-template-columns: 1fr;
        padding: 12px;
    }

    .topbar-controls,
    .mail-facets {
        grid-template-columns: 1fr;
    }

    .topbar-controls > *,
    .toolbar > *,
    .top-actions > * {
        min-width: 0;
    }

    .top-actions {
        justify-content: flex-start;
    }

    .top-actions .btn {
        flex: 1 1 132px;
    }

    .notice {
        gap: 0;
        margin-bottom: 8px;
        padding: 10px 12px;
    }

    .notice span {
        display: none;
    }

    .toolbar {
        flex-wrap: nowrap;
        min-height: 44px;
        margin-bottom: 8px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: thin;
    }

    .toolbar .btn {
        flex: 0 0 auto;
        min-height: 40px;
        white-space: nowrap;
    }

    .toolbar .select {
        flex: 0 0 154px;
        width: auto;
    }

    .ops-boundary-item {
        grid-template-columns: 1fr;
        gap: 4px;
        align-items: start;
        min-height: 54px;
        padding: 8px 10px;
    }

    .ops-boundary-item .status {
        justify-self: start;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .mail-workbench {
        width: 100%;
        max-width: 100%;
        grid-template-columns: minmax(0, 1fr) !important;
        height: 100%;
        min-height: 0;
    }

    .mail-workbench > * {
        grid-column: 1 / -1 !important;
    }

    .mail-facets {
        display: grid;
        grid-template-columns: minmax(0, 1fr) !important;
        overflow: auto;
    }

    .mail-workbench.flow-mode-list .mail-detail-panel,
    .mail-workbench.flow-mode-list .mail-facets {
        display: none;
    }

    .mail-workbench.flow-mode-detail .mail-list-panel,
    .mail-workbench.flow-mode-detail .mail-facets {
        display: none;
    }

    .mail-workbench.flow-mode-filters .mail-list-panel,
    .mail-workbench.flow-mode-filters .mail-detail-panel {
        display: none;
    }

    .facet-card {
        flex: none;
        min-width: 0;
    }

    .facet-note {
        display: none;
    }

    .facet-card + .facet-card {
        display: none;
    }

    .mail-row {
        grid-template-columns: 1fr;
    }

    .mail-meta {
        justify-items: start;
    }

    .view {
        min-height: 0;
        overflow: auto;
        padding: 12px;
    }

    .app.is-flow-view .view {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: 8px;
        overflow: hidden;
    }

    .app.is-flow-view .source-notice,
    .app.is-flow-view .toolbar {
        display: none;
    }

    .app.is-flow-view .mail-workbench {
        min-height: 0;
        height: auto;
    }

    .app.is-flow-view .mail-list-panel,
    .app.is-flow-view .mail-detail-panel,
    .app.is-flow-view .mail-facets {
        min-height: 0;
        height: 100%;
    }

    .app.is-flow-view .mail-list {
        min-height: 0;
        height: auto;
    }

    .app.is-flow-view .detail-pane-body {
        min-height: 0;
    }

    .app.is-flow-view .mail-reader-actions {
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: thin;
    }

    .app.is-flow-view .mail-reader-actions .btn {
        flex: 0 0 auto;
    }

    .detail-drawer-backdrop {
        align-items: end;
        justify-items: stretch;
    }

    .detail-drawer {
        width: 100%;
        height: min(82dvh, 720px);
        border-radius: var(--radius) var(--radius) 0 0;
    }

    .state-band,
    .cols-4,
    .overview-home {
        grid-template-columns: 1fr;
    }

    .form-grid,
    .kv {
        grid-template-columns: 1fr;
    }
}

@media (prefers-reduced-motion: reduce) {
    button,
    .toast {
        transition-duration: 1ms;
    }
}
</style>
