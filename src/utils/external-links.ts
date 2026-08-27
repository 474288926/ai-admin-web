export const TRUSTED_EXTERNAL_LINK_HOSTS = ['cloud.mould.cn', 'nzm.mould.cn'] as const

const trustedHosts = new Set<string>(TRUSTED_EXTERNAL_LINK_HOSTS)
const trailingPunctuationPattern = /[.,;:!?，。；：！？、)\]}）】》]+$/u
const candidatePattern = new RegExp(
  [
    String.raw`https?:\/\/[^\s<>"'\x60\u3000-\u9fff]+`,
    String.raw`(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:\/[^\s<>"'\x60\u3000-\u9fff]*)?`,
    String.raw`(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^\s<>"'\x60\u3000-\u9fff]*)?`,
  ].join('|'),
  'giu',
)

export interface ExternalLinkTarget {
  url: string
  hostname: string
  trusted: boolean
}

export type AnswerTextSegment =
  | { type: 'text'; text: string }
  | ({ type: 'link'; text: string } & ExternalLinkTarget)

function isValidIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/u.test(part) && (part === '0' || !part.startsWith('0')) && Number(part) <= 255,
    )
  )
}

function isValidDomain(hostname: string): boolean {
  if (hostname.length > 253) return false
  const labels = hostname.split('.')
  if (labels.length < 2) return false
  const topLevelDomain = labels[labels.length - 1] ?? ''
  return (
    labels.every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/iu.test(label)) &&
    /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/iu.test(topLevelDomain)
  )
}

function validateHttpUrl(raw: string): ExternalLinkTarget | null {
  try {
    const url = new URL(raw)
    const hostname = url.hostname.toLowerCase()
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (!isValidIpv4(hostname) && !isValidDomain(hostname))
    ) {
      return null
    }
    return {
      url: url.toString(),
      hostname,
      trusted: trustedHosts.has(hostname),
    }
  } catch {
    return null
  }
}

export function normalizeExternalLinkCandidate(candidate: string): ExternalLinkTarget | null {
  const value = candidate.trim()
  if (!value) return null
  if (/^https?:\/\//iu.test(value)) return validateHttpUrl(value)
  const host = value.split(/[/:]/u, 1)[0] ?? ''
  return validateHttpUrl(`${isValidIpv4(host) ? 'http' : 'https'}://${value}`)
}

export function parseExternalLinkTarget(value: unknown): ExternalLinkTarget | null {
  return typeof value === 'string' && value.length <= 4096 ? validateHttpUrl(value) : null
}

export function splitAnswerText(text: string): AnswerTextSegment[] {
  const segments: AnswerTextSegment[] = []
  let cursor = 0
  candidatePattern.lastIndex = 0

  for (const match of text.matchAll(candidatePattern)) {
    const start = match.index
    const rawCandidate = match[0]
    const candidate = rawCandidate.replace(trailingPunctuationPattern, '')
    const before = start > 0 ? text[start - 1] : undefined
    const target =
      before && /[a-z0-9_@.-]/iu.test(before) ? null : normalizeExternalLinkCandidate(candidate)
    if (!target) continue

    if (start > cursor) segments.push({ type: 'text', text: text.slice(cursor, start) })
    segments.push({ type: 'link', text: candidate, ...target })
    cursor = start + candidate.length
  }

  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) })
  return segments.length ? segments : [{ type: 'text', text }]
}
