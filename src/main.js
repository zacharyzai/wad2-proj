import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'
import i18n from './i18n'

const app = createApp(App).use(router).use(i18n)
// Show the app once the first page's code is loaded and the router knows which page it is, so nothing jumps in:
// no empty frame with the footer at the top, and no app frame flashing before Login or the welcome page.
router.isReady().then(() => app.mount('#app'))
