import { computed, ref, watch } from 'vue'

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
    const needsAdminLogin = computed(() => !showAdminPage.value || showAdminAuth.value)

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

    const resetAdminLogin = () => {
        adminAuth.value = ''
        clearAdminData()
    }

    const authFunc = async () => {
        try {
            const result = await client.login({
                username: tmpAdminAccount.value.trim(),
                passwordHash: await hashPassword(tmpAdminAuth.value),
                cfToken: cfToken.value,
            })
            adminAuth.value = result.token || tmpAdminAuth.value
            showAdminAuth.value = false
            tmpAdminAuth.value = ''
            await refreshAdminData()
            notify('管理员会话已建立', 'success')
        } catch (error) {
            notify(error?.message || '管理员登录失败', 'error')
            turnstileRef.value?.refresh?.()
        }
    }

    const initializeAdminSession = async () => {
        const tasks = [fetchAdminLoginSettings()]
        if (showAdminPage.value && !showAdminAuth.value) tasks.push(refreshAdminData())
        await Promise.all(tasks)
    }

    watch(showAdminPage, async (allowed) => {
        if (allowed && !hasAdminData()) await refreshAdminData()
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
        tmpAdminAccount,
        tmpAdminAuth,
        turnstileRef,
    }
}
