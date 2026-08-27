import { describe, expect, it } from 'vitest'

import {
  knowledgeBacklogCandidateGenerationRoute,
  knowledgeBacklogReturnRoute,
  readKnowledgeBacklogWorkflow,
  requestedVerificationSuiteId,
} from '@/utils/knowledge-backlog-workflow'

const knowledgeBaseId = '03c7a80e-c672-41f0-8b9c-cfb915eabe4c'
const backlogItemId = '1d8a3787-d6f7-49dc-992f-849c1add3362'
const documentId = 'e9cb552d-2eb4-4c96-8a12-b0f26efc51af'
const suiteId = '9b148f19-fd93-4c74-be98-35fa2008efc8'

describe('knowledge backlog workflow navigation', () => {
  it('keeps the backlog context while opening candidate generation', () => {
    expect(
      knowledgeBacklogCandidateGenerationRoute({ knowledgeBaseId, backlogItemId, documentId }),
    ).toEqual({
      name: 'evaluations',
      query: {
        workflow: 'knowledge-backlog',
        knowledgeBaseId,
        backlogItemId,
        candidateDocumentId: documentId,
      },
    })
  })

  it('returns the published suite to the original backlog item', () => {
    const context = { knowledgeBaseId, backlogItemId }
    expect(knowledgeBacklogReturnRoute(context, suiteId)).toEqual({
      name: 'quality',
      query: {
        workflow: 'knowledge-backlog',
        knowledgeBaseId,
        backlogItemId,
        backlogStatus: 'ALL',
        verificationSuiteId: suiteId,
      },
    })
    expect(
      requestedVerificationSuiteId({
        workflow: 'knowledge-backlog',
        knowledgeBaseId,
        backlogItemId,
        verificationSuiteId: suiteId,
      }),
    ).toBe(suiteId)
  })

  it('ignores incomplete or ambiguous workflow query values', () => {
    expect(
      readKnowledgeBacklogWorkflow({ workflow: 'knowledge-backlog', knowledgeBaseId }),
    ).toBeNull()
    expect(
      readKnowledgeBacklogWorkflow({
        workflow: ['knowledge-backlog'],
        knowledgeBaseId,
        backlogItemId,
      }),
    ).toBeNull()
    expect(requestedVerificationSuiteId({ verificationSuiteId: suiteId })).toBeNull()
  })
})
