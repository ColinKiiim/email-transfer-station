import { createApp } from 'vue'
import { createHead } from '@unhead/vue/client'

import './styles/tokens.css'
import App from './App.vue'
import router from './router'
import i18n from './i18n'

const head = createHead()
const app = createApp(App)
app.use(i18n)
app.use(router)
app.use(head)
router.isReady().then(() => app.mount('#app'))
