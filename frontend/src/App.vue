<script setup>
import {
  darkTheme,
} from 'naive-ui'
import { computed, onMounted, watchEffect } from 'vue'
import { useScript } from '@unhead/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useGlobalState } from './store'
import { useIsMobile } from './utils/composables'
import Header from './views/Header.vue';
import { api } from './api'
import { getNaiveLocaleConfig } from './i18n/naive-locale'
import { DEFAULT_LOCALE, isSupportedLocale } from './i18n/utils'
import { naiveDarkOverrides, naiveLightOverrides } from './styles/naive-theme'

const {
  isDark, useSideMargin, telegramApp, isTelegram
} = useGlobalState()
const adClient = import.meta.env.VITE_GOOGLE_AD_CLIENT;
const adSlot = import.meta.env.VITE_GOOGLE_AD_SLOT;
const { locale } = useI18n({ useScope: 'global' });
const route = useRoute()
const theme = computed(() => isDark.value ? darkTheme : null)
// Keeps Naive UI's palette in step with src/styles/tokens.css, so embedded
// Naive controls stop rendering in their stock green next to the blue chrome.
const themeOverrides = computed(() => isDark.value ? naiveDarkOverrides : naiveLightOverrides)
const localeConfig = computed(() => getNaiveLocaleConfig(isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE))
const isMobile = useIsMobile()
const isShareOnlyRoute = computed(() => route.meta?.shareOnly === true)
const isFullScreenRoute = computed(() => route.meta?.fullScreen === true)
const showAppChrome = computed(() => !isShareOnlyRoute.value && !isFullScreenRoute.value)
const showAd = computed(() => showAppChrome.value && !isMobile.value && Boolean(adClient) && Boolean(adSlot));
const showSideMargin = computed(() => showAppChrome.value && !isMobile.value && useSideMargin.value && showAd.value);
const gridMaxCols = computed(() => showAd.value ? 8 : 12);

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE
})

// Load Google Ad script at top level (not inside onMounted)
if (showAd.value) {
  useScript({
    src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`,
    async: true,
    crossorigin: "anonymous",
  })
}

onMounted(async () => {
  if (showAppChrome.value) {
    try {
      await api.getUserSettings();
    } catch (error) {
      console.error(error);
    }
  }

  const token = import.meta.env.VITE_CF_WEB_ANALY_TOKEN;

  const exist = document.querySelector('script[src="https://static.cloudflareinsights.com/beacon.min.js"]') !== null
  if (token && !exist) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.dataset.cfBeacon = `{ token: ${token} }`;
    document.body.appendChild(script);
  }

  // check if google ad is enabled
  if (showAd.value) {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }

  // check if telegram is enabled
  const enableTelegram = import.meta.env.VITE_IS_TELEGRAM;
  if (
    (typeof enableTelegram === 'boolean' && enableTelegram === true)
    ||
    (typeof enableTelegram === 'string' && enableTelegram === 'true')
  ) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
    telegramApp.value = window.Telegram?.WebApp || {};
    isTelegram.value = !!window.Telegram?.WebApp?.initData;
  }
});
</script>

<template>
  <n-config-provider :locale="localeConfig.locale" :date-locale="localeConfig.dateLocale" :theme="theme"
    :theme-overrides="themeOverrides">
    <n-global-style />
    <n-notification-provider container-style="margin-top: 60px;">
      <n-message-provider container-style="margin-top: 20px;">
        <div class="app-root" :class="{ 'app-root-fullscreen': isFullScreenRoute }">
          <Header v-if="showAppChrome" />
          <div class="app-body">
            <n-grid v-if="showSideMargin" x-gap="12" :cols="gridMaxCols" class="app-grid">
              <n-gi span="1">
                <div class="side" v-if="showAd">
                  <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                    data-ad-format="auto" data-full-width-responsive="true"></ins>
                </div>
              </n-gi>
              <n-gi :span="gridMaxCols - 2">
                <main class="main" :class="{ 'main-fullscreen': isFullScreenRoute }">
                  <router-view></router-view>
                </main>
              </n-gi>
              <n-gi span="1">
                <div class="side" v-if="showAd">
                  <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                    data-ad-format="auto" data-full-width-responsive="true"></ins>
                </div>
              </n-gi>
            </n-grid>
            <main v-else class="main" :class="{ 'main-fullscreen': isFullScreenRoute }">
              <router-view></router-view>
            </main>
          </div>
        </div>
        <n-back-top />
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>

<style>
:root {
  --ets-ui-font: "Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif;
}

html,
body,
#app {
  font-family: var(--ets-ui-font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--ets-bg);
  color: var(--ets-text);
  min-height: 100vh;
  margin: 0;
  padding: 0;
}

:where(button, a, input, textarea, select, [tabindex]):focus-visible {
  outline: 2px solid var(--ets-focus-ring);
  outline-offset: 2px;
}

.n-switch {
  margin-left: 10px;
  margin-right: 10px;
}
</style>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ets-bg);
  color: var(--ets-text);
  width: 100%;
}

.app-body {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
}

.app-grid {
  width: 100%;
  min-height: calc(100vh - 60px);
}

.side {
  min-height: 100vh;
}

.main {
  width: 100%;
  min-height: calc(100vh - 60px);
  text-align: center;
  box-sizing: border-box;
}

.main-fullscreen {
  text-align: left;
  min-height: 100vh;
}
</style>
