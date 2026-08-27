<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Connection, WarningFilled } from '@element-plus/icons-vue'

import { parseExternalLinkTarget } from '@/utils/external-links'

const route = useRoute()
const router = useRouter()
const target = computed(() => parseExternalLinkTarget(route.query.target))

function continueToExternalSite(): void {
  if (target.value) window.location.replace(target.value.url)
}

function cancel(): void {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    void router.replace('/')
  }
}
</script>

<template>
  <main class="external-link-warning-page">
    <section class="external-link-warning-card">
      <div class="external-link-warning-icon">
        <el-icon><WarningFilled /></el-icon>
      </div>
      <template v-if="target">
        <span class="eyebrow">EXTERNAL LINK</span>
        <h1>即将访问非白名单地址</h1>
        <p>此网站或 IP 地址不属于知识助手维护的可信白名单，内容和安全性由外部站点负责。</p>
        <div class="external-link-target">
          <el-icon><Connection /></el-icon>
          <div>
            <span>目标地址</span><strong>{{ target.hostname }}</strong
            ><code>{{ target.url }}</code>
          </div>
        </div>
        <ul>
          <li>确认域名或 IP 与你的业务目标一致。</li>
          <li>不要输入企业密码、验证码、密钥或其他敏感信息。</li>
          <li>如浏览器或安全软件继续告警，请停止访问并联系管理员。</li>
        </ul>
        <div class="external-link-warning-actions">
          <el-button @click="cancel">取消访问</el-button>
          <el-button type="danger" @click="continueToExternalSite">确认风险并继续</el-button>
        </div>
      </template>
      <template v-else>
        <span class="eyebrow">INVALID LINK</span>
        <h1>目标地址无效</h1>
        <p>只允许访问不包含账号凭据的 HTTP 或 HTTPS 域名和 IPv4 地址。</p>
        <el-button type="primary" @click="cancel">返回</el-button>
      </template>
    </section>
  </main>
</template>

<style scoped>
.external-link-warning-page {
  display: grid;
  min-height: 100vh;
  padding: 32px 18px;
  place-items: center;
  background:
    radial-gradient(circle at top left, rgba(238, 166, 68, 0.15), transparent 34%), #f5f7fb;
}
.external-link-warning-card {
  width: min(620px, 100%);
  padding: 36px;
  border: 1px solid #e5e9f0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 18px 50px rgba(39, 51, 73, 0.12);
}
.external-link-warning-icon {
  display: grid;
  width: 52px;
  height: 52px;
  margin-bottom: 20px;
  place-items: center;
  border-radius: 14px;
  color: #c56d16;
  background: #fff0dc;
  font-size: 26px;
}
.external-link-warning-card h1 {
  margin: 7px 0 12px;
  color: #27354a;
  font-size: 25px;
}
.external-link-warning-card > p,
.external-link-warning-card li {
  color: #68758a;
  font-size: 13px;
  line-height: 1.8;
}
.external-link-target {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 22px 0;
  padding: 14px;
  border: 1px solid #f0d2ad;
  border-radius: 10px;
  color: #b66719;
  background: #fffaf3;
}
.external-link-target > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.external-link-target span {
  color: #9b754c;
  font-size: 10px;
}
.external-link-target strong {
  color: #5f482f;
}
.external-link-target code {
  overflow-wrap: anywhere;
  color: #7c6246;
  font-size: 11px;
}
.external-link-warning-card ul {
  margin: 0 0 24px;
  padding-left: 20px;
}
.external-link-warning-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
@media (max-width: 560px) {
  .external-link-warning-card {
    padding: 26px 20px;
  }
  .external-link-warning-actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }
}
</style>
