import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  createDocumentSource,
  listDocumentSources,
  synchronizeDocumentSource,
} from '@/services/api/document-sources'

const knowledgeBaseId = '11111111-1111-4111-8111-111111111111'
const sourceId = '22222222-2222-4222-8222-222222222222'
const now = '2026-08-13T01:00:00.000Z'
const source = {
  id: sourceId,
  knowledgeBaseId,
  name: '制度共享盘',
  type: 'LOCAL_DIRECTORY',
  rootPath: 'D:\\enterprise-docs',
  enabled: true,
  recursive: true,
  lastSyncedAt: null,
  lastRunStatus: null,
  createdAt: now,
  updatedAt: now,
  _count: { items: 0, runs: 0 },
  runs: [],
}

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('企业文档源 API', () => {
  it('读取并校验文档源列表', async () => {
    server.use(
      http.get(`/api/v1/knowledge-bases/${knowledgeBaseId}/document-sources`, () =>
        HttpResponse.json([source]),
      ),
    )

    await expect(listDocumentSources(knowledgeBaseId)).resolves.toEqual([source])
  })

  it('创建目录数据源时发送受控字段', async () => {
    server.use(
      http.post(
        `/api/v1/knowledge-bases/${knowledgeBaseId}/document-sources`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            name: '制度共享盘',
            rootPath: 'D:\\enterprise-docs',
            recursive: true,
          })
          return HttpResponse.json(source)
        },
      ),
    )

    await expect(
      createDocumentSource(knowledgeBaseId, {
        name: '制度共享盘',
        rootPath: 'D:\\enterprise-docs',
        recursive: true,
      }),
    ).resolves.toMatchObject({ id: sourceId })
  })

  it('解析增量同步摘要和失败明细', async () => {
    server.use(
      http.post(
        `/api/v1/knowledge-bases/${knowledgeBaseId}/document-sources/${sourceId}/sync`,
        () =>
          HttpResponse.json({
            id: '33333333-3333-4333-8333-333333333333',
            status: 'PARTIALLY_SUCCEEDED',
            summary: {
              discovered: 3,
              created: 1,
              updated: 1,
              unchanged: 0,
              missing: 1,
              failed: 1,
            },
            errors: [{ externalId: 'bad.pdf', code: 'DOCUMENT_FILE_CONTENT_INVALID' }],
            startedAt: now,
            finishedAt: now,
            createdAt: now,
          }),
      ),
    )

    const run = await synchronizeDocumentSource(knowledgeBaseId, sourceId)
    expect(run.status).toBe('PARTIALLY_SUCCEEDED')
    expect(run.summary.updated).toBe(1)
    expect(run.errors[0]?.externalId).toBe('bad.pdf')
  })
})
