import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import SafeAnswerText from '@/components/SafeAnswerText.vue'
import {
  normalizeExternalLinkCandidate,
  parseExternalLinkTarget,
  splitAnswerText,
  TRUSTED_EXTERNAL_LINK_HOSTS,
} from '@/utils/external-links'

describe('knowledge answer external links', () => {
  it('recognizes domains and IPv4 addresses without using HTML injection', () => {
    const segments = splitAnswerText(
      '访问 cloud.mould.cn，备用地址 http://192.168.5.10:8080/help；外部 https://docs.example.com/a。',
    )
    const links = segments.filter((segment) => segment.type === 'link')

    expect(links).toEqual([
      expect.objectContaining({
        text: 'cloud.mould.cn',
        url: 'https://cloud.mould.cn/',
        trusted: true,
      }),
      expect.objectContaining({
        text: 'http://192.168.5.10:8080/help',
        hostname: '192.168.5.10',
        trusted: false,
      }),
      expect.objectContaining({
        text: 'https://docs.example.com/a',
        trusted: false,
      }),
    ])
    expect(segments[segments.length - 1]).toEqual({ type: 'text', text: '。' })
  })

  it('uses an exact hostname allowlist and rejects unsafe URL forms', () => {
    expect(TRUSTED_EXTERNAL_LINK_HOSTS).toEqual(['cloud.mould.cn', 'nzm.mould.cn'])
    expect(normalizeExternalLinkCandidate('https://nzm.mould.cn/path')?.trusted).toBe(true)
    expect(normalizeExternalLinkCandidate('https://sub.cloud.mould.cn')?.trusted).toBe(false)
    expect(normalizeExternalLinkCandidate('http://999.1.1.1')).toBeNull()
    expect(normalizeExternalLinkCandidate('https://user:pass@cloud.mould.cn')).toBeNull()
    expect(parseExternalLinkTarget(['https://docs.example.com'])).toBeNull()
    expect(splitAnswerText('邮箱 ops@cloud.mould.cn 不应变成链接')).toEqual([
      { type: 'text', text: '邮箱 ops@cloud.mould.cn 不应变成链接' },
    ])
  })

  it('opens trusted links directly and sends other links to the warning route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<main />' } },
        {
          path: '/external-link-warning',
          name: 'external-link-warning',
          component: { template: '<main />' },
        },
      ],
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(SafeAnswerText, {
      props: { text: 'cloud.mould.cn 和 192.168.5.20' },
      global: { plugins: [router] },
    })
    const links = wrapper.findAll('a')

    expect(links).toHaveLength(2)
    expect(links[0]?.attributes()).toMatchObject({
      href: 'https://cloud.mould.cn/',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(links[1]?.attributes('href')).toContain('/external-link-warning?target=')
    expect(decodeURIComponent(links[1]?.attributes('href') ?? '')).toContain('http://192.168.5.20/')
  })
})
