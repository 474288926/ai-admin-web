import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

import App from './App.vue'
import router from './router'
import { AUTH_SESSION_EXPIRED_EVENT } from './services/api/client'
import { useAuthStore } from './stores/auth'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
let sessionExpiredDialogOpen = false

app.use(pinia)
app.use(router)
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  },
})

window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, () => {
  const authStore = useAuthStore(pinia)
  const currentRoute = router.currentRoute.value
  const redirect = currentRoute.name === 'login' ? undefined : currentRoute.fullPath
  authStore.expireSession()
  void router.replace({ name: 'login', ...(redirect ? { query: { redirect } } : {}) })
  if (sessionExpiredDialogOpen) return
  sessionExpiredDialogOpen = true
  void ElMessageBox.alert('登录状态已失效，请重新登录。', '请重新登录', {
    confirmButtonText: '知道了',
    type: 'warning',
  })
    .catch(() => undefined)
    .finally(() => {
      sessionExpiredDialogOpen = false
    })
})

app.mount('#app')
