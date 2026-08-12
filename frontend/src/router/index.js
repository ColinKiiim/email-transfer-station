import { createRouter, createWebHistory } from 'vue-router'
import Index from '../views/Index.vue'
import User from '../views/User.vue'
import UserOauth2Callback from '../views/user/UserOauth2Callback.vue'
import i18n from '../i18n'
import { useGlobalState } from '../store'
import {
    getBrowserLocales,
    getLocaleRedirect,
    getPreferredLocale,
    getStoredLocale,
    resolveSupportedLocale,
} from '../i18n/utils'

const { jwt, preferredLocale } = useGlobalState()

function getRouteSection(path) {
    const segments = path.split('/').filter(Boolean)
    const first = segments[0]
    return resolveSupportedLocale(first) ? segments[1] : first
}

function isAdminSurfacePath(path) {
    return getRouteSection(path) === 'admin'
}

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            alias: '/:lang/',
            component: Index
        },
        {
            path: '/user',
            alias: '/:lang/user',
            component: User,
            meta: { fullScreen: true }
        },
        {
            path: '/user/oauth2/callback',
            alias: '/:lang/user/oauth2/callback',
            component: UserOauth2Callback
        },
        {
            path: '/admin',
            alias: '/:lang/admin',
            meta: { fullScreen: true },
            component: () => import('../views/AdminNext.vue')
        },
        {
            path: '/i/:token',
            alias: '/:lang/i/:token',
            component: () => import('../views/TokenInbox.vue'),
            meta: {
                shareOnly: true,
                fullScreen: true
            }
        },
        {
            path: '/telegram_mail',
            alias: '/:lang/telegram_mail',
            component: () => import('../views/telegram/Mail.vue')
        },
        {
            name: 'not-found',
            path: '/:pathMatch(.*)*',
            redirect: '/'
        }
    ]
});

router.beforeEach((to, from, next) => {
    const routeLocale = resolveSupportedLocale(to.path.split('/')[1])
    const resolvedLocale = routeLocale || getPreferredLocale(
        preferredLocale.value || getStoredLocale(),
        getBrowserLocales(),
    )
    i18n.global.locale.value = resolvedLocale

    if (routeLocale) {
        preferredLocale.value = routeLocale
    } else if (!preferredLocale.value) {
        preferredLocale.value = resolvedLocale
    }

    if (Object.prototype.hasOwnProperty.call(to.query, 'jwt')) {
        const jwtQuery = Array.isArray(to.query.jwt) ? to.query.jwt[0] : to.query.jwt
        if (typeof jwtQuery === 'string' && !isAdminSurfacePath(to.path)) {
            jwt.value = jwtQuery
        }
        const query = { ...to.query }
        delete query.jwt
        next({
            path: to.path,
            query,
            hash: to.hash,
            replace: true,
        })
        return
    }

    const localeRedirect = getLocaleRedirect(to.fullPath, routeLocale, resolvedLocale)
    return localeRedirect ? next(localeRedirect) : next()
});

export default router
