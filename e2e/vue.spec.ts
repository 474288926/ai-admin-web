import { expect, test, type Page } from '@playwright/test'

const managerEmail = process.env.E2E_MANAGER_EMAIL
const managerPassword = process.env.E2E_MANAGER_PASSWORD
const supportEmail = process.env.E2E_SUPPORT_EMAIL
const supportPassword = process.env.E2E_SUPPORT_PASSWORD

const managerCredentialsConfigured = Boolean(managerEmail && managerPassword)
const supportCredentialsConfigured = Boolean(supportEmail && supportPassword)

const businessPages = [
  { path: '/dashboard', pageTitle: '运营总览', contentTitle: '运营基座已经就绪' },
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
    test('客服可以访问授权知识库，但系统配置接口明确拒绝访问', async ({ page }) => {
      await login(page, supportEmail!, supportPassword!)

      await page.goto('/knowledge-bases')
      await expect(page.getByRole('heading', { name: '知识库', level: 2 })).toBeVisible()
      await expect(page.getByRole('table').last().getByRole('row')).toHaveCount(1)

      await page.goto('/settings')
      await expect(page.getByText('无法读取系统配置')).toBeVisible()
      await expect(page.getByText('仅组织管理员可查看系统运行配置')).toBeVisible()
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
