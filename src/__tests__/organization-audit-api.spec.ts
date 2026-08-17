import { afterEach, describe, expect, it, vi } from 'vitest'

import { listOrganizationAuditLogs } from '@/services/api/organization-audit'

const organizationId = '40f10640-86fe-4217-8ad9-fc39c6f80963'
const actorUserId = '67c52979-aa9b-49f6-84d4-e666cc2e8f90'

afterEach(() => vi.unstubAllGlobals())

describe('organization audit api', () => {
  it('builds filtered pagination queries and validates the audit response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: '78e580e7-0903-422c-8a78-bba7fab56c97',
              entityType: 'ORGANIZATION',
              entityId: organizationId,
              action: 'organization.member_updated',
              changes: { role: 'ADMIN', status: 'ACTIVE' },
              createdAt: '2026-08-17T02:00:00.000Z',
              actor: {
                id: actorUserId,
                email: 'admin@example.com',
                name: '管理员',
              },
            },
          ],
          meta: {
            page: 2,
            pageSize: 20,
            total: 24,
            totalPages: 2,
            hasNextPage: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listOrganizationAuditLogs(organizationId, {
      page: 2,
      pageSize: 20,
      entityType: 'ORGANIZATION',
      action: 'organization.member_updated',
      actorUserId,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-17T23:59:59.999Z',
    })

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost')
    expect(requestUrl.pathname).toContain(`/organizations/${organizationId}/audit-logs`)
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      page: '2',
      pageSize: '20',
      entityType: 'ORGANIZATION',
      action: 'organization.member_updated',
      actorUserId,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-17T23:59:59.999Z',
    })
    expect(result.items[0]?.actor?.name).toBe('管理员')
    expect(result.meta.total).toBe(24)
  })

  it('accepts deleted actors and records without safe change details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: '78e580e7-0903-422c-8a78-bba7fab56c97',
                entityType: 'DOCUMENT',
                entityId: organizationId,
                action: 'document.unknown_action',
                changes: null,
                createdAt: '2026-08-17T02:00:00.000Z',
                actor: null,
              },
            ],
            meta: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
              hasNextPage: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(listOrganizationAuditLogs(organizationId)).resolves.toMatchObject({
      items: [{ actor: null, changes: null }],
    })
  })
})
