import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  acceptInvitation,
  addDepartmentMember,
  addGroupMember,
  addMemberByEmail,
  createDepartment,
  createGroup,
  createInvitation,
  getOrganization,
  listInvitations,
  listOrganizations,
  previewInvitation,
  removeDepartmentMember,
  removeGroupMember,
  revokeInvitation,
  deleteDepartment,
  deleteGroup,
  updateDepartment,
  updateGroup,
  updateMember,
} from '@/services/api/organizations'

const organizationId = '40f10640-86fe-4217-8ad9-fc39c6f80963'
const memberId = '78e580e7-0903-422c-8a78-bba7fab56c97'
const userId = '67c52979-aa9b-49f6-84d4-e666cc2e8f90'
const createdAt = '2026-08-15T01:00:00.000Z'
const token = 'a'.repeat(43)

afterEach(() => vi.unstubAllGlobals())

describe('organizations api', () => {
  it('loads the current user organizations and organization structure', async () => {
    const summary = {
      id: organizationId,
      name: '示例企业',
      slug: 'example-company',
      currentRole: 'ADMIN',
      createdAt,
      updatedAt: createdAt,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([summary]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...summary,
            memberships: [
              {
                id: memberId,
                userId,
                role: 'ADMIN',
                status: 'ACTIVE',
                joinedAt: createdAt,
                user: { email: 'admin@example.com', name: '管理员' },
              },
            ],
            departments: [
              {
                id: memberId,
                name: '客服部',
                parentId: null,
                sourceSystem: null,
                memberIds: [memberId],
              },
            ],
            groups: [
              {
                id: userId,
                name: '一线客服',
                description: null,
                memberIds: [memberId],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    expect((await listOrganizations())[0]?.name).toBe('示例企业')
    const structure = await getOrganization(organizationId)
    expect(structure.memberships[0]?.role).toBe('ADMIN')
    expect(structure.departments[0]?.memberIds).toEqual([memberId])
    expect(structure.groups[0]?.memberIds).toEqual([memberId])
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`/organizations/${organizationId}`)
  })

  it('adds a registered member by email and updates membership fields', async () => {
    const member = {
      id: memberId,
      userId,
      role: 'SUPPORT',
      status: 'ACTIVE',
      joinedAt: createdAt,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...member, user: { email: 'member@example.com', name: null } }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...member, status: 'SUSPENDED' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await addMemberByEmail(organizationId, {
      email: 'member@example.com',
      role: 'SUPPORT',
    })
    await updateMember(organizationId, memberId, { status: 'SUSPENDED' })

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      `/organizations/${organizationId}/members/by-email`,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      `/organizations/${organizationId}/members/${memberId}`,
    )
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' })
  })

  it('manages invitations and accepts a public invitation', async () => {
    const invitation = {
      id: memberId,
      email: 'new.member@example.com',
      role: 'SUPPORT',
      expiresAt: '2026-08-22T01:00:00.000Z',
      acceptedAt: null,
      revokedAt: null,
      createdAt,
    }
    const authSession = {
      tokenType: 'Bearer',
      accessToken: 'access-token',
      accessTokenExpiresIn: 900,
      refreshToken: 'refresh-token',
      refreshTokenExpiresIn: 2592000,
      user: {
        id: userId,
        email: invitation.email,
        name: '新成员',
        createdAt,
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([invitation]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...invitation, token }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expiresAt,
            organization: { id: organizationId, name: '示例企业' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authSession), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    expect((await listInvitations(organizationId))[0]?.email).toBe(invitation.email)
    expect(
      (
        await createInvitation(organizationId, {
          email: invitation.email,
          role: 'SUPPORT',
        })
      ).token,
    ).toBe(token)
    expect((await previewInvitation(token)).organization.name).toBe('示例企业')
    expect(
      (
        await acceptInvitation(token, {
          name: '新成员',
          password: 'correct-horse-battery-staple',
        })
      ).accessToken,
    ).toBe('access-token')
    await revokeInvitation(organizationId, memberId)

    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[3]?.[0]).toContain(`/organization-invitations/${token}/accept`)
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ method: 'DELETE' })
  })

  it('manages departments, groups and their members', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await createDepartment(organizationId, { name: '客服部', parentId: null })
    await updateDepartment(organizationId, memberId, {
      name: '客户成功部',
      parentId: null,
    })
    await addDepartmentMember(organizationId, memberId, userId)
    await removeDepartmentMember(organizationId, memberId, userId)
    await deleteDepartment(organizationId, memberId)
    await createGroup(organizationId, { name: '一线客服', description: null })
    await updateGroup(organizationId, userId, {
      name: '高级客服',
      description: '复杂问题处理',
    })
    await addGroupMember(organizationId, userId, memberId)
    await removeGroupMember(organizationId, userId, memberId)
    await deleteGroup(organizationId, userId)

    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'POST',
      'PATCH',
      'PUT',
      'DELETE',
      'DELETE',
      'POST',
      'PATCH',
      'PUT',
      'DELETE',
      'DELETE',
    ])
  })
})
