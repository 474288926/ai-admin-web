import { expect, test, type Page, type Route } from '@playwright/test'

const managerEmail = process.env.E2E_MANAGER_EMAIL
const managerPassword = process.env.E2E_MANAGER_PASSWORD
const supportEmail = process.env.E2E_SUPPORT_EMAIL
const supportPassword = process.env.E2E_SUPPORT_PASSWORD

const managerCredentialsConfigured = Boolean(managerEmail && managerPassword)
const supportCredentialsConfigured = Boolean(supportEmail && supportPassword)

const businessPages = [
  { path: '/dashboard', pageTitle: '运营总览', contentTitle: '运营基座已经就绪' },
  { path: '/organization', pageTitle: '企业管理', contentTitle: '企业管理' },
  { path: '/assistant', pageTitle: '知识辅助', contentTitle: '客服知识辅助' },
  { path: '/knowledge-bases', pageTitle: '知识库管理', contentTitle: '知识库' },
  { path: '/documents', pageTitle: '文档管理', contentTitle: '文档管理' },
  { path: '/document-sources', pageTitle: '企业文档同步', contentTitle: '企业文档同步' },
  { path: '/ingestion', pageTitle: '处理任务', contentTitle: '处理任务' },
  { path: '/retrieval', pageTitle: '检索调试', contentTitle: '检索调试' },
  { path: '/quality', pageTitle: '质量分析', contentTitle: '质量分析' },
  { path: '/evaluations', pageTitle: '评测中心', contentTitle: '评测中心' },
  { path: '/settings', pageTitle: '系统配置', contentTitle: '系统配置' },
] as const

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('name@company.com').fill(email)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '进入管理端' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: '运营总览', level: 1 })).toBeVisible()
}

const mockSession = {
  tokenType: 'Bearer',
  accessToken: 'e2e-access-token',
  accessTokenExpiresIn: 3600,
  refreshToken: 'e2e-refresh-token',
  refreshTokenExpiresIn: 86400,
  user: {
    id: '10000000-0000-4000-8000-000000000010',
    email: 'ai-e2e@example.com',
    name: 'AI E2E 用户',
    createdAt: '2026-08-14T00:00:00.000Z',
  },
} as const

const mockOrganizations = [
  {
    id: '10000000-0000-4000-8000-000000000011',
    name: 'E2E 测试企业',
    slug: 'e2e-organization',
    currentRole: 'OWNER',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  },
] as const

async function useMockSession(
  page: Page,
  options: {
    organizations?: unknown
    capabilities?: unknown
  } = {},
): Promise<void> {
  await page.addInitScript((session) => {
    window.localStorage.setItem('knowledge-admin-session', JSON.stringify(session))
  }, mockSession)
  await page.route('**/api/v1/organizations/capabilities', (route) =>
    fulfillJson(
      route,
      options.capabilities ?? {
        mode: 'single',
        canCreate: false,
        creationUnavailableReason: 'SINGLE_ORGANIZATION_EXISTS',
      },
    ),
  )
  await page.route('**/api/v1/organizations', (route) =>
    fulfillJson(route, options.organizations ?? mockOrganizations),
  )
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('未登录访问业务页面时跳转登录页并保留回跳地址', async ({ page }) => {
  await page.goto('/settings')

  await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)settings$/)
  await expect(page.getByRole('heading', { name: '欢迎回来', level: 2 })).toBeVisible()
})

test('未登录访问员工问答端时登录后回到原页面', async ({ page }) => {
  await page.goto('/ask')

  await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)ask$/)
  await expect(page.getByText('员工问答', { exact: true })).toBeVisible()
})

test('未登录访问客服嵌入面板时跳转登录并保留回跳地址', async ({ page }) => {
  await page.goto('/support/embed')

  await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)support(?:%2F|\/)embed$/)
  await expect(page.getByRole('heading', { name: '欢迎回来', level: 2 })).toBeVisible()
})

test('企业管理员可以查询安全裁剪后的操作审计记录', async ({ page }) => {
  const organization = mockOrganizations[0]
  await useMockSession(page)
  await page.route(`**/api/v1/organizations/${organization.id}`, (route) =>
    fulfillJson(route, {
      ...organization,
      capabilities: {
        directoryAccess: 'FULL',
        canManageMembers: true,
        canManageUnits: true,
        canManageInvitations: true,
        canTransferOwnership: true,
        canLeaveOrganization: false,
      },
      memberships: [
        {
          id: '10000000-0000-4000-8000-000000000012',
          userId: mockSession.user.id,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: '2026-08-14T00:00:00.000Z',
          sourceSystem: null,
          user: { email: mockSession.user.email, name: mockSession.user.name },
        },
      ],
      departments: [],
      groups: [],
    }),
  )
  await page.route(`**/api/v1/organizations/${organization.id}/audit-logs*`, (route) =>
    fulfillJson(route, {
      items: [
        {
          id: '10000000-0000-4000-8000-000000000013',
          entityType: 'ORGANIZATION',
          entityId: organization.id,
          action: 'organization.member_updated',
          changes: { role: 'ADMIN', status: 'ACTIVE' },
          createdAt: '2026-08-17T02:00:00.000Z',
          actor: {
            id: mockSession.user.id,
            email: mockSession.user.email,
            name: mockSession.user.name,
          },
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false },
    }),
  )

  await page.goto('/organization/audit')

  await expect(page.getByRole('heading', { name: '操作审计', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: '企业操作审计', level: 2 })).toBeVisible()
  const auditTable = page.locator('.audit-table')
  await expect(auditTable.getByText('调整成员角色或状态')).toBeVisible()
  await expect(auditTable.getByText('角色：企业管理员，状态：正常')).toBeVisible()
})

test('普通成员看不到操作审计入口且路由被拒绝', async ({ page }) => {
  await useMockSession(page, {
    organizations: [{ ...mockOrganizations[0], currentRole: 'MEMBER' }],
  })

  await page.goto('/organization/audit')

  await expect(page).toHaveURL(/\/forbidden\?reason=denied/)
  await expect(page.getByRole('menuitem', { name: '操作审计' })).toHaveCount(0)
  await expect(page.getByText('无权访问此页面')).toBeVisible()
})

test('企业登录回调缺少参数时给出可恢复提示', async ({ page }) => {
  await page.goto('/auth/oidc/callback')

  await expect(page.getByRole('heading', { name: '登录未完成', level: 1 })).toBeVisible()
  await expect(page.getByText('登录回调参数不完整')).toBeVisible()
  await expect(page.getByRole('button', { name: '返回登录页' })).toBeVisible()
})

test('办公门户入口公开可用并安全回落到内部账号登录', async ({ page }) => {
  await page.goto('/portal?target=https://evil.example')

  await expect(page.getByRole('heading', { name: /工作中的问题/ })).toBeVisible()
  await expect(page.getByText('企业知识入口')).toBeVisible()
  await expect(page.getByRole('button', { name: '使用内部账号登录' })).toBeVisible()
  await page.getByRole('button', { name: '使用内部账号登录' }).click()
  await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)ask$/)
})

test('办公门户入口适配移动端且没有页面级横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/portal')
  await expect(page.getByRole('heading', { name: /工作中的问题/ })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('企业管理员可以从统一入口新增成员', async ({ page }) => {
  await useMockSession(page)
  const organization = mockOrganizations[0]

  await page.route(`**/api/v1/organizations/${organization.id}`, (route) =>
    fulfillJson(route, {
      ...organization,
      capabilities: {
        directoryAccess: 'FULL',
        canManageMembers: true,
        canManageUnits: true,
        canManageInvitations: true,
        canTransferOwnership: true,
        canLeaveOrganization: false,
      },
      memberships: [
        {
          id: '10000000-0000-4000-8000-000000000012',
          userId: mockSession.user.id,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: '2026-08-14T00:00:00.000Z',
          sourceSystem: null,
          user: { email: mockSession.user.email, name: mockSession.user.name },
        },
      ],
      departments: [],
      groups: [],
    }),
  )
  await page.route(`**/api/v1/organizations/${organization.id}/invitations`, (route) =>
    fulfillJson(route, []),
  )

  await page.goto('/organization')

  const addMemberButton = page.getByRole('button', { name: '新增成员' })
  await expect(addMemberButton).toBeVisible()
  await addMemberButton.click()
  await page.getByRole('menuitem', { name: '邀请新成员' }).click()
  await expect(page.getByRole('dialog', { name: '邀请新成员' })).toBeVisible()
})

test('企业所有者可以转移所有权并移除普通成员', async ({ page }) => {
  await useMockSession(page)
  const organization = mockOrganizations[0]
  const nextOwnerMemberId = '10000000-0000-4000-8000-000000000013'
  const removableMemberId = '10000000-0000-4000-8000-000000000014'
  let transferredMemberId = ''
  let removedMemberId = ''

  await page.route(`**/api/v1/organizations/${organization.id}`, (route) =>
    fulfillJson(route, {
      ...organization,
      capabilities: {
        directoryAccess: 'FULL',
        canManageMembers: true,
        canManageUnits: true,
        canManageInvitations: true,
        canTransferOwnership: true,
        canLeaveOrganization: false,
      },
      memberships: [
        {
          id: '10000000-0000-4000-8000-000000000012',
          userId: mockSession.user.id,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: '2026-08-14T00:00:00.000Z',
          sourceSystem: null,
          user: { email: mockSession.user.email, name: mockSession.user.name },
        },
        {
          id: nextOwnerMemberId,
          userId: '10000000-0000-4000-8000-000000000015',
          role: 'ADMIN',
          status: 'ACTIVE',
          joinedAt: '2026-08-14T00:00:00.000Z',
          sourceSystem: null,
          user: { email: 'next-owner@example.com', name: '候选所有者' },
        },
        {
          id: removableMemberId,
          userId: '10000000-0000-4000-8000-000000000016',
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: '2026-08-14T00:00:00.000Z',
          sourceSystem: null,
          user: { email: 'remove@example.com', name: '待移除成员' },
        },
      ],
      departments: [],
      groups: [],
    }),
  )
  await page.route(`**/api/v1/organizations/${organization.id}/invitations`, (route) =>
    fulfillJson(route, []),
  )
  await page.route(
    `**/api/v1/organizations/${organization.id}/ownership-transfer`,
    async (route) => {
      transferredMemberId = (route.request().postDataJSON() as { memberId: string }).memberId
      await route.fulfill({ status: 204 })
    },
  )
  await page.route(`**/api/v1/organizations/${organization.id}/members/*`, async (route) => {
    removedMemberId = route.request().url().split('/').at(-1) ?? ''
    await route.fulfill({ status: 204 })
  })

  await page.goto('/organization')

  const nextOwnerRow = page.getByRole('row', { name: /候选所有者/ })
  await nextOwnerRow.getByRole('button', { name: '转移所有权' }).click()
  await page.getByRole('button', { name: '确认转移' }).click()
  await expect(page.getByText('企业所有权已转移')).toBeVisible()

  const removableRow = page.getByRole('row', { name: /待移除成员/ })
  await removableRow.getByRole('button', { name: '移除', exact: true }).click()
  await page.getByRole('button', { name: '确认移除' }).click()
  await expect(page.getByText('企业成员已移除')).toBeVisible()

  expect(transferredMemberId).toBe(nextOwnerMemberId)
  expect(removedMemberId).toBe(removableMemberId)
})

test('普通企业成员只能查看自己的企业身份', async ({ page }) => {
  const organization = { ...mockOrganizations[0], currentRole: 'MEMBER' }
  await useMockSession(page, { organizations: [organization] })
  await page.route(`**/api/v1/organizations/${organization.id}`, (route) =>
    fulfillJson(route, {
      ...organization,
      capabilities: {
        directoryAccess: 'SELF',
        canManageMembers: false,
        canManageUnits: false,
        canManageInvitations: false,
        canTransferOwnership: false,
        canLeaveOrganization: true,
      },
      memberships: [
        {
          id: '10000000-0000-4000-8000-000000000012',
          userId: mockSession.user.id,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: '2026-08-14T00:00:00.000Z',
          sourceSystem: null,
          user: { email: mockSession.user.email, name: mockSession.user.name },
        },
      ],
      departments: [],
      groups: [],
    }),
  )

  await page.goto('/organization')

  await expect(page.getByRole('heading', { name: '我的企业身份' })).toBeVisible()
  await expect(page.getByText(mockSession.user.email).first()).toBeVisible()
  await expect(page.getByText('当前仅显示你的企业成员信息')).toBeVisible()
  await expect(page.getByRole('button', { name: '退出企业' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增成员' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '部门' })).toHaveCount(0)
})

test('单企业首次初始化账号可以创建企业', async ({ page }) => {
  let organizationCreated = false
  let createBody: Record<string, unknown> | null = null
  const createdOrganization = mockOrganizations[0]

  await useMockSession(page, {
    organizations: [],
    capabilities: {
      mode: 'single',
      canCreate: true,
      creationUnavailableReason: null,
    },
  })
  await page.route('**/api/v1/organizations', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      createBody = request.postDataJSON() as Record<string, unknown>
      organizationCreated = true
      return fulfillJson(route, createdOrganization, 201)
    }
    return fulfillJson(route, organizationCreated ? [createdOrganization] : [])
  })
  await page.route(`**/api/v1/organizations/${createdOrganization.id}`, (route) =>
    fulfillJson(route, {
      ...createdOrganization,
      capabilities: {
        directoryAccess: 'FULL',
        canManageMembers: true,
        canManageUnits: true,
        canManageInvitations: true,
        canTransferOwnership: true,
        canLeaveOrganization: false,
      },
      memberships: [],
      departments: [],
      groups: [],
    }),
  )

  await page.goto('/organization')
  await page.getByRole('button', { name: '初始化企业' }).click()
  const dialog = page.getByRole('dialog', { name: '初始化企业' })
  await dialog.getByLabel('企业名称').fill('内部知识平台')
  await dialog.getByLabel('企业标识').fill('internal-knowledge')
  await dialog.getByRole('button', { name: '确认创建' }).click()

  await expect(page.getByText('企业已创建，你已成为企业所有者')).toBeVisible()
  await expect(page.getByText('运营总览', { exact: true })).toBeVisible()
  expect(createBody).toEqual({ name: '内部知识平台', slug: 'internal-knowledge' })
})

test('系统配置页展示实际启用的多模型与 Prompt 版本', async ({ page }) => {
  await useMockSession(page)
  const systemConfiguration = {
    capturedAt: '2026-08-15T03:00:00.000Z',
    policy: {
      source: 'environment+database',
      mutationSupported: true,
      mutationAllowed: true,
      restartRequired: true,
      secretsExposed: false,
      activeRevision: 2,
      currentRevision: 2,
    },
    pending: null,
    runtime: {
      applicationName: 'ai-backend',
      environment: 'development',
      apiPrefix: 'api/v1',
      port: 3000,
      swaggerEnabled: true,
    },
    ai: {
      enabled: true,
      provider: 'qwen',
      defaultModelId: 'qwen',
      defaultModel: 'qwen-e2e-model',
      credentialConfigured: true,
      models: [
        {
          id: 'openai',
          provider: 'openai',
          model: 'gpt-e2e-model',
          enabled: true,
          isDefault: false,
          credentialConfigured: true,
        },
        {
          id: 'qwen',
          provider: 'qwen',
          model: 'qwen-e2e-model',
          enabled: true,
          isDefault: true,
          credentialConfigured: true,
        },
        {
          id: 'deepseek',
          provider: 'deepseek',
          model: 'deepseek-e2e-model',
          enabled: false,
          isDefault: false,
          credentialConfigured: false,
        },
      ],
      requestTimeoutMs: 30000,
      maxOutputTokens: 2048,
      maxRetries: 0,
      contextMessageLimit: 20,
      rateLimitWindowSeconds: 60,
      userRateLimit: 10,
      embeddingModel: 'text-embedding-e2e',
      embeddingDimensions: 1536,
      embeddingBatchSize: 64,
    },
    retrieval: {
      driver: 'pgvector',
      mode: 'hybrid',
      keywordCandidateMultiplier: 4,
      keywordMinimumScore: 0.1,
      rrfK: 60,
      queryRewriteAiEnabled: false,
      rerankEnabled: true,
      rerankCandidateMultiplier: 4,
      minimumEvidenceScore: 0.3,
      strongEvidenceScore: 0.65,
      requireCriticalExactTermMatch: true,
      answerabilityAiEnabled: false,
    },
    rag: {
      promptVersion: 'rag-structured-response-e2e',
      structuredResponseEnabled: true,
      reasoningEffort: 'minimal',
      customerSafetyEnabled: true,
      customerSafetyAiEnabled: false,
      citationExcerptEnabled: true,
      citationExcerptMaxChars: 300,
      conflictDetectionEnabled: true,
      conflictDetectionAiEnabled: false,
      multiTurnQueryRewriteEnabled: true,
      multiTurnQueryRewriteAiEnabled: false,
      multiTurnHistoryMessageLimit: 6,
    },
    documents: {
      storageDriver: 'local',
      storageCredentialConfigured: true,
      maxFileSizeBytes: 20971520,
      batchMaxFiles: 20,
      batchMaxTotalSizeBytes: 104857600,
      allowedExtensions: ['.pdf', '.docx'],
      chunkSizeChars: 1000,
      chunkOverlapChars: 150,
      processingTimeoutMs: 120000,
      ocrEnabled: false,
      ocrModel: null,
      pipelineWorkerEnabled: true,
      pipelineRecoveryEnabled: true,
      pipelineMaxAttempts: 3,
    },
    evaluation: {
      workerEnabled: true,
      pollingIntervalMs: 1000,
      maxCasesPerSuite: 200,
      maxAttempts: 2,
      caseTimeoutMs: 120000,
    },
  }
  let updateBody: Record<string, unknown> | null = null
  let rollbackBody: Record<string, unknown> | null = null
  let historyItems: Record<string, unknown>[] = [
    {
      id: 'change-e2e-2',
      revision: 2,
      createdAt: '2026-08-15T05:00:00.000Z',
      actor: {
        id: 'admin-e2e',
        name: '配置管理员',
        email: 'admin@example.com',
      },
      operation: { type: 'update' },
      changes: {
        aiDefaultModelId: { before: 'openai', after: 'qwen' },
        ragPromptVersion: {
          before: 'rag-structured-response-1.0',
          after: 'rag-structured-response-e2e',
        },
        aiMaxOutputTokens: { before: 1024, after: 2048 },
        aiContextMessageLimit: { before: 10, after: 20 },
        retrievalKeywordMinimumScore: { before: 0.05, after: 0.1 },
        rerankMinimumEvidenceScore: { before: 0.2, after: 0.3 },
        rerankStrongEvidenceScore: { before: 0.6, after: 0.65 },
      },
    },
    {
      id: 'change-e2e-1',
      revision: 1,
      createdAt: '2026-08-14T05:00:00.000Z',
      actor: null,
      operation: { type: 'update' },
      changes: {
        ragPromptVersion: {
          before: 'rag-structured-response-0.9',
          after: 'rag-structured-response-1.0',
        },
      },
    },
  ]
  await page.route('**/api/v1/system/configuration/history?limit=20', (route) =>
    fulfillJson(route, { items: historyItems }),
  )
  await page.route('**/api/v1/system/configuration/rollback', (route) => {
    rollbackBody = route.request().postDataJSON() as Record<string, unknown>
    historyItems = [
      {
        id: 'change-e2e-4',
        revision: 4,
        createdAt: '2026-08-15T07:00:00.000Z',
        actor: {
          id: 'admin-e2e',
          name: '配置管理员',
          email: 'admin@example.com',
        },
        operation: { type: 'rollback', targetRevision: 1 },
        changes: {
          ragPromptVersion: {
            before: 'rag-structured-response-2.0',
            after: 'rag-structured-response-1.0',
          },
          aiMaxOutputTokens: { before: 4096, after: 1024 },
        },
      },
      ...historyItems,
    ]
    return fulfillJson(route, {
      ...systemConfiguration,
      policy: { ...systemConfiguration.policy, currentRevision: 4 },
      pending: {
        revision: 4,
        aiDefaultModelId: 'openai',
        ragPromptVersion: 'rag-structured-response-1.0',
        aiMaxOutputTokens: 1024,
        aiContextMessageLimit: 10,
        retrievalKeywordMinimumScore: 0.05,
        rerankMinimumEvidenceScore: 0.2,
        rerankStrongEvidenceScore: 0.6,
        updatedAt: '2026-08-15T07:00:00.000Z',
      },
    })
  })
  await page.route('**/api/v1/system/configuration', (route) => {
    if (route.request().method() === 'PATCH') {
      updateBody = route.request().postDataJSON() as Record<string, unknown>
      return fulfillJson(route, {
        ...systemConfiguration,
        policy: { ...systemConfiguration.policy, currentRevision: 3 },
        pending: {
          revision: 3,
          aiDefaultModelId: 'openai',
          ragPromptVersion: 'rag-structured-response-2.0',
          aiMaxOutputTokens: 4096,
          aiContextMessageLimit: 30,
          retrievalKeywordMinimumScore: 0.2,
          rerankMinimumEvidenceScore: 0.4,
          rerankStrongEvidenceScore: 0.8,
          updatedAt: '2026-08-15T04:00:00.000Z',
        },
      })
    }
    return fulfillJson(route, systemConfiguration)
  })

  await page.goto('/settings')

  await expect(page.getByRole('heading', { name: '系统配置', level: 2 })).toBeVisible()
  await expect(page.getByText('qwen-e2e-model', { exact: true })).toBeVisible()
  await expect(page.getByText(/OpenAI · gpt-e2e-model .*凭据已配置/)).toBeVisible()
  await expect(page.getByText(/千问 · qwen-e2e-model .*默认.*凭据已配置/)).toBeVisible()
  await expect(page.getByText('rag-structured-response-e2e', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/deepseek-e2e-model/)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '配置变更历史', level: 3 })).toBeVisible()
  await expect(page.getByText('revision 2')).toBeVisible()
  await expect(page.getByText('配置管理员', { exact: true })).toBeVisible()
  await expect(page.getByText('admin@example.com', { exact: true })).toBeVisible()
  await expect(page.getByText('rag-structured-response-1.0', { exact: true })).toHaveCount(2)
  await expect(page.getByText('rag-structured-response-e2e', { exact: true }).last()).toBeVisible()

  await page.getByRole('button', { name: '编辑配置' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑系统配置' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('千问 · qwen-e2e-model', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Prompt 版本' })).toHaveValue(
    'rag-structured-response-e2e',
  )

  await dialog.getByText('千问 · qwen-e2e-model', { exact: true }).click()
  await page.getByRole('option', { name: 'OpenAI · gpt-e2e-model' }).click()
  await page.getByRole('textbox', { name: 'Prompt 版本' }).fill('rag-structured-response-2.0')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '最大输出 Token' })
    .getByRole('spinbutton')
    .fill('4096')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '上下文消息数' })
    .getByRole('spinbutton')
    .fill('30')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '关键词最低分' })
    .getByRole('spinbutton')
    .fill('0.2')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '最低证据分' })
    .getByRole('spinbutton')
    .fill('0.4')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '强证据分' })
    .getByRole('spinbutton')
    .fill('0.8')
  await dialog.getByRole('button', { name: '保存配置' }).click()

  await expect(page.getByText('配置 revision 3 等待生效')).toBeVisible()
  await expect(dialog).toBeHidden()
  expect(updateBody).toEqual({
    revision: 2,
    aiDefaultModelId: 'openai',
    ragPromptVersion: 'rag-structured-response-2.0',
    aiMaxOutputTokens: 4096,
    aiContextMessageLimit: 30,
    retrievalKeywordMinimumScore: 0.2,
    rerankMinimumEvidenceScore: 0.4,
    rerankStrongEvidenceScore: 0.8,
  })

  await page.getByRole('button', { name: '恢复到 revision 1' }).click()
  const rollbackDialog = page.getByRole('dialog', { name: '确认恢复到 revision 1' })
  await expect(rollbackDialog).toBeVisible()
  await rollbackDialog.getByRole('button', { name: '确认恢复' }).click()

  await expect(page.getByText('配置 revision 4 等待生效')).toBeVisible()
  await expect(page.getByText('回滚到 revision 1')).toBeVisible()
  expect(rollbackBody).toEqual({ revision: 3, targetRevision: 1 })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '配置变更历史', level: 3 })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('模型选择器把选中的模型传给问答接口', async ({ page }) => {
  await useMockSession(page)

  const knowledgeBaseId = '10000000-0000-4000-8000-000000000020'
  const conversationId = '10000000-0000-4000-8000-000000000021'
  const userMessageId = '10000000-0000-4000-8000-000000000022'
  const assistantMessageId = '10000000-0000-4000-8000-000000000023'
  const now = '2026-08-14T08:00:00.000Z'
  let sentMessageBody: Record<string, unknown> | null = null

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname === '/api/v1/ai/models') {
      return fulfillJson(route, [
        {
          id: 'qwen',
          provider: 'qwen',
          displayName: '千问（阿里云百炼）',
          isDefault: true,
          pricing: null,
        },
        {
          id: 'deepseek',
          provider: 'deepseek',
          displayName: 'DeepSeek',
          isDefault: false,
          pricing: null,
        },
      ])
    }

    if (url.pathname === '/api/v1/organizations') {
      return fulfillJson(route, mockOrganizations)
    }

    if (url.pathname === '/api/v1/knowledge-bases') {
      return fulfillJson(route, {
        items: [
          {
            id: knowledgeBaseId,
            organizationId: null,
            visibility: 'PRIVATE',
            name: '客服知识库',
            description: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1, hasNextPage: false },
      })
    }

    if (url.pathname === '/api/v1/conversations' && request.method() === 'GET') {
      return fulfillJson(route, {
        items: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0, hasNextPage: false },
      })
    }

    if (url.pathname === '/api/v1/conversations' && request.method() === 'POST') {
      return fulfillJson(
        route,
        {
          id: conversationId,
          title: '设备无法联网怎么办？',
          knowledgeBaseId,
          createdAt: now,
          updatedAt: now,
        },
        201,
      )
    }

    if (
      url.pathname === `/api/v1/conversations/${conversationId}/messages` &&
      request.method() === 'POST'
    ) {
      sentMessageBody = request.postDataJSON() as Record<string, unknown>
      const clientRequestId = String(sentMessageBody.clientRequestId)
      const baseMessage = {
        status: 'COMPLETED',
        providerResponseId: null,
        finishReason: null,
        usage: null,
        citations: null,
        structuredResponse: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      }
      return fulfillJson(route, {
        userMessage: {
          ...baseMessage,
          id: userMessageId,
          position: 1,
          role: 'USER',
          content: '设备无法联网怎么办？',
          clientRequestId,
          parentMessageId: null,
          provider: null,
          model: null,
        },
        assistantMessage: {
          ...baseMessage,
          id: assistantMessageId,
          position: 2,
          role: 'ASSISTANT',
          content: '请先检查设备电源和网络指示灯。',
          clientRequestId: null,
          parentMessageId: userMessageId,
          provider: 'qwen',
          model: 'qwen-e2e-fallback-model',
        },
        replayed: false,
        modelSelection: {
          requestedModelId: 'deepseek',
          effectiveModelId: 'deepseek',
          status: 'normal',
          currency: 'CNY',
          spent: 1,
          budget: 10,
          usageRatio: 0.1,
        },
        providerFailover: {
          fromModelId: 'deepseek',
          toModelId: 'qwen',
          reason: 'timeout',
        },
      })
    }

    if (
      url.pathname === `/api/v1/conversations/${conversationId}/messages` &&
      request.method() === 'GET'
    ) {
      return fulfillJson(route, {
        items: [],
        meta: { page: 1, pageSize: 100, total: 0, totalPages: 0, hasNextPage: false },
      })
    }

    return fulfillJson(route, { code: 'E2E_ROUTE_NOT_MOCKED' }, 404)
  })

  await page.goto('/assistant')
  await expect(page.getByRole('heading', { name: '客服知识辅助', level: 2 })).toBeVisible()
  await page.locator('.ai-model-selector .el-select__wrapper').click()
  await page.getByText('DeepSeek', { exact: true }).last().click()

  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('ai-admin-web:selected-model-id')))
    .toBe('deepseek')

  await page
    .getByPlaceholder('输入客户问题或需要查询的业务事项，Enter 发送，Shift + Enter 换行')
    .fill('设备无法联网怎么办？')
  await page.getByRole('button', { name: '发送问题' }).click()

  await expect
    .poll(() => sentMessageBody)
    .toMatchObject({
      content: '设备无法联网怎么办？',
      mode: 'standard',
      modelId: 'deepseek',
    })
  await expect(page.getByText('DeepSeek发生响应超时，本次已自动切换为 千问')).toBeVisible()
})

test('模型用量页展示 Token、费用和预算进度', async ({ page }) => {
  await useMockSession(page)

  await page.route('**/api/v1/ai/usage/summary*', (route) =>
    fulfillJson(route, {
      month: '2026-08',
      timeZone: 'Asia/Shanghai',
      budgetPolicy: { warningRatio: 0.8, fallbackRatio: 1, autoFallbackEnabled: true },
      totals: {
        callCount: 12,
        inputTokens: 24000,
        outputTokens: 6000,
        totalTokens: 30000,
        cachedInputTokens: 4000,
        reasoningOutputTokens: 1000,
      },
      costs: [{ currency: 'CNY', amount: 8.2, budget: 10, usageRatio: 0.82 }],
      byModel: [
        {
          provider: 'qwen',
          model: 'qwen-e2e-model',
          callCount: 12,
          inputTokens: 24000,
          outputTokens: 6000,
          totalTokens: 30000,
          cachedInputTokens: 4000,
          reasoningOutputTokens: 1000,
          cost: { currency: 'CNY', amount: 8.2 },
        },
      ],
      daily: [],
    }),
  )

  await page.goto('/ai-usage')

  await expect(page.getByRole('heading', { name: '我的模型用量', level: 2 })).toBeVisible()
  await expect(page.getByLabel('用量概览').getByText('30,000')).toBeVisible()
  await expect(page.getByText('人民币费用')).toBeVisible()
  await expect(page.getByText('月度预算即将达到预警线')).toBeVisible()
  await expect(page.getByText('qwen-e2e-model')).toBeVisible()
})

test('模型健康页展示熔断状态并发送测试告警', async ({ page }) => {
  await useMockSession(page)

  let alertBody: Record<string, unknown> | null = null
  const report = {
    period: { days: 7, from: '2026-08-08', to: '2026-08-14', timeZone: 'Asia/Shanghai' },
    totals: {
      requests: 20,
      successes: 18,
      failures: 2,
      successRate: 0.9,
      averageDurationMs: 1200,
      failovers: 2,
    },
    models: [
      {
        modelId: 'qwen',
        provider: 'qwen',
        displayName: '千问（阿里云百炼）',
        status: 'degraded',
        circuitOpen: true,
        circuitRetryAfterSeconds: 42,
        requests: 20,
        successes: 18,
        failures: 2,
        successRate: 0.9,
        averageDurationMs: 1200,
        failovers: 2,
        timeoutCount: 2,
        rateLimitCount: 0,
        unavailableCount: 0,
        providerErrorCount: 0,
        failoverOutCount: 2,
        failoverInCount: 0,
        lastActivityDate: '2026-08-14',
      },
    ],
    daily: [],
    incidents: [],
    alertDeliveries: [],
  }

  await page.route('**/api/v1/ai/health/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/v1/ai/health/summary') return fulfillJson(route, report)
    if (url.pathname === '/api/v1/ai/health/alerts/test') {
      alertBody = request.postDataJSON() as Record<string, unknown>
      return fulfillJson(route, {
        status: 'delivered',
        channel: 'generic',
        statusCode: 204,
        failureReason: null,
        incidentType: 'circuit_opened',
        modelId: 'qwen',
      })
    }
    return fulfillJson(route, { code: 'E2E_ROUTE_NOT_MOCKED' }, 404)
  })

  await page.goto('/model-health')

  await expect(page.getByRole('heading', { name: '模型健康与故障切换', level: 2 })).toBeVisible()
  await expect(page.getByText('熔断中')).toBeVisible()
  await expect(page.getByText(/约 42 秒后自动试探恢复/)).toBeVisible()
  await page.getByRole('button', { name: '发送测试告警' }).click()

  await expect
    .poll(() => alertBody)
    .toEqual({
      modelId: 'qwen',
      type: 'circuit_opened',
    })
  await expect(page.getByText('测试告警已成功投递')).toBeVisible()
})

if (managerCredentialsConfigured)
  test.describe('管理员业务链路', () => {
    test('真实登录后逐页加载全部运营模块且没有服务端错误', async ({ page }) => {
      const serverFailures: string[] = []
      page.on('response', (response) => {
        if (response.url().includes('/api/v1/') && response.status() >= 500) {
          serverFailures.push(
            `${response.status()} ${response.request().method()} ${response.url()}`,
          )
        }
      })

      await login(page, managerEmail!, managerPassword!)

      for (const item of businessPages) {
        await page.goto(item.path)
        await expect(page.getByRole('heading', { name: item.pageTitle, level: 1 })).toBeVisible()
        await expect(page.getByRole('heading', { name: item.contentTitle, level: 2 })).toBeVisible()
        await expect(page.locator('.el-alert--error')).toHaveCount(0)
      }

      expect(serverFailures).toEqual([])
    })

    test('移动端宽度下系统配置与知识辅助页不产生页面级横向溢出', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await login(page, managerEmail!, managerPassword!)
      await page.goto('/settings')

      await expect(page.getByRole('heading', { name: '系统配置', level: 2 })).toBeVisible()
      await expect(page.locator('.settings-summary-grid article')).toHaveCount(4)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)

      await page.goto('/assistant')
      await expect(page.getByRole('heading', { name: '客服知识辅助', level: 2 })).toBeVisible()
      const assistantOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(assistantOverflow).toBeLessThanOrEqual(1)
    })
  })

if (supportCredentialsConfigured)
  test.describe('客服权限边界', () => {
    test('客服可以访问授权知识库，但管理页面在路由层被拦截', async ({ page }) => {
      await login(page, supportEmail!, supportPassword!)

      await page.goto('/knowledge-bases')
      await expect(page.getByRole('heading', { name: '知识库', level: 2 })).toBeVisible()
      await expect(page.getByRole('table').last().getByRole('row')).toHaveCount(1)
      await expect(page.getByRole('menuitem', { name: '企业管理' })).toHaveCount(0)
      await expect(page.getByRole('menuitem', { name: '系统配置' })).toHaveCount(0)

      await page.goto('/settings')
      await expect(page).toHaveURL(/\/forbidden\?reason=denied/)
      await expect(page.getByText('无权访问此页面')).toBeVisible()
    })

    test('客服工作台只加载受控上下文且不会自动生成或发送', async ({ page }) => {
      await login(page, supportEmail!, supportPassword!)
      const conversationId = '10000000-0000-4000-8000-000000000001'
      const userMessageId = '10000000-0000-4000-8000-000000000002'
      const assistantMessageId = '10000000-0000-4000-8000-000000000003'
      const createdAt = '2026-08-13T00:00:00.000Z'
      await page.route('**/api/v1/conversations', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        const body = route.request().postDataJSON() as {
          knowledgeBaseId: string
          title?: string
        }
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            id: conversationId,
            title: body.title ?? null,
            knowledgeBaseId: body.knowledgeBaseId,
            createdAt,
            updatedAt: createdAt,
          }),
        })
      })
      await page.route(`**/api/v1/conversations/${conversationId}/messages`, async (route) => {
        const body = route.request().postDataJSON() as { clientRequestId: string; content: string }
        const baseMessage = {
          status: 'COMPLETED',
          providerResponseId: null,
          usage: null,
          errorCode: null,
          createdAt,
          updatedAt: createdAt,
        }
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            userMessage: {
              ...baseMessage,
              id: userMessageId,
              position: 1,
              role: 'USER',
              content: body.content,
              clientRequestId: body.clientRequestId,
              parentMessageId: null,
              provider: null,
              model: null,
              finishReason: null,
              citations: null,
              structuredResponse: null,
            },
            assistantMessage: {
              ...baseMessage,
              id: assistantMessageId,
              position: 2,
              role: 'ASSISTANT',
              content: '请先确认设备指示灯和网络连接状态。',
              clientRequestId: null,
              parentMessageId: userMessageId,
              provider: 'openai',
              model: 'e2e-model',
              finishReason: 'stop',
              citations: [
                {
                  sourceId: 'CS-NET-001',
                  chunkId: '10000000-0000-4000-8000-000000000004',
                  documentId: '10000000-0000-4000-8000-000000000005',
                  documentName: '网络故障处理手册.md',
                  position: 1,
                  similarityScore: 0.91,
                },
              ],
              structuredResponse: {
                schemaVersion: '1.0',
                scenario: 'customer_service_assist',
                answer: '请先确认设备指示灯和网络连接状态。',
                steps: [],
                applicableConditions: [],
                riskWarnings: [],
                citations: ['CS-NET-001'],
                missingInformation: ['设备序列号'],
                refusalReason: null,
                customerService: {
                  customerFacingReply: '请先确认设备指示灯和网络连接状态。',
                  internalTroubleshooting: ['检查路由器与设备连接'],
                  followUpQuestions: ['当前指示灯是什么颜色？'],
                  escalationConditions: ['重启后仍然离线时升级二线'],
                  prohibitedCommitments: ['不要承诺立即修复'],
                },
              },
            },
            replayed: false,
          }),
        })
      })
      await page.evaluate(() => {
        const messageLog: unknown[] = []
        Object.assign(window, { __supportWorkbenchMessages: messageLog })
        window.addEventListener('message', (event) => messageLog.push(event.data))
        const panel = document.createElement('iframe')
        panel.id = 'support-workbench-panel'
        panel.src = '/support/embed'
        panel.style.cssText = 'position:fixed;inset:0;width:420px;height:760px;z-index:9999'
        document.body.append(panel)
      })

      const frame = page.frameLocator('#support-workbench-panel')
      await expect(frame.getByText('知识辅助', { exact: true })).toBeVisible()
      await expect(frame.getByText('人工确认模式')).toBeVisible()

      await page.locator('#support-workbench-panel').evaluate((element) => {
        const target = (element as HTMLIFrameElement).contentWindow
        target?.postMessage(
          {
            protocol: 'knowledge-assistant.support.v1',
            type: 'SET_CONTEXT',
            payload: {
              requestId: 'e2e-request-1',
              ticketId: 'CS-E2E-1001',
              customerQuestion: '设备无法联网怎么办？',
              productName: 'AirLink AP720',
              issueSummary: '重启后仍然离线',
            },
          },
          window.location.origin,
        )
      })

      await expect(frame.getByText('CS-E2E-1001')).toBeVisible()
      await expect(frame.getByText('设备无法联网怎么办？')).toBeVisible()
      await expect(
        frame.getByText('本面板只返回回复草稿，不会自动发送消息或执行业务操作。'),
      ).toBeVisible()
      await expect(frame.getByRole('button', { name: '生成知识建议' })).toBeEnabled()
      await expect(frame.getByText('建议对客回复')).toHaveCount(0)

      const messagesBeforeConfirmation = await page.evaluate(
        () =>
          (window as Window & { __supportWorkbenchMessages?: unknown[] })
            .__supportWorkbenchMessages,
      )
      expect(messagesBeforeConfirmation).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            protocol: 'knowledge-assistant.support.v1',
            type: 'READY',
            payload: expect.objectContaining({ automaticTicketCreate: false }),
          }),
          expect.objectContaining({
            protocol: 'knowledge-assistant.support.v1',
            type: 'CONTEXT_ACCEPTED',
            payload: { requestId: 'e2e-request-1', ticketId: 'CS-E2E-1001' },
          }),
        ]),
      )
      expect(
        messagesBeforeConfirmation?.some(
          (item) => (item as { type?: string }).type === 'TICKET_DRAFT_READY',
        ),
      ).toBe(false)

      await frame.getByRole('button', { name: '生成知识建议' }).click()
      await expect(frame.getByText('建议对客回复')).toBeVisible()
      await frame.getByRole('button', { name: '准备升级工单' }).click()
      await expect(frame.getByText('只向客服工作台返回结构化草稿')).toBeVisible()
      const confirmationCheckbox = frame.getByRole('checkbox', {
        name: '我已核对客户问题、升级条件、知识依据和禁止承诺',
      })
      await frame.getByText('我已核对客户问题、升级条件、知识依据和禁止承诺').click()
      await expect(confirmationCheckbox).toBeChecked()
      await frame.getByRole('button', { name: '确认返回工单草稿' }).click()

      await expect
        .poll(async () =>
          page.evaluate(() => {
            const messages = (window as Window & { __supportWorkbenchMessages?: unknown[] })
              .__supportWorkbenchMessages
            return messages?.find(
              (item) => (item as { type?: string }).type === 'TICKET_DRAFT_READY',
            )
          }),
        )
        .toMatchObject({
          protocol: 'knowledge-assistant.support.v1',
          type: 'TICKET_DRAFT_READY',
          payload: {
            requestId: 'e2e-request-1',
            ticketId: 'CS-E2E-1001',
            humanConfirmed: true,
            automaticCreate: false,
            draft: expect.objectContaining({
              schemaVersion: '1.0',
              assistantMessageId,
              customerQuestion: '设备无法联网怎么办？',
            }),
          },
        })
    })
  })

if (supportCredentialsConfigured)
  test.describe('员工知识问答端', () => {
    test('已登录员工从办公门户入口无感进入知识问答', async ({ page }) => {
      await login(page, supportEmail!, supportPassword!)
      await page.goto('/portal?target=knowledge&source=office-portal')

      await expect(page).toHaveURL(/\/ask$/)
      await expect(page.getByRole('heading', { name: '有问题，查知识。', level: 1 })).toBeVisible()
    })

    test('员工入口仅展示已授权知识库并支持移动端布局', async ({ page }) => {
      await login(page, supportEmail!, supportPassword!)
      await page.goto('/ask')

      await expect(page.getByRole('heading', { name: '有问题，查知识。', level: 1 })).toBeVisible()
      await expect(page.getByText('仅检索有权限资料')).toBeVisible()
      await expect(page.getByText('运营总览')).toHaveCount(0)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.reload()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  })
