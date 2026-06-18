import { defineConfig } from 'vitepress'
import { zh } from './zh'
import { en } from './en'

export default defineConfig({
  title: "Email Transfer Station Docs",
  description: 'Email Transfer Station documentation draft',
  lang: 'zh-CN',
  lastUpdated: true,
  locales: {
    zh: { label: '简体中文', ...zh },
    en: { label: 'English', ...en }
  },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#5f67ee' }],
    ['meta', { name: 'robots', content: 'index, follow' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'zh_CN' }],
    ['meta', { property: 'og:locale:alternate', content: 'en_US' }],
    ['meta', { property: 'og:title', content: 'Email Transfer Station Docs' }],
    ['meta', { property: 'og:description', content: 'Email Transfer Station documentation draft' }],
    ['meta', { property: 'og:site_name', content: 'Email Transfer Station' }],
    ['meta', { property: 'og:image', content: '/logo.png' }],
    ['meta', { property: 'og:url', content: 'https://docs.example.com' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'Email Transfer Station Docs' }],
    ['meta', { name: 'twitter:description', content: 'Email Transfer Station documentation draft' }],
    ['meta', { name: 'twitter:image', content: '/logo.png' }],
    ['link', { rel: 'alternate', hreflang: 'zh-Hans', href: 'https://docs.example.com/zh/' }],
    ['link', { rel: 'alternate', hreflang: 'en', href: 'https://docs.example.com/en/' }],
    ['link', { rel: 'alternate', hreflang: 'x-default', href: 'https://docs.example.com/zh/' }],
  ],
  sitemap: {
    hostname: 'https://docs.example.com',
    transformItems(items) {
      return items.filter((item) => !item.url.includes('migration'))
    }
  },
  themeConfig: {
    logo: { src: '/logo.png', width: 24, height: 24 },
    search: { provider: 'local' },
    socialLinks: []
  }
})
