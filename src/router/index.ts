import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/auth/oidc/callback',
    name: 'oidc-callback',
    component: () => import('@/views/OidcCallbackView.vue'),
    meta: { public: true, title: '企业登录' },
  },
  {
    path: '/portal',
    name: 'portal-entry',
    component: () => import('@/views/PortalEntryView.vue'),
    meta: { public: true, title: '企业知识入口' },
  },
  {
    path: '/ask',
    name: 'employee-assistant',
    component: () => import('@/views/EmployeeAssistantView.vue'),
    meta: { title: '知识问答', description: '查询内部制度、产品文档和操作手册。' },
  },
  {
    path: '/support/embed',
    name: 'support-workbench-embed',
    component: () => import('@/views/SupportWorkbenchEmbedView.vue'),
    meta: { title: '客服知识辅助', description: '嵌入客服工作台的人工确认知识辅助面板。' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: '运营总览' },
      },
      {
        path: 'assistant',
        name: 'assistant',
        component: () => import('@/views/AssistantView.vue'),
        meta: { title: '知识辅助', description: '基于授权知识库为客服提供可追溯的回答建议。' },
      },
      {
        path: 'knowledge-bases',
        name: 'knowledge-bases',
        component: () => import('@/views/KnowledgeBasesView.vue'),
        meta: { title: '知识库管理', description: '维护知识库、成员范围与共享权限。' },
      },
      {
        path: 'knowledge-bases/:knowledgeBaseId/grants',
        name: 'knowledge-base-grants',
        component: () => import('@/views/KnowledgeBaseGrantsView.vue'),
        meta: { title: '知识库权限', description: '配置用户、部门和用户组的访问权限。' },
      },
      {
        path: 'documents',
        name: 'documents',
        component: () => import('@/views/DocumentsView.vue'),
        meta: { title: '文档管理', description: '上传、更新、发布和下架知识文档。' },
      },
      {
        path: 'document-sources',
        name: 'document-sources',
        component: () => import('@/views/DocumentSourcesView.vue'),
        meta: { title: '企业文档同步', description: '管理企业文档源及增量同步记录。' },
      },
      {
        path: 'ingestion',
        name: 'ingestion',
        component: () => import('@/views/IngestionView.vue'),
        meta: { title: '处理任务', description: '查看解析、切片、向量化进度并处理失败任务。' },
      },
      {
        path: 'retrieval',
        name: 'retrieval',
        component: () => import('@/views/RetrievalView.vue'),
        meta: { title: '检索调试', description: '分析向量、关键词、融合与重排阶段的召回结果。' },
      },
      {
        path: 'quality',
        name: 'quality',
        component: () => import('@/views/QualityView.vue'),
        meta: { title: '质量分析', description: '跟踪点踩、未命中、高频问题和引用质量。' },
      },
      {
        path: 'ai-usage',
        name: 'ai-usage',
        component: () => import('@/views/AiUsageView.vue'),
        meta: { title: '模型用量', description: '查看我的模型调用、Token 与月度预算使用情况。' },
      },
      {
        path: 'model-health',
        name: 'model-health',
        component: () => import('@/views/ModelHealthView.vue'),
        meta: { title: '模型健康', description: '查看模型成功率、响应耗时和故障切换情况。' },
      },
      {
        path: 'evaluations',
        name: 'evaluations',
        component: () => import('@/views/EvaluationsView.vue'),
        meta: { title: '评测中心', description: '运行固定评测集并对比历史质量基线。' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '系统配置', description: '安全查看模型、Prompt 与运营参数。' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  authStore.hydrate()

  if (!to.meta.public && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }

  document.title = `${String(to.meta.title ?? '管理端')} · 知识库智能助手`
  return true
})

export default router
