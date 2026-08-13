import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import * as authApi from '@/services/api/auth'
import { clearSession, readSession, writeSession } from '@/services/session-storage'
import type { AuthSession, AuthUser } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(null)
  const hydrated = ref(false)
  const user = computed<AuthUser | null>(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => Boolean(session.value?.accessToken))

  function hydrate(): void {
    if (hydrated.value) return
    session.value = readSession()
    hydrated.value = true
  }

  async function login(email: string, password: string): Promise<void> {
    const nextSession = await authApi.login(email, password)
    session.value = nextSession
    writeSession(nextSession)
    hydrated.value = true
  }

  async function logout(): Promise<void> {
    try {
      if (session.value) await authApi.logout()
    } finally {
      session.value = null
      clearSession()
    }
  }

  async function completeOidcLogin(code: string, state: string): Promise<string> {
    const nextSession = await authApi.completeOidcLogin(code, state)
    session.value = nextSession
    writeSession(nextSession)
    hydrated.value = true
    return nextSession.returnTo
  }

  return { session, user, isAuthenticated, hydrate, login, completeOidcLogin, logout }
})
