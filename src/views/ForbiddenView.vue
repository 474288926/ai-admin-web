<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, SwitchButton } from '@element-plus/icons-vue'

import { defaultAuthenticatedPath } from '@/router/access-control'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const accessUnavailable = computed(() => route.query.reason === 'unavailable')
const title = computed(() => (accessUnavailable.value ? '权限信息暂不可用' : '无权访问此页面'))
const description = computed(() =>
  accessUnavailable.value
    ? '暂时无法读取企业角色，请检查服务状态后重试。'
    : '当前企业角色不包含此页面所需权限。',
)

async function retry(): Promise<void> {
  await authStore.ensureAccessProfile(true)
  if (!authStore.accessProfileError && typeof route.query.from === 'string') {
    await router.replace(route.query.from)
    return
  }
  await router.replace(defaultAuthenticatedPath(authStore.organizationRoles))
}

function returnToAvailablePage(): void {
  void router.replace(defaultAuthenticatedPath(authStore.organizationRoles))
}
</script>

<template>
  <section class="forbidden-page">
    <el-result icon="warning" :title="title" :sub-title="description">
      <template #extra>
        <el-button v-if="accessUnavailable" type="primary" :icon="Refresh" @click="retry">
          重新检查
        </el-button>
        <el-button v-else type="primary" :icon="SwitchButton" @click="returnToAvailablePage">
          返回可用页面
        </el-button>
      </template>
    </el-result>
  </section>
</template>

<style scoped>
.forbidden-page {
  display: grid;
  min-height: calc(100vh - 170px);
  place-items: center;
}
</style>
