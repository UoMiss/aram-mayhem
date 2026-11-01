import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/styles/main.css'
import { i18n } from '@/i18n'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.mount('#app')
