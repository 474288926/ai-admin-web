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
  Operation,
  ChatDotRound,
  Setting,
  SwitchButton,
  UploadFilled,
} from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const collapsed = ref(false)

const pageTitle = computed(() => String(route.meta.title ?? '运营管理'))
const userName = computed(() => authStore.user?.name || authStore.user?.email || '知识管理员')

const menuItems = [
  { path: '/dashboard', label: '运营总览', icon: House },
  { path: '/assistant', label: '知识辅助', icon: ChatDotRound },
  { path: '/knowledge-bases', label: '知识库管理', icon: Collection },
  { path: '/documents', label: '文档管理', icon: Document },
  { path: '/document-sources', label: '企业文档同步', icon: Connection },
  { path: '/ingestion', label: '处理任务', icon: UploadFilled },
  { path: '/retrieval', label: '检索调试', icon: Operation },
  { path: '/quality', label: '质量分析', icon: DataAnalysis },
  { path: '/evaluations', label: '评测中心', icon: Histogram },
  { path: '/settings', label: '系统配置', icon: Setting },
]

async function handleLogout(): Promise<void> {
  await authStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed }">
    <aside class="app-sidebar">
      <div class="brand">
        <span class="brand-mark">知</span>
        <div v-if="!collapsed" class="brand-copy">
          <strong>知识库智能助手</strong>
          <span>运营管理端</span>
        </div>
      </div>

      <el-menu :default-active="route.path" router class="app-menu" :collapse="collapsed">
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <button class="collapse-button" type="button" @click="collapsed = !collapsed">
        <el-icon :class="{ rotated: collapsed }"><Fold /></el-icon>
        <span v-if="!collapsed">收起导航</span>
      </button>
    </aside>

    <div class="app-main">
      <header class="app-header">
        <div>
          <span class="eyebrow">KNOWLEDGE OPERATIONS</span>
          <h1>{{ pageTitle }}</h1>
        </div>
        <el-dropdown trigger="click">
          <button class="user-button" type="button">
            <span class="user-avatar">{{ userName.slice(0, 1).toUpperCase() }}</span>
            <span class="user-name">{{ userName }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :icon="SwitchButton" @click="handleLogout"
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
