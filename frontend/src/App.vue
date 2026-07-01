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

const {
  isDark, loading, useSideMargin, telegramApp, isTelegram
} = useGlobalState()
const adClient = import.meta.env.VITE_GOOGLE_AD_CLIENT;
const adSlot = import.meta.env.VITE_GOOGLE_AD_SLOT;
const { locale } = useI18n({ useScope: 'global' });
const route = useRoute()
const isAdminShellPath = computed(() => {
  if (route.path?.includes('/console') || route.path?.includes('/admin')) return true
  if (typeof window === 'undefined') return false
  return window.location.pathname.includes('/console') || window.location.pathname.includes('/admin')
})
const theme = computed(() => isDark.value ? darkTheme : null)
const localeConfig = computed(() => getNaiveLocaleConfig(isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE))
const isMobile = useIsMobile()
const isShareOnlyRoute = computed(() => route.meta?.shareOnly === true)
const isFullScreenRoute = computed(() => route.meta?.fullScreen === true || isAdminShellPath.value)
const showAppChrome = computed(() => !isShareOnlyRoute.value && !isFullScreenRoute.value)
const showSideMargin = computed(() => showAppChrome.value && !isMobile.value && useSideMargin.value);
const showAd = computed(() => showAppChrome.value && !isMobile.value && adClient && adSlot);
const gridMaxCols = computed(() => showAd.value ? 8 : 12);
const showGlobalLoading = computed(() => loading.value && !isFullScreenRoute.value);

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
  <n-config-provider :locale="localeConfig.locale" :date-locale="localeConfig.dateLocale" :theme="theme">
    <n-global-style />
    <n-spin description="loading..." :show="showGlobalLoading">
      <n-notification-provider container-style="margin-top: 60px;">
        <n-message-provider container-style="margin-top: 20px;">
          <n-grid x-gap="12" :cols="gridMaxCols">
            <n-gi v-if="showSideMargin" span="1">
              <div class="side" v-if="showAd">
                <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                  data-ad-format="auto" data-full-width-responsive="true"></ins>
              </div>
            </n-gi>
            <n-gi :span="!showSideMargin ? gridMaxCols : (gridMaxCols - 2)">
              <div class="main" :class="{ 'main-fullscreen': isFullScreenRoute }">
                <n-space vertical>
                  <n-layout style="min-height: 80vh;">
                    <Header v-if="showAppChrome" />
                    <router-view></router-view>
                  </n-layout>
                </n-space>
              </div>
            </n-gi>
            <n-gi v-if="showSideMargin" span="1">
              <div class="side" v-if="showAd">
                <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                  data-ad-format="auto" data-full-width-responsive="true"></ins>
              </div>
            </n-gi>
          </n-grid>
          <n-back-top />
        </n-message-provider>
      </n-notification-provider>
    </n-spin>
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
}

.n-switch {
  margin-left: 10px;
  margin-right: 10px;
}
</style>

<style scoped>
.side {
  height: 100vh;
}

.main {
  height: 100vh;
  text-align: center;
}

.main-fullscreen {
  text-align: left;
}

.n-grid {
  height: 100%;
}

.n-gi {
  height: 100%;
}

.n-space {
  height: 100%;
}
</style>
