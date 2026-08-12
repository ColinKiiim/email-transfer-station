/**
 * Credential teardown shared by every sign-out entry point.
 *
 * Each surface used to clear only the credential it knew about — `/user`
 * cleared `userJwt` and nothing else — so on a shared browser the next person
 * could still read the previous user's mailbox through the address JWT that
 * survived in localStorage.
 *
 * The split below is the point of this module: credentials and per-account
 * content are cleared, device preferences (theme, language, date format) are
 * not, because wiping those makes signing out feel like a factory reset.
 */

/** Keys that grant access, or hold one account's content. Always cleared. */
export const CREDENTIAL_STORAGE_KEYS = Object.freeze({
    local: [
        'jwt',            // address bearer credential
        'userJwt',        // user session
        'LocalAddressCache', // saved address bearer credentials
        'auth',           // site-wide password
        'announcement',   // per-instance content the next account should re-see
    ],
    session: [
        'adminAuth',        // admin session
        'addressPassword',  // address password held for the tab
        'sendMailModel',    // compose draft: recipient, subject, body
        'userTab',
        'indexTab',
    ],
})

/** Preferences that describe the device, not the account. Deliberately kept. */
export const PRESERVED_STORAGE_KEYS = Object.freeze([
    'vueuse-color-scheme',
    'preferredLocale',
    'useUTCDate',
    'useSideMargin',
    'useSimpleIndex',
    'globalTabplacement',
    'mailboxSplitSize',
    'useIframeShowMail',
    'preferShowTextMail',
    'autoRefresh',
    'configAutoRefreshInterval',
])

const removeAll = (storage, keys) => {
    if (!storage) return
    for (const key of keys) {
        try {
            storage.removeItem(key)
        } catch {
            // A storage quota or privacy-mode error must not abort the rest of
            // the teardown — a partially cleared session is the failure we are
            // trying to avoid.
        }
    }
}

/**
 * Clear every credential and per-account value from browser storage.
 *
 * Call this before navigating or reloading, from any surface's sign-out.
 */
export const clearSessionStorageKeys = ({
    local = typeof localStorage === 'undefined' ? null : localStorage,
    session = typeof sessionStorage === 'undefined' ? null : sessionStorage,
} = {}) => {
    removeAll(local, CREDENTIAL_STORAGE_KEYS.local)
    removeAll(session, CREDENTIAL_STORAGE_KEYS.session)
}
