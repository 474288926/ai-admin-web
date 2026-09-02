import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assignKnowledgeApprovalRoles,
  decideKnowledgeApproval,
  getKnowledgeApprovalCapabilities,
  listKnowledgeApprovals,
} from '@/services/api/knowledge-approvals'

const organizationId = '899c640e-f020-4116-92a7-f596245c457c'
const approvalId = 'e597f9e9-87dc-4006-aafc-c8b7696f68d2'
const user = {
  id: 'e2c1cf4d-98f3-4139-84b0-6da03635ca07',
  email: '474288926@qq.com',
  name: '超级管理员',
}
const approval = {
  id: approvalId,
  reference: 'KBA-20260901-000001',
  organizationId,
  type: 'DOCUMENT_AUDIENCE_CONTRACT',
  status: 'PENDING',
  subjectId: 'document-audience-vocabulary-v1',
  subjectVersion: '1.0.0-draft.1',
  subjectSha256: 'b675cd5a54b06adea74cc02dd1190892e88b1d97c245da31c5a65e6d2a241264',
  knowledgeBaseIds: ['38660828-75f9-4bb4-a642-aa7bea350e52'],
  revision: 0,
  createdBy: user,
  cancelledBy: null,
  cancelledAt: null,
  completedAt: null,
  createdAt: '2026-09-01T07:17:35.000Z',
  updatedAt: '2026-09-01T07:17:35.000Z',
  steps: [
    {
      id: 'c5982978-763c-4f4c-bbca-68172c41f03e',
      role: 'BUSINESS_OWNER',
      position: 1,
      decision: null,
      comment: null,
      decidedByUserId: null,
      decidedByUser: null,
      decidedAt: null,
      assignedToUserId: null,
      assignedToUser: null,
      assignedByUserId: null,
      assignedByUser: null,
      assignedAt: null,
      canDecide: true,
      ineligibleReason: null,
    },
  ],
  events: [],
  progress: { approved: 0, required: 3 },
  capabilities: { canCancel: true, canReissue: false, canExport: true, canAssign: true },
  snapshotCurrent: true,
}

afterEach(() => vi.unstubAllGlobals())

describe('knowledge approvals api', () => {
  it('loads paginated approvals with organization and status filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [approval],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listKnowledgeApprovals({ organizationId, status: 'PENDING' })

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost')
    expect(Object.fromEntries(requestUrl.searchParams)).toMatchObject({
      organizationId,
      status: 'PENDING',
    })
    expect(result.items[0]?.reference).toBe('KBA-20260901-000001')
  })

  it('reports independent approver capacity without weakening the requirement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            canCreate: true,
            currentUserRole: 'OWNER',
            requiredDistinctApprovers: 3,
            maximumDistinctApprovers: 2,
            readyToComplete: false,
            blocker: '当前成员与权限最多只能覆盖部分独立审批角色，请邀请或授权更多成员。',
            roles: [{ role: 'BUSINESS_OWNER', users: [user] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const result = await getKnowledgeApprovalCapabilities(organizationId)

    expect(result.requiredDistinctApprovers).toBe(3)
    expect(result.maximumDistinctApprovers).toBe(2)
    expect(result.readyToComplete).toBe(false)
  })

  it('sends the approval revision with a decision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(approval), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await decideKnowledgeApproval(approvalId, {
      role: 'BUSINESS_OWNER',
      decision: 'APPROVED',
      revision: 0,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/knowledge-approvals/${approvalId}/decision`),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"revision":0') }),
    )
  })

  it('sends all three distinct role assignments with the revision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(approval), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await assignKnowledgeApprovalRoles(approvalId, {
      revision: 0,
      assignments: [
        { role: 'BUSINESS_OWNER', userId: user.id },
        { role: 'KNOWLEDGE_OPERATIONS', userId: '9c221bad-289e-4e13-85b9-90e5c1a6f9ac' },
        { role: 'RETRIEVAL_MAINTAINER', userId: 'a2565fb8-d895-4935-a807-f9ef95195c81' },
      ],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/knowledge-approvals/${approvalId}/assignments`),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('RETRIEVAL_MAINTAINER'),
      }),
    )
  })
})
