import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBase,
  getOrganization,
  listKnowledgeBaseGrants,
  listKnowledgeBases,
  removeKnowledgeBaseGrant,
  upsertKnowledgeBaseGrant,
  updateKnowledgeBase,
} from '@/services/api/knowledge-bases'

const knowledgeBase = {
  id: '03c7a80e-c672-41f0-8b9c-cfb915eabe4c',
  organizationId: null,
  visibility: 'PRIVATE',
  name: '内部制度库',
  description: '内部制度',
  createdAt: '2026-08-12T01:00:00.000Z',
  updatedAt: '2026-08-12T02:00:00.000Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('knowledge base api', () => {
  it('parses a paginated list and sends paging parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [knowledgeBase],
          meta: { page: 2, pageSize: 20, total: 21, totalPages: 2, hasNextPage: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listKnowledgeBases(2, 20)

    expect(result.items[0]?.name).toBe('内部制度库')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('page=2&pageSize=20')
  })

  it('sends create and update payloads to the backend', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(knowledgeBase), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...knowledgeBase, name: '制度中心' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await createKnowledgeBase({ name: '内部制度库', visibility: 'PRIVATE' })
    await updateKnowledgeBase(knowledgeBase.id, { name: '制度中心' })

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' })
  })

  it('uses the soft-delete endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await deleteKnowledgeBase(knowledgeBase.id)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/knowledge-bases/${knowledgeBase.id}`),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('loads organization targets and manages knowledge base grants', async () => {
    const organizationId = '40f10640-86fe-4217-8ad9-fc39c6f80963'
    const userId = '67c52979-aa9b-49f6-84d4-e666cc2e8f90'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...knowledgeBase, organizationId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: organizationId,
            name: '示例企业',
            slug: 'example-company',
            currentRole: 'ADMIN',
            createdAt: '2026-08-12T01:00:00.000Z',
            updatedAt: '2026-08-12T02:00:00.000Z',
            capabilities: {
              directoryAccess: 'FULL',
              canManageMembers: true,
              canManageUnits: true,
              canManageInvitations: true,
            },
            memberships: [
              {
                id: '78e580e7-0903-422c-8a78-bba7fab56c97',
                userId,
                role: 'MEMBER',
                status: 'ACTIVE',
                joinedAt: '2026-08-12T01:30:00.000Z',
                user: { email: 'member@example.com', name: '成员' },
              },
            ],
            departments: [],
            groups: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            organizationId,
            users: [
              {
                userId,
                permission: 'READ',
                user: { email: 'member@example.com', name: '成员' },
              },
            ],
            departments: [],
            groups: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    expect((await getKnowledgeBase(knowledgeBase.id)).organizationId).toBe(organizationId)
    expect((await getOrganization(organizationId)).memberships[0]?.userId).toBe(userId)
    expect((await listKnowledgeBaseGrants(knowledgeBase.id)).users[0]?.permission).toBe('READ')
    await upsertKnowledgeBaseGrant(knowledgeBase.id, {
      targetType: 'USER',
      targetId: userId,
      permission: 'EDIT',
    })
    await removeKnowledgeBaseGrant(knowledgeBase.id, 'USER', userId)

    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
