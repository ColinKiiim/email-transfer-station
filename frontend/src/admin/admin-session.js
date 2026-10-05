import { computed, ref, watch } from 'vue'

import { adminT } from './admin-i18n'

const t = adminT('admin.session')

export const useAdminSession = ({
    client,
    adminAuth,
    showAdminAuth,
    showAdminPage,
    openSettings,
    hashPassword,
    hasAdminData,
    clearAdminData,
    refreshAdminData,
    notify,
}) => {
    const tmpAdminAccount = ref('admin')
    const tmpAdminAuth = ref('')
    const cfToken = ref('')
    const turnstileRef = ref(null)
    const loginSettingsFetched = ref(false)
    const restoringAdminSession = ref(!adminAuth.value)
    let initializingAdminSession = true
    const needsAdminLogin = computed(() => !restoringAdminSession.value && (!showAdminPage.value || showAdminAuth.value))

    const fetchAdminLoginSettings = async () => {
        if (loginSettingsFetched.value) return
        try {
            const result = await client.getLoginSettings()
            openSettings.value.enableGlobalTurnstileCheck = !!result.enableGlobalTurnstileCheck
            openSettings.value.cfTurnstileSiteKey = result.cfTurnstileSiteKey || ''
            if (result.accountHint && !tmpAdminAccount.value) tmpAdminAccount.value = result.accountHint
        } catch {
            openSettings.value.enableGlobalTurnstileCheck = false
            openSettings.value.cfTurnstileSiteKey = ''
        } finally {
            loginSettingsFetched.value = true
        }
    }

    const resetAdminLogin = async () => {
        try {
            await client.logout()
            adminAuth.value = ''
            showAdminAuth.value = true
            clearAdminData()
        } catch (error) {
            notify(error?.message || t('failed'), 'error')
        }
    }

    const authFunc = async () => {
        try {
            const result = await client.login({
                username: tmpAdminAccount.value.trim(),
                passwordHash: await hashPassword(tmpAdminAuth.value),
                cfToken: cfToken.value,
            })
            if (!result?.token) throw new Error(t('noToken'))
            adminAuth.value = result.token
            showAdminAuth.value = false
            await refreshAdminData()
            notify(t('established'), 'success')
        } catch (error) {
            notify(error?.message || t('failed'), 'error')
            turnstileRef.value?.refresh?.()
        } finally {
            tmpAdminAuth.value = ''
        }
    }

    const initializeAdminSession = async () => {
        const loginSettings = fetchAdminLoginSettings()
        try {
            try {
                if (!adminAuth.value) {
                    const result = await client.restoreSession()
                    if (!result?.token) throw new Error(t('noToken'))
                    adminAuth.value = result.token
                    showAdminAuth.value = false
                }
            } catch (error) {
                if (error.status !== 401) notify(error?.message || t('failed'), 'error')
            }
            restoringAdminSession.value = false
            const tasks = [loginSettings]
            if (showAdminPage.value && !showAdminAuth.value) tasks.push(refreshAdminData())
            await Promise.all(tasks)
        } finally {
            restoringAdminSession.value = false
            initializingAdminSession = false
        }
    }

    watch(showAdminPage, async (allowed) => {
        if (allowed && !initializingAdminSession && !hasAdminData()) await refreshAdminData()
    })

    watch(showAdminAuth, (value) => {
        if (value) clearAdminData()
    })

    return {
        authFunc,
        cfToken,
        fetchAdminLoginSettings,
        initializeAdminSession,
        needsAdminLogin,
        resetAdminLogin,
        restoringAdminSession,
        tmpAdminAccount,
        tmpAdminAuth,
        turnstileRef,
    }
}
