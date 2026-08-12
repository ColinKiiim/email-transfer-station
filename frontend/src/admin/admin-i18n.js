import i18n from '../i18n'

/**
 * Translation helper for the admin console's plain-JS modules.
 *
 * The view-model builders and action controllers under `src/admin/` are not
 * components, so they cannot call `useScopedI18n()` — there is no setup context
 * to bind to. They reach the same message catalogue through the app-level i18n
 * instance instead, which is created at module load in `src/i18n/index.ts` and
 * therefore works in unit tests without `app.use(i18n)`.
 *
 * Usage mirrors `useScopedI18n`:
 *
 *   const t = adminT('admin.console')
 *   t('refresh')                      // -> admin.console.refresh
 *   t('deleted', { count: 3 })        // interpolation is passed straight through
 */
export const adminT = (namespace) => (key, ...args) =>
    i18n.global.t(`${namespace}.${key}`, ...args)

/** Current admin locale, for the few places that need Intl formatting. */
export const adminLocale = () => i18n.global.locale.value
