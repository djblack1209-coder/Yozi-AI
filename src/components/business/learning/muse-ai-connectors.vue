<template>
  <view class="ai-connectors">
    <text v-if="!getToken()" class="connect-status">登录后保存和管理自己的 API 连接。</text>
    <text v-else-if="learning.modelListState?.phase === 'loading'" role="status">正在读取已保存的连接…</text>
    <view v-else-if="learning.modelListState?.phase === 'error'" class="connect-read-error" role="alert"
      ><text>连接暂时未读出</text><BaseButton variant="quiet" @tap="reload">重新读取连接</BaseButton></view
    >
    <text v-if="learning.needsConnection" class="connect-status">{{
      learning.connectionGuide?.message || '请先连接自己的 API'
    }}</text>
    <view class="connect-search"
      ><BaseIcon name="search" size="18px" /><BaseInput
        v-model="query"
        label="搜索 AI 连接器"
        placeholder="搜索供应商或型号"
        hide-label
        maxlength="80"
    /></view>
    <view v-if="savedModels.length" class="connect-group">
      <text class="connect-group-title">已保存连接</text>
      <view class="connect-list"
        ><view v-for="model in savedModels" :key="model.id" class="connect-row" :data-connection-id="model.id">
          <image
            v-if="modelBrand(model.provider).logo"
            :src="modelBrand(model.provider).logo"
            class="connect-logo"
            mode="aspectFit"
            alt=""
          />
          <BaseIcon v-else name="plug" size="32px" />
          <view class="connect-name"
            ><text>{{ model.provider }}</text
            ><text class="connect-model">{{ model.requiresModelSelection ? '请选择型号' : model.model }}</text
            ><text class="connect-model">{{ connectionLabel(model) }}</text
            ><text v-if="learning.modelId === model.id" class="connect-current">正在使用</text></view
          >
          <BaseButton variant="quiet" :disabled="locked" @tap="open(model, true)">管理</BaseButton>
        </view></view
      >
    </view>
    <view class="connect-group">
      <text class="connect-group-title">添加连接</text>
      <view class="connect-list"
        ><view v-for="provider in providers" :key="provider.id" class="connect-row" :data-provider-id="provider.id">
          <image
            v-if="provider.logo"
            :src="provider.logo"
            class="connect-logo"
            :class="{ 'brand-mono': provider.mono }"
            mode="aspectFit"
            alt=""
          />
          <BaseIcon v-else-if="provider.custom" name="plug" size="32px" />
          <view class="connect-name"
            ><text>{{ provider.provider }}</text></view
          ><BaseButton variant="quiet" :disabled="locked" @tap="open(provider)">添加</BaseButton>
        </view></view
      >
    </view>
    <text v-if="message" class="connect-status" role="status">{{ message }}</text>
    <CustomModal
      :visible="Boolean(current)"
      :title="`${current?.saved ? '管理' : '连接'} ${current?.provider || ''}`"
      container-class="connect-dialog"
      :is-dark="theme.isDark"
      :show-actions="false"
      close-button
      :mask-closable="!saving"
      @cancel="disconnecting ? setDisconnecting(false) : close()"
    >
      <view class="connect-form">
        <template v-if="current?.saved && !editing && !choosing">
          <text class="connect-model">{{ savedEndpoint }}</text>
          <text class="connect-model">{{ connectionLabel(current.saved) }}</text>
          <ConnectorEffort
            v-if="current.saved.reasoningEffortLevels?.length"
            v-model="effortDraft"
            :levels="current.saved.reasoningEffortLevels"
            :saved="current.saved.reasoningEffort ?? null"
            :disabled="locked || disconnecting"
            @save="saveEffort"
          />
          <BaseButton
            variant="primary"
            :disabled="locked || disconnecting || current.saved.requiresModelSelection || !current.saved.configured"
            @tap="select"
            >{{ learning.modelId === current.saved.id ? '正在使用' : '使用此连接' }}</BaseButton
          >
          <BaseButton
            variant="quiet"
            :disabled="locked || disconnecting || current.saved.requiresModelSelection"
            @tap="test"
            >测试</BaseButton
          >
          <BaseButton variant="quiet" :disabled="locked || disconnecting" @tap="chooseModels">换型号</BaseButton>
          <BaseButton variant="quiet" :disabled="locked || disconnecting" @tap="editing = true">换密钥</BaseButton>
          <view class="disconnect-control">
            <BaseButton
              v-if="!disconnecting"
              ref="disconnectTrigger"
              class="disconnect-trigger"
              variant="quiet"
              icon-only
              icon="trash"
              label="断开连接"
              :disabled="locked"
              @tap="setDisconnecting(true)"
            />
            <template v-else>
              <text class="disconnect-question">断开此连接？</text>
              <view class="disconnect-choices" role="group" aria-label="断开此连接？">
                <BaseButton variant="danger" danger-secondary :disabled="locked" :loading="saving" @tap="disconnect"
                  >断开</BaseButton
                >
                <BaseButton ref="disconnectCancel" variant="secondary" :disabled="saving" @tap="setDisconnecting(false)"
                  >取消</BaseButton
                >
              </view>
            </template>
          </view>
        </template>
        <template v-if="!current?.saved || editing">
          <template v-if="current?.custom && !current.saved">
            <BaseInput v-model="draft.provider" label="服务名称" maxlength="80" autocomplete="off" :disabled="saving" />
            <BaseInput
              v-model="draft.endpoint"
              label="接口地址"
              type="url"
              maxlength="2048"
              autocomplete="off"
              placeholder="https://api.example.com/v1/chat/completions"
              :error="
                endpointAttempted && !connectionEndpoint(draft.endpoint)
                  ? '请输入不含账号、查询参数或片段的完整 HTTPS 接口地址'
                  : ''
              "
              :disabled="saving"
            />
          </template>
          <BaseInput
            v-model="apiKey"
            label="API 密钥"
            type="password"
            :maxlength="MODEL_API_KEY_MAX_LENGTH"
            autocomplete="off"
            :placeholder="current?.saved ? '留空保留原密钥' : '输入密钥'"
            :disabled="saving"
          />
          <text class="connect-status">密钥加密保存到 Yozi 服务端，运维可解密。保存不会调用教学模型。</text>
          <BaseButton
            variant="primary"
            :loading="saving"
            :disabled="
              locked ||
              (!current?.saved &&
                (!apiKey.trim() || (current?.custom && (!draft.provider?.trim() || !draft.endpoint?.trim()))))
            "
            @tap="saveKey"
            >{{ current?.saved ? '保存密钥' : '保存并读取型号' }}</BaseButton
          >
        </template>
        <template v-if="choosing">
          <view
            v-if="discovering || modelOptions.length"
            class="connect-discovery"
            :class="{ 'is-reading': discovering, 'is-ready': !discovering }"
          >
            <view class="connect-discovery__mark" aria-hidden="true">
              <template v-if="discovering">
                <view v-for="dot in 3" :key="dot" class="connect-discovery__dot" />
              </template>
              <BaseIcon v-else name="plug" size="22px" />
            </view>
            <text role="status">{{ discovering ? '正在读取实时型号…' : '型号列表已读取' }}</text>
            <view class="connect-discovery__track" aria-hidden="true"><view /></view>
          </view>
          <BaseInput
            v-if="modelOptions.length && !manual"
            v-model="draft.model"
            label="型号"
            :options="modelOptions"
            placeholder="选择型号"
            :disabled="locked"
          />
          <BaseInput
            v-else-if="!discovering"
            v-model="draft.model"
            label="手填型号"
            maxlength="256"
            autocomplete="off"
            :disabled="locked"
          />
          <BaseButton v-if="modelOptions.length && !manual" variant="quiet" :disabled="locked" @tap="manual = true"
            >手填型号</BaseButton
          >
          <BaseButton
            variant="primary"
            :loading="saving"
            :disabled="locked || !draft.model?.trim()"
            @tap="saveSelectedModel"
            >{{ newConnection ? '保存并使用' : '保存型号' }}</BaseButton
          >
        </template>
        <MuseModelFeedback :failure="failure" :state="operationState" :busy="locked" @action="errorAction" />
      </view>
    </CustomModal>
    <CustomModal
      :visible="loginRequired"
      title="登录后连接自己的 API"
      :is-dark="theme.isDark"
      confirm-text="去登录"
      cancel-text="稍后"
      @confirm="goLogin"
      @cancel="loginRequired = false"
    />
  </view>
</template>
<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue';
import {
  MODEL_ENDPOINTS,
  completeModelEndpoint,
  isReleaseProvider,
  MODEL_API_KEY_MAX_LENGTH
} from '../../../../laf-backend/functions/_shared/ai-providers/model-endpoints.js';
import { modelErrorPresentation } from '../../../../laf-backend/functions/_shared/model-errors.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { isDesktopSettingsWindow, selectDesktopModel } from '@/services/desktop/windows.js';
import { getToken, getUserId } from '@/services/auth-storage.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import { modelBrand } from '@/config/model-brands.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import ConnectorEffort from './connector-effort.vue';
import MuseModelFeedback from './muse-model-feedback.vue';
const learning = useConversationLearningStore(),
  theme = useThemeStore();
const query = ref(''),
  loginRequired = ref(false),
  current = ref(null),
  apiKey = ref(''),
  editing = ref(false),
  choosing = ref(false),
  saving = ref(false),
  discovering = ref(false),
  disconnecting = ref(false),
  message = ref(''),
  failure = ref(null),
  draft = ref({}),
  modelOptions = ref([]),
  manual = ref(false),
  newConnection = ref(false),
  endpointAttempted = ref(false),
  operationState = ref({ phase: 'idle' }),
  testRequest = ref(null);
const locked = computed(() => saving.value || discovering.value || learning.busy || learning.intakeBusy);
const effortDraft = ref(null);
watch(
  () => current.value?.saved,
  (model) => {
    effortDraft.value = model?.reasoningEffort ?? null;
  },
  { flush: 'sync' }
);
const disconnectTrigger = ref(null);
const disconnectCancel = ref(null);
async function setDisconnecting(value) {
  if (saving.value) return;
  disconnecting.value = value;
  await nextTick();
  const button = value ? disconnectCancel.value : disconnectTrigger.value;
  (button?.$el || button)?.focus?.();
}
const matches = (item) =>
  `${item.provider} ${item.model || ''}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase());
const savedModels = computed(() => learning.models.filter((model) => model.source === 'byok').filter(matches));
const providers = computed(() =>
  [
    ...MODEL_ENDPOINTS.filter((item) => isReleaseProvider(item.id)).map((item) => ({
      ...item,
      ...modelBrand(item.provider)
    })),
    { id: 'custom', provider: '自定义服务', custom: true }
  ].filter(matches)
);
function connectionEndpoint(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.port && url.port !== '443')
    )
      return '';
    return completeModelEndpoint(value.trim());
  } catch {
    return '';
  }
}
const savedEndpoint = computed(() => connectionEndpoint(current.value?.saved?.endpoint) || '接口地址暂不可读');
function connectionLabel(saved) {
  if (saved.requiresModelSelection) return '待选择型号';
  if (!saved.configured) return '待填写密钥';
  const teachingReady = saved.capabilityCheck?.tools && saved.capabilityCheck?.structured;
  if (saved.connectionStatus === 'failed')
    return modelErrorPresentation({ error: saved.lastError, savingModel: !teachingReady }).message;
  if (!teachingReady) return '教学能力待检查';
  return { connected: '连接正常', stale: '需要重新测试', untested: '尚未测试' }[saved.connectionStatus] || '尚未测试';
}
function close() {
  current.value = null;
  apiKey.value = '';
  draft.value = {};
  newConnection.value = false;
  editing.value = false;
  choosing.value = false;
  disconnecting.value = false;
  failure.value = null;
  modelOptions.value = [];
  manual.value = false;
  operationState.value = { phase: 'idle' };
  testRequest.value = null;
  endpointAttempted.value = false;
}
function open(provider, saved = false) {
  if (locked.value) return;
  close();
  if (!getToken()) {
    loginRequired.value = true;
    return;
  }
  current.value = { ...provider, ...(saved ? { saved: provider } : {}) };
  draft.value = { ...provider, model: saved && !provider.requiresModelSelection ? provider.model : '' };
  if (provider.custom && !saved) draft.value = { ...draft.value, provider: '', endpoint: '' };
  newConnection.value = !saved;
}
function goLogin() {
  loginRequired.value = false;
  safeNavigateTo('/pages/login/index');
}
async function perform(action) {
  if (saving.value) return;
  const context = learning.recordContext();
  saving.value = true;
  failure.value = null;
  operationState.value = { phase: 'running' };
  try {
    const result = await action();
    if (context !== learning.recordContext() || !current.value) return;
    if (result?.success === false) {
      failure.value = result;
      operationState.value = { phase: 'failed', errorCode: result.error || result.errorCode };
    } else operationState.value = { phase: 'succeeded' };
    return result;
  } catch (error) {
    if (context === learning.recordContext() && current.value) {
      failure.value = { error: error.code || 'MODEL_FAILED' };
      operationState.value = { phase: 'failed', errorCode: error.code };
    }
  } finally {
    saving.value = false;
    apiKey.value = '';
  }
}
async function reload() {
  try {
    await learning.loadModels();
  } catch {
    /* Store owns catalog status. */
  }
}
function profile(extra = {}) {
  const saved = current.value?.saved;
  return {
    id: saved?.id || draft.value.id,
    provider: draft.value.provider,
    endpoint: draft.value.endpoint,
    model: saved?.model || '',
    requiresModelSelection: saved?.requiresModelSelection ?? true,
    structured: saved?.capabilities?.structured === true,
    stream: saved?.capabilities?.stream === true,
    vision: saved?.capabilities?.vision === true,
    ...extra
  };
}
async function saveKey() {
  if (locked.value || !current.value) return;
  if (current.value.custom && !current.value.saved) {
    endpointAttempted.value = true;
    const endpoint = connectionEndpoint(draft.value.endpoint);
    if (!endpoint || !draft.value.provider?.trim() || !apiKey.value.trim()) return;
    draft.value = { ...draft.value, provider: draft.value.provider.trim(), endpoint };
  }
  if (!current.value.saved)
    draft.value.id = `byok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const target = current.value;
  const result = await perform(() => learning.saveModel(profile({ apiKey: apiKey.value }), true));
  if (!result?.success || current.value !== target) return;
  current.value = {
    ...target,
    provider: draft.value.provider,
    saved: learning.models.find((model) => model.id === draft.value.id) || { ...profile(), configured: true }
  };
  editing.value = false;
  if (newConnection.value || current.value.saved.requiresModelSelection) await chooseModels();
  else message.value = '密钥已保存';
}
async function chooseModels() {
  const id = current.value?.saved?.id;
  if (!id || locked.value) return;
  const target = current.value,
    context = learning.recordContext();
  choosing.value = true;
  discovering.value = true;
  failure.value = null;
  operationState.value = { phase: 'idle' };
  modelOptions.value = [];
  manual.value = false;
  try {
    const result = await learning.loadModelDiscovery({ profileId: id, refresh: true });
    if (context !== learning.recordContext() || current.value !== target) return;
    if (!result.success) {
      failure.value = { ...result, discovery: true };
      manual.value = true;
      return;
    }
    modelOptions.value = (result.data.models || []).map((item) => ({
      value: item.modelId,
      label: item.displayName ? `${item.displayName} · ${item.modelId}` : item.modelId
    }));
    if (!modelOptions.value.length) {
      manual.value = true;
      failure.value = { error: 'UNSUPPORTED_DISCOVERY' };
    }
  } catch (error) {
    if (context === learning.recordContext() && current.value === target) {
      failure.value = { error: error.code || 'METADATA_UNAVAILABLE', discovery: true };
      manual.value = true;
    }
  } finally {
    discovering.value = false;
  }
}
async function saveSelectedModel() {
  if (locked.value || !draft.value.model?.trim()) return;
  const target = current.value;
  const result = await perform(() =>
    learning.saveModel(profile({ model: draft.value.model.trim(), requiresModelSelection: false }), true)
  );
  if (current.value !== target) return;
  if (!result?.success) {
    if (failure.value) failure.value = { ...failure.value, savingModel: true };
    return;
  }
  choosing.value = false;
  current.value = {
    ...target,
    saved: learning.models.find((model) => model.id === draft.value.id) || {
      ...profile({ model: draft.value.model.trim(), requiresModelSelection: false }),
      configured: true
    }
  };
  if (newConnection.value) await select();
}
async function select() {
  if (locked.value || !current.value?.saved) return;
  const result = await perform(async () => {
    const saved = await learning.selectModel(current.value.saved.id);
    if (saved?.success === false) return saved;
    if (isDesktopSettingsWindow()) await selectDesktopModel(current.value.saved.id, getUserId());
    return { success: true };
  });
  if (result?.success) {
    message.value = '已切换连接';
    if (!isDesktopSettingsWindow()) safeNavigateTo('/pages/learning/index');
  }
}

async function saveEffort() {
  if (locked.value || disconnecting.value) return;
  const target = current.value;
  const saved = target?.saved;
  if (!saved || effortDraft.value === (saved.reasoningEffort ?? null)) return;
  const result = await perform(() => learning.saveModelEffort(saved, effortDraft.value));
  if (current.value !== target) return;
  if (result?.success || result?.error === 'CONTEXT_CHANGED') {
    const updated = learning.models.find((model) => model.id === saved.id);
    if (updated) current.value = { ...target, saved: updated };
    else close();
  }
}

async function test() {
  if (locked.value || !current.value?.saved) return;
  const id = current.value.saved.id;
  const result = await perform(() => learning.testModel(id));
  if (result?.requestId && current.value?.saved?.id === id) testRequest.value = { id, requestId: result.requestId };
}

async function disconnect() {
  if (locked.value || !current.value?.saved) return;
  const result = await perform(() => learning.removeModel(current.value.saved.id));
  if (result?.success) {
    close();
    message.value = '连接已断开';
  }
}
function errorAction(action) {
  if (action.type === 'retry_discovery') return chooseModels();
  if (action.type === 'manual_model') {
    manual.value = true;
    choosing.value = true;
  } else if (action.type === 'query_result') {
    if (testRequest.value)
      return perform(() => learning.recoverConnectionTest(testRequest.value.id, testRequest.value.requestId));
  } else if (action.type === 'open_connectors') {
    editing.value = true;
  }
}
watch(
  () => learning.recordContext(),
  () => {
    close();
    query.value = '';
    message.value = '';
    loginRequired.value = false;
  },
  { flush: 'sync' }
);
onMounted(() => {
  if (getToken()) void reload();
});
onUnmounted(close);
</script>
<style scoped>
.connect-discovery {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: var(--ink-2);
}
.connect-discovery__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 42px;
  min-height: 32px;
  color: var(--ink);
}
.connect-discovery__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink);
  animation: connector-orbit 920ms cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
.connect-discovery__dot:nth-child(2) {
  animation-delay: -300ms;
}
.connect-discovery__dot:nth-child(3) {
  animation-delay: -600ms;
}
.connect-discovery__track {
  width: min(184px, 100%);
  height: 3px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--line);
}
.connect-discovery__track > view {
  height: 100%;
  width: 31%;
  border-radius: inherit;
  background: var(--blue);
  transition: width 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.is-reading .connect-discovery__track > view {
  animation: connector-scan 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite alternate;
}
.is-ready .connect-discovery__track > view {
  width: 100%;
}
.is-ready .connect-discovery__mark {
  animation: connector-ready 290ms cubic-bezier(0.2, 0.72, 0.2, 1) both;
}
@keyframes connector-orbit {
  0%,
  100% {
    transform: translateY(1px) scale(0.55);
  }
  45% {
    transform: translateY(-3px) scale(1.15);
  }
}
@keyframes connector-scan {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(220%);
  }
}
@keyframes connector-ready {
  from {
    transform: scale(0.65);
    opacity: 0.3;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .connect-discovery__mark,
  .connect-discovery__dot,
  .connect-discovery__track > view {
    animation: none !important;
    transition: none;
  }
}
.disconnect-control {
  display: grid;
  justify-items: end;
  gap: 8px;
}
.disconnect-question {
  color: var(--ink-2);
  font-size: 13px;
}
.disconnect-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.disconnect-trigger {
  color: var(--muse-rich-danger, var(--coral));
  border-radius: 50%;
  transition:
    background-color 180ms ease-out,
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  animation: disconnect-fold 210ms cubic-bezier(0.18, 0.73, 0.22, 1) both;
}
@media (hover: hover) and (pointer: fine) {
  .disconnect-trigger:hover {
    background: var(--muse-rich-danger-bg, var(--coral-soft));
  }
}
.disconnect-trigger:active {
  transform: scale(0.94);
}
.disconnect-choices :deep(.base-button) {
  min-height: 44px;
  border-radius: 999px;
  animation: disconnect-pills 260ms cubic-bezier(0.18, 0.73, 0.22, 1) both;
  transform-origin: right center;
}
.disconnect-choices :deep(.base-button:first-child) {
  --disconnect-offset: 32px;
}
@keyframes disconnect-pills {
  from {
    opacity: 0;
    transform: translateX(var(--disconnect-offset, 0px)) scaleX(0.38);
    filter: blur(2px);
  }
}
@keyframes disconnect-fold {
  from {
    opacity: 0.45;
    transform: scaleX(1.6);
    filter: blur(2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .disconnect-choices :deep(.base-button) {
    animation: none;
  }
  .disconnect-trigger {
    animation: none;
    transition: none;
  }
  .disconnect-trigger:active {
    transform: none;
  }
}
.ai-connectors {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 32px;
}
.connect-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  min-height: 44px;
  border-radius: 999px;
  background: var(--muse-raised);
  color: var(--ink-3);
}
.connect-search :deep(.base-field) {
  flex: 1;
  min-width: 0;
}
.connect-search :deep(.base-field__group) {
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 0;
  outline: none !important;
}
.connect-search:focus-within {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.connect-search :deep(.base-field__input:focus-visible),
.connect-form :deep(.base-field__input:focus-visible) {
  outline: none;
}
.connect-form :deep(.base-field__group.is-focused) {
  outline-offset: 0 !important;
  box-shadow: none;
}
.connect-tabs {
  display: flex;
  padding: 4px;
  border-radius: 999px;
  background: var(--muse-raised);
}
.connect-tabs .base-button {
  color: var(--ink-2);
  flex: 1;
  border-radius: 999px;
  min-height: 44px;
}
.connect-tabs .is-selected {
  background: var(--muse-selected);
}
.connect-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.connect-group-title {
  font-size: 12px;
  line-height: 18px;
  color: var(--ink-3);
  font-weight: 600;
  margin: 4px 4px 0;
}
.connect-list {
  border-radius: 12px;
  background: var(--muse-raised);
  padding: 4px 12px;
}
.connect-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 4px 0;
  border-bottom: 1px solid var(--line);
}
.connect-row:last-child {
  border: 0;
}
.connect-read-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 13px;
  line-height: 20px;
}
/* Keep provider marks legible on both themes without recoloring them. */
.ai-connectors .connect-logo,
.connect-dialog-heading .connect-logo {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 5px;
  border-radius: 8px;
  background: #fff;
  box-shadow: inset 0 0 0 1px #0000000f;
  opacity: 1;
  filter: none;
}
.connect-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.connect-name text {
  display: block;
}
.connect-model {
  color: var(--ink-3);
  font-size: 12px;
  line-height: 20px;
}
.connect-row .base-button {
  flex: none;
  color: var(--blue);
  padding: 0 8px;
  min-width: 44px;
}
.connect-empty {
  padding: 32px 16px;
  color: var(--ink-3);
  font-size: 13px;
  text-align: center;
}
.connect-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
  min-width: 0;
}
.connect-dialog-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 4px 44px 8px;
  text-align: center;
}
.connect-dialog-heading .connect-logo {
  width: 40px;
  height: 40px;
  padding: 6px;
  border-radius: 10px;
}
:global(.connect-dialog .modal-close) {
  position: absolute;
  top: 12px;
  right: 12px;
}
.connect-status {
  font-size: 12px;
  color: var(--ink-3);
}
.connect-error {
  font-size: 13px;
  color: var(--danger);
  line-height: 20px;
  overflow-wrap: anywhere;
}
@media (max-width: 760px) {
  .ai-connectors {
    gap: 16px;
  }
}
</style>
