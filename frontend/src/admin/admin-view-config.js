export const ADMIN_MAIL_PAGE_LIMIT = 100
export const ADMIN_MAIL_FETCH_MAX = 500
export const FLOW_STATUS_OPTIONS = ['all', '未读', '已读', 'attachment', '已保存', '未知地址']
export const ACCESS_STATUS_OPTIONS = ['all', 'active', 'success']
export const SIDEBAR_COLLAPSED_KEY = 'ets-admin-next-sidebar-collapsed'

export const VIEW_META = {
    overview: { title: '运行总控', kicker: 'receiving operations' },
    flow: { title: '收件流', kicker: 'mail intake and rendering' },
    identity: { title: '地址身份', kicker: 'address ledger and credentials' },
    routing: { title: '域名与路由', kicker: 'domains and ingress routes' },
    delivery: { title: '出站与通知', kicker: 'send access and notifications' },
    access: { title: '访问治理', kicker: 'share packages and audit' },
    ops: { title: '运行维护', kicker: 'worker, d1, kv and policies' },
    roadmap: { title: '能力路线', kicker: 'planned product capabilities' },
}

export const NAV_GROUPS = [
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

export const ICON_SHAPES = {
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
    menu: [{ tag: 'path', attrs: { d: 'M4 7h16M4 12h16M4 17h16' } }],
    collapse: [{ tag: 'path', attrs: { d: 'M4 5h16v14H4z' } }, { tag: 'path', attrs: { d: 'M9 5v14M15 9l-3 3 3 3' } }],
    expand: [{ tag: 'path', attrs: { d: 'M4 5h16v14H4z' } }, { tag: 'path', attrs: { d: 'M9 5v14M12 9l3 3-3 3' } }],
    search: [{ tag: 'path', attrs: { d: 'm21 21-4.2-4.2' } }, { tag: 'circle', attrs: { cx: '11', cy: '11', r: '7' } }],
    refresh: [{ tag: 'path', attrs: { d: 'M20 12a8 8 0 1 1-2.3-5.7' } }, { tag: 'path', attrs: { d: 'M20 4v6h-6' } }],
    plus: [{ tag: 'path', attrs: { d: 'M12 5v14M5 12h14' } }],
    copy: [{ tag: 'path', attrs: { d: 'M8 8h11v11H8z' } }, { tag: 'path', attrs: { d: 'M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1' } }],
    lock: [{ tag: 'rect', attrs: { x: '5', y: '10', width: '14', height: '10', rx: '2' } }, { tag: 'path', attrs: { d: 'M8 10V7a4 4 0 0 1 8 0v3' } }],
    check: [{ tag: 'path', attrs: { d: 'm5 12 4 4L19 6' } }],
}

export const ROADMAP_ROWS = [
    { id: 'road-renderer', capability: '统一安全渲染层', status: '必须保留', maps: 'MailContentRenderer / ShadowHtmlComponent / SendMail HTML 预览', next: '收敛邮件正文入口，所有 HTML sink 强制走隔离渲染策略' },
    { id: 'road-gate', capability: '入站副作用门禁', status: '必须保留', maps: 'email/index.ts / forward.ts / mail webhook', next: '保存成功后再触发转发、Webhook、自动回复' },
    { id: 'road-mobile', capability: '移动端后台壳', status: '预留', maps: '现有响应式导航 / MailBox mobile drawer', next: '桌面信息架构稳定后拆成底部导航 + 抽屉详情' },
    { id: 'road-rbac', capability: '访问评审与 JIT 操作', status: '规划中', maps: 'AccessPackages / AuditLogs / RoleAddressConfig', next: '高风险操作先请求授权，再写审计事件' },
    { id: 'road-send', capability: '出站提供商决策', status: '待决策', maps: 'SendMail / SendBox / SenderAccess', next: '确定 Resend、SMTP 或 Cloudflare Send Email 后再固化表单' },
    { id: 'road-loading', capability: '局部请求状态', status: '必须保留', maps: 'api/index.js global loading / MailBox refresh', next: '每个模块维护自己的 pending key，刷新保留选中邮件' },
]

export const STATIC_RISKS = [
    { id: 'risk-html', level: 'P1', title: 'HTML 渲染策略', owner: '邮件阅读器', status: '隔离中', detail: '所有邮件正文入口应走隔离容器、附件链接策略和文本回退，不把原始源码作为默认阅读内容。' },
    { id: 'risk-side-effect', level: 'P1', title: '入站保存失败后的副作用门禁', owner: 'Email ingress', status: '设计中', detail: '转发、Webhook、自动回复必须在保存成功后进入副作用队列。' },
    { id: 'risk-loading', level: 'P2', title: '全局 loading 竞争', owner: 'Frontend state', status: '待拆分', detail: '全局 loading 仅保留路由启动，邮件刷新、多删、域名验证使用局部状态。' },
    { id: 'risk-token', level: 'P1', title: '凭证与 token 存储模型', owner: 'Security model', status: '需决策', detail: '固定地址凭证、分享 token、管理员登录 token 需要产品级会话边界。' },
]

export const TABLE_SPECS = {
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
        { label: '能力', key: 'capability', type: 'strong' },
        { label: '状态', key: 'status', type: 'status' },
        { label: '下一步', key: 'next' },
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
        { label: '操作', key: 'actions', type: 'domainActions' },
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
}
