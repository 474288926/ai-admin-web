import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import * as authApi from '@/services/api/auth'
import * as organizationApi from '@/services/api/organizations'
import { clearSession, readSession, writeSession } from '@/services/session-storage'
import type { AuthSession, AuthUser } from '@/types/auth'
import type { OrganizationRole } from '@/types/organization'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(null)
  const hydrated = ref(false)
  const organizationRoles = ref<OrganizationRole[]>([])
  const accessProfileLoaded = ref(false)
  const accessProfileError = ref<string | null>(null)
  const user = computed<AuthUser | null>(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => Boolean(session.value?.accessToken))
  let accessProfileUserId: string | null = null
  let accessProfilePromise: Promise<void> | null = null

  function resetAccessProfile(): void {
    organizationRoles.value = []
    accessProfileLoaded.value = false
    accessProfileError.value = null
    accessProfileUserId = null
    accessProfilePromise = null
  }

  function hydrate(): void {
    if (hydrated.value) return
    session.value = readSession()
    hydrated.value = true
  }

  function expireSession(): void {
    resetAccessProfile()
    session.value = null
    clearSession()
    hydrated.value = true
  }

  async function login(email: string, password: string): Promise<void> {
    const nextSession = await authApi.login(email, password)
    resetAccessProfile()
    session.value = nextSession
    writeSession(nextSession)
    hydrated.value = true
  }

  async function logout(): Promise<void> {
    try {
      if (session.value) await authApi.logout()
    } finally {
      resetAccessProfile()
      session.value = null
      clearSession()
    }
  }

  async function completeOidcLogin(code: string, state: string): Promise<string> {
    const nextSession = await authApi.completeOidcLogin(code, state)
    resetAccessProfile()
    session.value = nextSession
    writeSession(nextSession)
    hydrated.value = true
    return nextSession.returnTo
  }

  async function acceptOrganizationInvitation(
    token: string,
    input: { name?: string; password: string },
  ): Promise<void> {
    const nextSession = await organizationApi.acceptInvitation(token, input)
    resetAccessProfile()
    session.value = nextSession
    writeSession(nextSession)
    hydrated.value = true
  }

  async function ensureAccessProfile(force = false): Promise<void> {
    hydrate()
    const userId = user.value?.id
    if (!userId) {
      resetAccessProfile()
      return
    }
    if (!force && accessProfileLoaded.value && accessProfileUserId === userId) return
    if (!force && accessProfilePromise) return accessProfilePromise

    accessProfilePromise = (async () => {
      try {
        const organizations = await organizationApi.listOrganizations()
        if (user.value?.id !== userId) return
        organizationRoles.value = [...new Set(organizations.map((item) => item.currentRole))]
        accessProfileError.value = null
      } catch {
        if (user.value?.id !== userId) return
        organizationRoles.value = []
        accessProfileError.value = '无法读取当前账号的企业权限'
      } finally {
        if (user.value?.id === userId) {
          accessProfileLoaded.value = true
          accessProfileUserId = userId
        }
        accessProfilePromise = null
      }
    })()

    return accessProfilePromise
  }

  return {
    session,
    user,
    isAuthenticated,
    organizationRoles,
    accessProfileLoaded,
    accessProfileError,
    hydrate,
    expireSession,
    ensureAccessProfile,
    login,
    completeOidcLogin,
    acceptOrganizationInvitation,
    logout,
  }
})
