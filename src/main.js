import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'
import i18n, { localeReady } from './i18n'

// Pinia first: the router's guards use the stores on the very first navigation.
const app = createApp(App).use(createPinia()).use(router).use(i18n)
// Show the app once the first page's code is loaded, the router knows which page it is and the saved language has arrived, so nothing jumps in:
// no empty frame with the footer at the top, and no app frame flashing before Login or the welcome page.
Promise.all([router.isReady(), localeReady]).then(() => app.mount('#app'))
