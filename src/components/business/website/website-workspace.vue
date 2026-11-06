<template>
  <view class="portal-workspace" :class="{ 'sidebar-collapsed': collapsed }">
    <aside class="portal-rail" aria-label="账户导航">
      <AnimatedAvatar :size="48" />
      <BaseButton
        variant="quiet"
        icon="menu"
        icon-only
        :label="collapsed ? '展开侧栏' : '收起侧栏'"
        :aria-expanded="!collapsed"
        @tap="collapsed = !collapsed"
      />
      <BaseButton
        v-for="item in navigation"
        :key="item.id"
        class="rail-control"
        variant="quiet"
        :icon="item.icon"
        :label="item.label"
        :selected="panel === item.id"
        :icon-only="collapsed"
        :title="item.label"
        @tap="panel = item.id"
        >{{ item.label }}</BaseButton
      >
      <BaseButton
        class="rail-settings"
        variant="quiet"
        icon="equal"
        :label="t('nav.settings')"
        :title="t('nav.settings')"
        :icon-only="collapsed"
        :selected="panel === 'settings'"
        @tap="panel = 'settings'"
        >{{ t('nav.settings') }}</BaseButton
      >
      <BaseButton
        v-if="signedIn"
        class="rail-logout"
        variant="quiet"
        icon="arrow-left"
        label="退出登录"
        :icon-only="collapsed"
        title="退出登录"
        :disabled="leaving"
        @tap="logout"
        >退出登录</BaseButton
      >
      <BaseButton
        v-else
        class="rail-logout"
        variant="quiet"
        icon="arrow-right"
        :icon-only="collapsed"
        label="登录账户"
        title="登录账户"
        @tap="emit('login')"
        >登录账户</BaseButton
      >
    </aside>
    <main class="portal-main">
      <header class="portal-header">
        <a href="#" class="portal-wordmark" aria-label="返回官网" @click.prevent="emit('home')">Yozi AI</a
        ><AnimatedAvatar :size="56" :business="avatarBusiness" />
      </header>
      <section v-if="panel === 'progress'" class="portal-content">
        <h1>你的学习，<br />有迹可循。</h1>
        <view class="portal-toolbar"
          ><text>查看 App 已同步的学习记录</text
          ><BaseButton variant="quiet" icon="refresh" :loading="loading" loading-text="正在刷新" @tap="reload"
            >刷新数据</BaseButton
          ></view
        >
        <view v-if="status" class="portal-empty" role="status"
          ><text>{{ status }}</text
          ><BaseButton v-if="!signedIn" variant="secondary" @tap="emit('login')">登录后查看</BaseButton
          ><BaseButton v-if="failed" variant="secondary" @tap="reload">重试</BaseButton></view
        >
        <template v-if="progress?.hasRecords && !status">
          <view class="portal-metrics"
            ><article v-for="metric in metrics" :key="metric.label">
              <text>{{ metric.label }}</text
              ><strong>{{ metric.value }}</strong>
            </article></view
          >
          <article class="portal-activity">
            <h2>最近七天</h2>
            <view class="portal-bars" aria-label="最近七天的已保存活动"
              ><view v-for="day in progress.days" :key="day.day" class="portal-day"
                ><text>{{ day.count }}</text
                ><view
                  class="portal-bar"
                  :style="{ height: Math.max(3, (day.count / maxActivity) * 120) + 'px' }"
                /><text>{{ day.day.slice(5) }}</text></view
              ></view
            ><text>{{ progress.timezone }} · 仅统计已保存的活动</text>
          </article>
          <view class="portal-note"
            ><text>写作反馈为 AI 评估，熟悉度由本人记录。</text
            ><text v-if="progress.daysToExam !== null">距离考试还有 {{ progress.daysToExam }} 天</text></view
          >
        </template>
        <ProgressOverview v-if="progress && !loading && !failed" :model="progress.learningProgress" :openable="false" />
      </section>
      <section v-else-if="panel === 'downloads'" class="portal-content">
        <h1>在 Mac 上，<br />继续学习。</h1>
        <p>每日练习、写作带练与复习，在 App 中完成。目前仅提供 macOS 版。</p>
        <article class="portal-download">
          <AnimatedAvatar :size="64" /><view
            ><h2>Yozi AI {{ MAC_DOWNLOAD.version }}</h2>
            <text>{{ MAC_DOWNLOAD.platform }}</text></view
          ><a class="portal-download-link" :href="MAC_DOWNLOAD.url" download>下载 Mac 版</a>
        </article>
      </section>
      <section v-else-if="panel === 'settings'" class="portal-content portal-settings">
        <h1>{{ t('nav.settings') }}</h1>
        <BaseButton variant="quiet" @tap="policy('privacy')">隐私政策</BaseButton>
        <BaseButton variant="quiet" @tap="policy('terms')">用户协议</BaseButton>
      </section>
      <section v-else class="portal-content">
        <h1>你的账户，<br />你的学习记录。</h1>
        <p>官网仅展示当前账户已同步的记录。在 App 中继续学习并同步后，可在这里查看。</p>
        <BaseButton variant="secondary" @tap="panel = 'downloads'">下载 APP</BaseButton
        ><view class="portal-policies"
          ><BaseButton variant="quiet" @tap="policy('privacy')">隐私政策</BaseButton
          ><BaseButton variant="quiet" @tap="policy('terms')">用户协议</BaseButton></view
        >
      </section>
    </main>
  </view>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import BaseButton from '@/components/base/base-button/base-button.vue';
import ProgressOverview from '@/components/business/learning/progress/progress-overview.vue';
import { t } from '@/i18n/index.js';
import '@/i18n/muse.js';
import AnimatedAvatar from '@/components/base/animated-avatar/animated-avatar.vue';
import { captureSession, checkSession } from '@/services/auth-storage.js';
import { readLearningSnapshot } from '@/services/learning/learning-sync.js';
import { websiteProgress } from '@/services/learning/website-progress.js';
import { MAC_DOWNLOAD } from '@/config/website.js';
import { useUserStore } from '@/stores';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import config from '@/config';
import { storageService } from '@/services/storageService.js';
const props = defineProps({ signedIn: Boolean });
const emit = defineEmits(['signed-out', 'login', 'home']);
const panel = ref('progress'),
  collapsed = ref(true),
  completionId = ref(null),
  progress = ref(null),
  loading = ref(false),
  leaving = ref(false),
  status = ref(''),
  failed = ref(false);
const avatarBusiness = computed(() => ({
  busy: loading.value,
  completed: Boolean(completionId.value),
  completionId: completionId.value,
  waiting: failed.value
}));
const navigation = [
  { id: 'progress', label: '学习数据', icon: 'chart' },
  { id: 'downloads', label: '下载 APP', icon: 'download' },
  { id: 'account', label: '我的账户', icon: 'users' }
];
let active = true,
  generation = 0,
  controller,
  unsubscribe;
const maxActivity = computed(() => Math.max(1, ...(progress.value?.days || []).map((day) => day.count)));
const metrics = computed(() =>
  progress.value
    ? [
        { label: '学习天数', value: progress.value.studyDays },
        { label: '已保存作答', value: progress.value.answers },
        { label: '已写作文', value: progress.value.essays },
        { label: '熟悉句式', value: progress.value.familiar }
      ]
    : []
);
function cancel() {
  generation++;
  completionId.value = null;
  controller?.abort();
  controller = null;
  loading.value = false;
  progress.value = null;
}
async function reload() {
  cancel();
  const version = generation,
    session = captureSession();
  failed.value = false;
  if (!props.signedIn || !session || session.owner === 'guest') {
    status.value = '登录后查看已保存的学习进度。';
    return;
  }
  if (!config.api.baseUrl) {
    status.value = '账户服务暂时不可用，请稍后再试';
    return;
  }
  controller = new AbortController();
  loading.value = true;
  status.value = '正在读取学习进度…';
  try {
    const state = await readLearningSnapshot({ session, signal: controller.signal });
    if (!active || version !== generation || checkSession(session) !== 'current') return;
    progress.value = websiteProgress(state);
    completionId.value = `progress-${generation}-${state.revision}`;
    status.value = progress.value.hasRecords ? '' : '还没有同步的学习记录。在 App 中开始学习并同步后，即可在这里查看。';
  } catch {
    if (active && version === generation && checkSession(session) === 'current') {
      failed.value = true;
      status.value = '学习进度暂时无法读取，请重试。';
    }
  } finally {
    if (version === generation) {
      loading.value = false;
      controller = null;
    }
  }
}
async function logout() {
  if (leaving.value) return;
  leaving.value = true;
  cancel();
  try {
    const result = await useUserStore().logout();
    if (result?.success !== false) emit('signed-out');
  } finally {
    leaving.value = false;
  }
}
function policy(name) {
  safeNavigateTo('/pages/settings/' + name);
}
onMounted(() => {
  reload();
  unsubscribe = storageService.onIdentityChange(() => {
    cancel();
    if (active) reload();
  });
});
onHide(() => {
  active = false;
  cancel();
});
onShow(() => {
  if (!active) {
    active = true;
    reload();
  }
});
onBeforeUnmount(() => {
  active = false;
  cancel();
  unsubscribe?.();
});
</script>
<style scoped>
.portal-workspace,
.portal-workspace :deep(*) {
  box-sizing: border-box;
}
.portal-workspace {
  --ink: #282823;
  --ink-3: #77796b;
  --violet-ink: #626b4f;
  --violet-soft: #e7e9df;
  --focus: #697a4a;
  --paper: #ffffff;
  --paper-sunk: #f3f4ee;
  --secondary-shadow: inset 0 0 0 1px #d9ddce;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  background: #faf9f6;
  color: #282823;
  font-family: var(--font-ui);
}
.portal-rail {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 28px 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  background: #f0efe9;
  border-right: 1px solid #e5e4dc;
}
.portal-rail > .animated-avatar {
  margin: 0 0 24px 12px;
}
.portal-rail :deep(.base-button) {
  width: 100%;
  justify-content: flex-start;
  font-size: 13px;
  color: #44443e;
  padding: 12px;
  border-radius: 12px;
  transition: background-color 180ms ease;
}
.portal-rail :deep(.is-selected) {
  background: #e2e1d8;
}
.rail-settings {
  margin-top: auto;
}
.portal-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.portal-main {
  min-width: 0;
}
.portal-header {
  height: 104px;
  padding: 24px 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.portal-wordmark {
  font-weight: 650;
  letter-spacing: -0.04em;
  font-size: 22px;
}
.portal-content {
  width: min(880px, 100%);
  margin: 32px auto;
  padding: 0 48px 64px;
}
.portal-eyebrow {
  display: block;
  letter-spacing: 0.12em;
  color: #85857a;
  font-size: 11px;
  margin-bottom: 20px;
}
h1 {
  font-family: inherit;
  font-size: clamp(34px, 4vw, 54px);
  line-height: 1.12;
  font-weight: 500;
  letter-spacing: -0.055em;
  margin: 0 0 32px;
}
h2 {
  font-family: inherit;
  font-size: 17px;
  font-weight: 500;
  margin: 0 0 10px;
}
p,
.portal-toolbar,
.portal-note,
.portal-download text {
  color: #77776d;
  font-size: 14px;
  line-height: 1.7;
}
.portal-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.portal-toolbar :deep(.base-button) {
  font-size: 13px;
}
.portal-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.portal-metrics article {
  border: 1px solid #e6e5de;
  border-radius: 18px;
  padding: 24px 18px;
  background: #fff;
}
.portal-metrics text {
  display: block;
  font-size: 12px;
  color: #77776d;
}
.portal-metrics strong {
  display: block;
  font-size: 36px;
  font-weight: 450;
  margin-top: 14px;
  letter-spacing: -0.06em;
}
.portal-activity {
  margin-top: 24px;
  padding: 28px;
  border: 1px solid #e6e5de;
  border-radius: 20px;
  background: #fff;
}
.portal-activity > text {
  display: block;
  color: #909086;
  font-size: 11px;
  margin-top: 24px;
}
.portal-bars {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  margin-top: 28px;
  min-height: 160px;
}
.portal-day {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #85857a;
}
.portal-bar {
  width: 100%;
  max-width: 48px;
  background: #92947c;
  border-radius: 6px 6px 2px 2px;
}
.portal-note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  margin-top: 22px;
}
.portal-empty {
  border: 1px dashed #d6d5ca;
  border-radius: 20px;
  padding: 48px 32px;
  color: #838377;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
  line-height: 1.7;
}
.portal-download {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 40px;
  padding: 28px;
  border: 1px solid #e6e5de;
  border-radius: 20px;
  background: #fff;
}
.portal-download text {
  display: block;
  font-size: 12px;
}
.portal-download-link {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 16px;
  color: white;
  background: #292925;
  border-radius: 10px;
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}
.portal-policies {
  display: flex;
  gap: 20px;
  margin-top: 48px;
}
@media (max-width: 720px) {
  .portal-workspace {
    grid-template-columns: 76px minmax(0, 1fr);
  }
  .portal-rail {
    padding: 20px 8px;
    align-items: center;
  }
  .portal-rail > .animated-avatar {
    margin: 0 0 20px;
  }
  .portal-rail :deep(.base-button) {
    font-size: 11px;
    padding: 10px 4px;
    flex-direction: column;
    gap: 6px;
    min-height: 54px;
    justify-content: center;
  }
  .portal-header {
    padding: 20px;
    height: 88px;
  }
  .portal-content {
    padding: 0 20px 40px;
    margin-top: 24px;
  }
  .portal-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .portal-metrics article {
    padding: 20px 12px;
  }
  .portal-metrics strong {
    font-size: 30px;
  }
  .portal-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .portal-activity {
    padding: 18px;
  }
  .portal-bars {
    gap: 6px;
  }
  .portal-download {
    padding: 20px;
    flex-wrap: wrap;
  }
  .portal-download-link {
    margin-left: 0;
    width: 100%;
    justify-content: center;
  }
  .portal-empty {
    padding: 28px 20px;
  }
}
</style>

<style scoped>
.sidebar-collapsed {
  grid-template-columns: 80px minmax(0, 1fr);
}
.sidebar-collapsed .portal-rail {
  align-items: center;
  padding: 28px 12px;
}
.sidebar-collapsed .portal-rail > .animated-avatar {
  margin: 0 0 12px;
}
.sidebar-collapsed .portal-rail :deep(.base-button) {
  flex: none;
  width: 48px;
  height: 48px;
  min-height: 48px;
  padding: 0;
  justify-content: center;
  border-radius: 50%;
  transition:
    background-color 180ms ease,
    transform 180ms ease;
  transform: none;
}
.sidebar-collapsed .portal-rail :deep(.base-button:hover) {
  transform: scale(1.02);
  background: #e2e3d8;
}
.sidebar-collapsed .portal-rail :deep(.base-button:active) {
  transform: scale(0.98);
}
.sidebar-collapsed .rail-settings {
  margin-top: auto;
}
@media (prefers-reduced-motion: reduce) {
  .sidebar-collapsed .portal-rail :deep(.base-button) {
    transition: none;
    transform: none !important;
  }
}
@media (max-width: 720px) {
  .sidebar-collapsed {
    grid-template-columns: 68px minmax(0, 1fr);
  }
  .sidebar-collapsed .portal-rail {
    padding: 20px 8px;
  }
  .portal-content {
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>

<style scoped>
a.portal-wordmark {
  color: inherit;
  text-decoration: none;
}
a.portal-wordmark:focus-visible {
  outline: 2px solid #697a4a;
  outline-offset: 6px;
  border-radius: 3px;
}
</style>
