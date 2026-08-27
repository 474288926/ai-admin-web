import type { LocationQuery, RouteLocationRaw } from 'vue-router'

const KNOWLEDGE_BACKLOG_WORKFLOW = 'knowledge-backlog'

export interface KnowledgeBacklogWorkflowContext {
  knowledgeBaseId: string
  backlogItemId: string
}

function singleQueryValue(value: LocationQuery[string] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function knowledgeBacklogCandidateGenerationRoute(input: {
  knowledgeBaseId: string
  backlogItemId: string
  documentId: string
}): RouteLocationRaw {
  return {
    name: 'evaluations',
    query: {
      workflow: KNOWLEDGE_BACKLOG_WORKFLOW,
      knowledgeBaseId: input.knowledgeBaseId,
      backlogItemId: input.backlogItemId,
      candidateDocumentId: input.documentId,
    },
  }
}

export function readKnowledgeBacklogWorkflow(
  query: LocationQuery,
): KnowledgeBacklogWorkflowContext | null {
  if (singleQueryValue(query.workflow) !== KNOWLEDGE_BACKLOG_WORKFLOW) return null
  const knowledgeBaseId = singleQueryValue(query.knowledgeBaseId)
  const backlogItemId = singleQueryValue(query.backlogItemId)
  return knowledgeBaseId && backlogItemId ? { knowledgeBaseId, backlogItemId } : null
}

export function knowledgeBacklogReturnRoute(
  context: KnowledgeBacklogWorkflowContext,
  verificationSuiteId?: string,
): RouteLocationRaw {
  return {
    name: 'quality',
    query: {
      workflow: KNOWLEDGE_BACKLOG_WORKFLOW,
      knowledgeBaseId: context.knowledgeBaseId,
      backlogItemId: context.backlogItemId,
      backlogStatus: 'ALL',
      ...(verificationSuiteId ? { verificationSuiteId } : {}),
    },
  }
}

export function requestedVerificationSuiteId(query: LocationQuery): string | null {
  return readKnowledgeBacklogWorkflow(query) ? singleQueryValue(query.verificationSuiteId) : null
}
