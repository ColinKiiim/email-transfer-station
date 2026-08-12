<script setup>
import { ref, watch } from "vue";
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { getTurnstileLocale } from '../i18n/locale-registry'
import { DEFAULT_LOCALE, isSupportedLocale } from '../i18n/utils'
const { openSettings, isDark } = useGlobalState()

const cfToken = defineModel('value')

const { locale, t } = useScopedI18n('components.Turnstile')

const containerId = `cf-turnstile-${Math.random().toString(36).slice(2, 9)}`
const cfTurnstileId = ref("")
const turnstileLoading = ref(false)
let turnstileRenderQueue = Promise.resolve()

const refresh = () => rerenderTurnstile()
// `reset` is an alias so callers cannot miss by name. The admin login path
// used to call `refresh` on a wrapper that only exposed `reset`, and the
// wrapper called `reset` on this component, which only exposed `refresh` —
// two optional calls that silently did nothing.
defineExpose({ refresh, reset: refresh })

const rerenderTurnstile = () => {
    cfToken.value = "";
    turnstileRenderQueue = turnstileRenderQueue
        .catch(() => { })
        .then(() => checkCfTurnstile(true))
    turnstileRenderQueue.catch(() => { })
    return turnstileRenderQueue
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/*
 * Load Cloudflare's script only when an instance actually enables Turnstile.
 *
 * It used to sit in index.html as a synchronous, non-deferred <script> in
 * <head>, so it blocked HTML parsing and the module entry on every route — and
 * every visitor's browser contacted challenges.cloudflare.com even on
 * deployments that never turn Turnstile on, including anonymous share links.
 */
const ensureTurnstileScript = () => {
    if (typeof document === 'undefined') return
    if (window.turnstile || document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) return
    const script = document.createElement('script')
    script.src = TURNSTILE_SRC
    script.async = true
    script.defer = true
    document.head.appendChild(script)
}

const checkCfTurnstile = async (remove) => {
    if (!openSettings.value.cfTurnstileSiteKey) return;
    ensureTurnstileScript();
    turnstileLoading.value = true;
    try {
        let container = document.getElementById(containerId);
        let count = 100;
        while (!container && count-- > 0) {
            container = document.getElementById(containerId);
            await new Promise(r => setTimeout(r, 10));
        }
        // The script is now fetched on demand rather than blocking <head>, so
        // allow a network round trip (10s) instead of the previous 1s, and fail
        // loudly rather than throwing an opaque TypeError on window.turnstile.
        count = 1000;
        while (!window.turnstile && count-- > 0) {
            await new Promise(r => setTimeout(r, 10));
        }
        if (!window.turnstile) {
            console.error('Turnstile script did not load; the challenge cannot be rendered');
            return;
        }
        if (remove && cfTurnstileId.value) {
            window.turnstile.remove(cfTurnstileId.value);
        }
        // Cloudflare documents sitekey/theme/language as render-time options and
        // exposes remove()/render() for widget lifecycle updates, so recreate the
        // widget when any of those inputs change:
        // https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
        cfTurnstileId.value = window.turnstile.render(
            `#${containerId}`,
            {
                sitekey: openSettings.value.cfTurnstileSiteKey,
                language: getTurnstileLocale(isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE),
                theme: isDark.value ? 'dark' : 'light',
                callback: function (token) {
                    cfToken.value = token;
                },
            }
        );
    } finally {
        turnstileLoading.value = false;
    }
}

watch([isDark, locale, () => openSettings.value.cfTurnstileSiteKey], rerenderTurnstile, { immediate: true })
</script>

<template>
    <div v-if="openSettings.cfTurnstileSiteKey" class="center">
        <n-spin description="loading..." :show="turnstileLoading">
            <n-form-item-row>
                <n-flex vertical>
                    <div :id="containerId"></div>
                    <n-button text @click="rerenderTurnstile">
                        {{ t('refresh') }}
                    </n-button>
                </n-flex>
            </n-form-item-row>
        </n-spin>

    </div>
</template>

<style scoped>
.center {
    display: flex;
}

.n-button {
    margin-left: 10px;
}
</style>
