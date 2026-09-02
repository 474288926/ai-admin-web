<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Collection,
  Connection,
  DataAnalysis,
  Document,
  Fold,
  Histogram,
  House,
  Menu as MenuIcon,
  Monitor,
  OfficeBuilding,
  Operation,
  ChatDotRound,
  Coin,
  Setting,
  Stamp,
  SwitchButton,
  Tickets,
  UploadFilled,
} from '@element-plus/icons-vue'

import { canAccessCapability, highestRoleLabel, type AppCapability } from '@/router/access-control'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const collapsed = ref(false)
const mobileNavigationOpen = ref(false)

const userName = computed(() => authStore.user?.name || authStore.user?.email || '知识管理员')
const currentRoleLabel = computed(() => highestRoleLabel(authStore.organizationRoles))

const menuItems: Array<{
  path: string
  label: string
  icon: typeof House
  capability?: AppCapability
}> = [
  { path: '/dashboard', label: '运营总览', icon: House, capability: 'operations:view' },
  {
    path: '/organization',
    label: '企业管理',
    icon: OfficeBuilding,
  },
  {
    path: '/organization/audit',
    label: '操作审计',
    icon: Tickets,
    capability: 'organization:audit',
  },
  { path: '/assistant', label: '知识辅助', icon: ChatDotRound, capability: 'assistant:use' },
  {
    path: '/knowledge-bases',
    label: '知识库管理',
    icon: Collection,
    capability: 'knowledge:view',
  },
  { path: '/documents', label: '文档管理', icon: Document, capability: 'knowledge:manage' },
  {
    path: '/document-sources',
    label: '企业文档同步',
    icon: Connection,
    capability: 'knowledge:manage',
  },
  {
    path: '/ingestion',
    label: '处理任务',
    icon: UploadFilled,
    capability: 'knowledge:manage',
  },
  { path: '/retrieval', label: '检索调试', icon: Operation, capability: 'knowledge:manage' },
  { path: '/quality', label: '质量分析', icon: DataAnalysis, capability: 'knowledge:manage' },
  { path: '/ai-usage', label: '模型用量', icon: Coin },
  { path: '/model-health', label: '模型健康', icon: Monitor, capability: 'system:view' },
  {
    path: '/evaluations',
    label: '评测中心',
    icon: Histogram,
    capability: 'knowledge:manage',
  },
  {
    path: '/approvals',
    label: '知识审批',
    icon: Stamp,
    capability: 'knowledge:manage',
  },
  { path: '/settings', label: '系统配置', icon: Setting, capability: 'system:view' },
]
const visibleMenuItems = computed(() =>
  menuItems.filter((item) => canAccessCapability(item.capability, authStore.organizationRoles)),
)

async function handleLogout(): Promise<void> {
  await authStore.logout()
  await router.replace({ name: 'login' })
}

function openMobileNavigation(): void {
  collapsed.value = false
  mobileNavigationOpen.value = true
}

function closeMobileNavigation(): void {
  mobileNavigationOpen.value = false
}
</script>

<template>
  <div
    class="app-shell"
    :class="{ 'is-collapsed': collapsed }"
    @keydown.esc="closeMobileNavigation"
  >
    <aside
      id="app-navigation"
      class="app-sidebar"
      :class="{ 'is-mobile-open': mobileNavigationOpen }"
    >
      <div class="brand">
        <span class="brand-mark">知</span>
        <div v-if="!collapsed" class="brand-copy">
          <strong>知识库智能助手</strong>
          <span>运营管理端</span>
        </div>
      </div>

      <el-menu
        :default-active="route.path"
        router
        class="app-menu"
        :collapse="collapsed"
        @select="closeMobileNavigation"
      >
        <el-menu-item v-for="item in visibleMenuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <button class="collapse-button" type="button" @click="collapsed = !collapsed">
        <el-icon :class="{ rotated: collapsed }"><Fold /></el-icon>
        <span v-if="!collapsed">收起导航</span>
      </button>
    </aside>

    <button
      v-if="mobileNavigationOpen"
      class="mobile-navigation-backdrop"
      type="button"
      aria-label="关闭导航"
      @click="closeMobileNavigation"
    />

    <div class="app-main">
      <header class="app-header">
        <button
          class="mobile-menu-button"
          type="button"
          aria-label="打开导航"
          aria-controls="app-navigation"
          :aria-expanded="mobileNavigationOpen"
          title="打开导航"
          @click="openMobileNavigation"
        >
          <el-icon><MenuIcon /></el-icon>
        </button>
        <div class="app-header-context" aria-label="当前工作区">
          <span class="app-header-context-icon">
            <el-icon><Operation /></el-icon>
          </span>
          <div>
            <strong>知识运营工作台</strong>
            <small>KNOWLEDGE OPERATIONS</small>
          </div>
        </div>
        <el-dropdown trigger="click">
          <button class="user-button" type="button">
            <span class="user-avatar">{{ userName.slice(0, 1).toUpperCase() }}</span>
            <span class="user-name">{{ userName }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ currentRoleLabel }}</el-dropdown-item>
              <el-dropdown-item divided :icon="SwitchButton" @click="handleLogout"
                >退出登录</el-dropdown-item
              >
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main class="page-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>
