// Stable ASCII keys: these are filter values and appear in the URL query, so
// they must not change when the UI is translated. Display labels live in
// AdminNext's activeStatusOptions.
export const FLOW_STATUS_OPTIONS = ['all', 'unread', 'read', 'attachment', 'saved', 'unknown']
export const ACCESS_STATUS_OPTIONS = ['all', 'active', 'success']
export const SIDEBAR_COLLAPSED_KEY = 'ets-admin-next-sidebar-collapsed'

/*
 * View titles are translated at render time from `admin.nav.<view id>`; only the
 * non-user-facing kicker stays inline. Storing the display string here would put
 * it outside the message catalogue and back into the code.
 */
export const VIEW_META = {
    overview: { kicker: 'receiving operations' },
    flow: { kicker: 'mail intake and rendering' },
    identity: { kicker: 'address ledger and credentials' },
    routing: { kicker: 'domains and ingress routes' },
    delivery: { kicker: 'send access and notifications' },
    access: { kicker: 'share packages and audit' },
    ops: { kicker: 'worker, d1, kv and policies' },
}

/** `labelKey` and each item's `id` resolve against the `admin.nav` namespace. */
export const NAV_GROUPS = [
    {
        labelKey: 'groupWorkbench',
        items: [
            { id: 'overview', badgeKey: 'overview', icon: 'overview' },
            { id: 'flow', badgeKey: 'mails', icon: 'flow' },
        ],
    },
    {
        labelKey: 'groupResource',
        items: [
            { id: 'identity', badgeKey: 'addresses', icon: 'identity' },
            { id: 'routing', badgeKey: 'domains', icon: 'routing' },
            { id: 'delivery', badgeKey: 'delivery', icon: 'delivery' },
        ],
    },
    {
        labelKey: 'groupGovernance',
        items: [
            { id: 'access', badgeKey: 'access', icon: 'access' },
            { id: 'ops', badgeKey: 'ops', icon: 'ops' },
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

export const TABLE_SPECS = {
    domains: [
        { labelKey: 'domain', type: 'entity', main: 'domain', sub: 'label' },
        { labelKey: 'receiveMode', key: 'mode' },
        { labelKey: 'address', key: 'addresses', type: 'number' },
        { labelKey: 'mails', key: 'mails', type: 'number' },
        { labelKey: 'setup', key: 'setup', type: 'status' },
        { labelKey: 'auth', key: 'auth' },
    ],
    mails: [
        { labelKey: 'receivedAt', key: 'time', type: 'time' },
        { labelKey: 'sender', key: 'sender' },
        { labelKey: 'recipient', key: 'to' },
        { labelKey: 'subject', type: 'entity', main: 'subject', sub: 'risk' },
        { labelKey: 'attachments', key: 'attachmentCount', type: 'number' },
        { labelKey: 'result', key: 'result', type: 'status' },
        { labelKey: 'authRaw', key: 'auth' },
        { labelKey: 'ipSource', key: 'ip', type: 'mono' },
    ],
    mailSummary: [
        { labelKey: 'receivedAt', key: 'time', type: 'time' },
        { labelKey: 'sender', type: 'entity', main: 'sender', sub: 'to' },
        { labelKey: 'subject', type: 'entity', main: 'subject', sub: 'risk' },
        { labelKey: 'attachments', key: 'attachmentCount', type: 'number' },
        { labelKey: 'result', key: 'result', type: 'status' },
    ],
    logs: [
        { labelKey: 'time', key: 'time', type: 'time' },
        { labelKey: 'event', key: 'event', type: 'strong' },
        { labelKey: 'detail', key: 'detail' },
        { labelKey: 'domain', key: 'domain' },
        { labelKey: 'addressActor', key: 'inbox' },
        { labelKey: 'durationStatus', key: 'duration', type: 'mono' },
    ],
    risks: [
        { labelKey: 'level', key: 'level', type: 'mono' },
        { labelKey: 'issue', type: 'entity', main: 'title', sub: 'detail' },
        { labelKey: 'owner', key: 'owner' },
        { labelKey: 'status', key: 'status', type: 'status' },
    ],
    addresses: [
        { labelKey: 'address', type: 'entity', main: 'address', sub: 'note', tags: 'tags' },
        { labelKey: 'ownership', key: 'owner' },
        { labelKey: 'source', key: 'source' },
        { labelKey: 'received', key: 'mails', type: 'number' },
        { labelKey: 'sent', key: 'sent', type: 'number' },
        { labelKey: 'packages', key: 'packages', type: 'number' },
        { labelKey: 'password', key: 'password', type: 'status' },
        { labelKey: 'credential', key: 'credential', type: 'status' },
    ],
    users: [
        { labelKey: 'user', key: 'user', type: 'strong' },
        { labelKey: 'role', key: 'role' },
        { labelKey: 'addressScope', key: 'addresses' },
        { labelKey: 'signIn', key: 'auth' },
        { labelKey: 'status', key: 'status', type: 'status' },
    ],
    routing: [
        { labelKey: 'domain', type: 'entity', main: 'domain', sub: 'label' },
        { labelKey: 'receiveMode', key: 'mode' },
        { labelKey: 'setup', key: 'setup', type: 'status' },
        { labelKey: 'enabled', key: 'enabled', type: 'status' },
        { labelKey: 'addressCreation', key: 'creation' },
        { labelKey: 'default', key: 'default' },
        { labelKey: 'collectorRule', key: 'collector', type: 'mono' },
        { labelKey: 'lastVerified', key: 'updated', type: 'time' },
        { labelKey: 'actions', key: 'actions', type: 'domainActions' },
    ],
    destinations: [
        { labelKey: 'destination', type: 'entity', main: 'destination', sub: 'next' },
        { labelKey: 'domain', key: 'domain' },
        { labelKey: 'type', key: 'type' },
        { labelKey: 'inUse', key: 'inUse', type: 'number' },
        { labelKey: 'status', key: 'status', type: 'status' },
    ],
    notifications: [
        { labelKey: 'channel', type: 'entity', main: 'channel', sub: 'detail' },
        { labelKey: 'target', key: 'target', type: 'mono' },
        { labelKey: 'type', key: 'type' },
        { labelKey: 'status', key: 'status', type: 'status' },
    ],
    sender: [
        { labelKey: 'address', key: 'address' },
        { labelKey: 'balance', key: 'balance', type: 'number' },
        { labelKey: 'status', key: 'status', type: 'status' },
        { labelKey: 'createdAt', key: 'created', type: 'time' },
        { labelKey: 'note', key: 'note' },
    ],
    shares: [
        { labelKey: 'label', type: 'entity', main: 'label', sub: 'path' },
        { labelKey: 'address', key: 'address' },
        { labelKey: 'scopes', key: 'scopes' },
        { labelKey: 'status', key: 'status', type: 'status' },
        { labelKey: 'expires', key: 'expires', type: 'time' },
        { labelKey: 'lastUsed', key: 'last', type: 'time' },
    ],
    audit: [
        { labelKey: 'time', key: 'time', type: 'time' },
        { labelKey: 'actorRaw', key: 'actor' },
        { labelKey: 'actionRaw', key: 'action' },
        { labelKey: 'resourceRaw', key: 'resource' },
        { labelKey: 'statusRaw', key: 'status', type: 'status' },
        { labelKey: 'ipRaw', key: 'ip', type: 'mono' },
    ],
    ops: [
        { labelKey: 'item', type: 'entity', main: 'name', sub: 'detail' },
        { labelKey: 'status', key: 'status', type: 'status' },
        { labelKey: 'action', key: 'action' },
    ],
}
