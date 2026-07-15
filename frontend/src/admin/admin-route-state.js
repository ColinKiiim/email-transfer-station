import { watch } from 'vue'

import { queryValue } from './admin-formatters'
import {
    ACCESS_STATUS_OPTIONS,
    FLOW_STATUS_OPTIONS,
    VIEW_META,
} from './admin-view-config'

const VIEW_STORAGE_KEY = 'ets-admin-next-view'

export const statusOptionsForView = (view) => {
    if (view === 'flow') return FLOW_STATUS_OPTIONS
    if (view === 'access') return ACCESS_STATUS_OPTIONS
    return ['all']
}

export const createInitialAdminRouteState = (query = {}, storage) => {
    const queryView = queryValue(query.view)
    const storedView = storage?.getItem?.(VIEW_STORAGE_KEY) || ''
    return {
        view: VIEW_META[queryView] ? queryView : (VIEW_META[storedView] ? storedView : 'overview'),
        query: queryValue(query.q),
        domain: queryValue(query.domain, 'all'),
        address: queryValue(query.address, 'all'),
        status: queryValue(query.status, 'all'),
        flowMode: queryValue(query.mode, 'list'),
        detailKind: '',
        selected: {
            flow: queryValue(query.mailId || query.item),
            exception: '',
        },
    }
}

export const buildAdminRouteQuery = (current = {}, patch = {}, remove = []) => {
    const query = { ...current, ...patch }
    remove.forEach((key) => delete query[key])
    Object.keys(query).forEach((key) => {
        if (query[key] === '' || query[key] == null || query[key] === 'all') delete query[key]
    })
    return query
}

export const useAdminRouteState = ({ route, router, ui, detailOpen, storage }) => {
    const replaceRouteQuery = (patch = {}, remove = []) => router.replace({
        path: route.path,
        query: buildAdminRouteQuery(route.query, patch, remove),
        hash: route.hash,
    }).catch(() => {})

    const persistView = (view) => {
        storage?.setItem?.(VIEW_STORAGE_KEY, view)
    }

    const applyView = (view) => {
        if (!VIEW_META[view]) return false
        ui.view = view
        ui.detailKind = ''
        detailOpen.value = false
        const options = statusOptionsForView(view)
        if (!options.includes(ui.status)) ui.status = 'all'
        return true
    }

    const setView = async (view) => {
        if (!applyView(view)) return
        persistView(view)
        await replaceRouteQuery({
            view,
            status: ui.status === 'all' ? undefined : ui.status,
        }, view === 'flow' ? [] : ['mailId', 'item', 'mode'])
    }

    const syncMailQueryToRoute = (extra = {}) => replaceRouteQuery({
        view: 'flow',
        q: ui.query || undefined,
        domain: ui.domain === 'all' ? undefined : ui.domain,
        address: ui.address === 'all' ? undefined : ui.address,
        status: ui.status === 'all' ? undefined : ui.status,
        mailId: ui.selected.flow || undefined,
        mode: ui.flowMode === 'list' ? undefined : ui.flowMode,
        ...extra,
    }, ['item'])

    const syncSelectionFromRoute = () => {
        const mailId = queryValue(route.query.mailId)
        if (mailId) {
            ui.selected.flow = mailId
            ui.detailKind = 'flow'
            ui.flowMode = queryValue(route.query.mode, 'detail')
            return
        }
        const item = queryValue(route.query.item)
        if (item.startsWith('unknown-')) {
            ui.selected.exception = item
            ui.detailKind = 'exception'
        } else if (item.startsWith('mail-')) {
            ui.selected.flow = item
            ui.detailKind = 'flow'
        }
    }

    watch(() => route.query.view, (value) => {
        const nextView = queryValue(value)
        if (nextView !== ui.view) applyView(nextView)
    })
    watch(() => route.query.q, (value) => { ui.query = queryValue(value) })
    watch(() => route.query.domain, (value) => { ui.domain = queryValue(value, 'all') })
    watch(() => route.query.address, (value) => { ui.address = queryValue(value, 'all') })
    watch(() => route.query.status, (value) => {
        const nextStatus = queryValue(value, 'all')
        const options = statusOptionsForView(ui.view)
        ui.status = options.includes(nextStatus) ? nextStatus : 'all'
    })
    watch(() => route.query.mode, (value) => { ui.flowMode = queryValue(value, 'list') })
    watch(() => [route.query.mailId, route.query.item], syncSelectionFromRoute, { immediate: true })
    watch(() => route.query.demo, (value) => {
        if (value !== undefined) replaceRouteQuery({}, ['demo'])
    }, { immediate: true })

    return {
        persistView,
        replaceRouteQuery,
        setView,
        syncMailQueryToRoute,
        syncSelectionFromRoute,
    }
}
