const PORTAL_DESTINATIONS = {
  knowledge: '/ask',
  employee: '/ask',
} as const

export type PortalTarget = keyof typeof PORTAL_DESTINATIONS

export function resolvePortalDestination(value: unknown): string {
  if (typeof value !== 'string') return PORTAL_DESTINATIONS.knowledge
  return PORTAL_DESTINATIONS[value as PortalTarget] ?? PORTAL_DESTINATIONS.knowledge
}

export function normalizeInternalPath(value: unknown, fallback = '/ask'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback
  }
  if (value.includes('\\') || [...value].some((character) => character.charCodeAt(0) < 32)) {
    return fallback
  }

  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
