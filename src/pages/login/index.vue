<template>
  <view
    class="login-page lazy-login"
    :class="[themeStore.isDark ? 'theme-dark' : 'theme-light', { 'website-login': WEBSITE_MODE }]"
    :style="$yoziInsets"
  >
    <PrivacyPopup />
    <view class="login-layout"
      ><BrandScene /><view class="login-form-column">
        <view class="login-top">
          <BaseButton variant="quiet" icon="arrow-left" icon-only :label="t('login.back')" @tap="back" />
          <BaseSegmented
            v-if="US_LOGIN_ENABLED"
            :model-value="region"
            :options="regions"
            :label="t('login.region')"
            :disabled="busy"
            @update:model-value="changeRegion"
          />
          <BaseButton
            v-if="!WEBSITE_MODE"
            variant="quiet"
            :label="currentLanguage === 'en' ? t('login.chinese') : t('login.english')"
            @tap="setLanguage(currentLanguage === 'en' ? 'zh-CN' : 'en')"
            >{{ currentLanguage === 'en' ? t('login.chinese') : t('login.english') }}</BaseButton
          >
        </view>
        <view class="login-content">
          <view v-if="step === 'methods' || WEBSITE_MODE" class="login-hero"
            ><AnimatedAvatar :size="56" /><text class="login-title">{{
              WEBSITE_MODE ? (isRegister ? '创建你的账户' : '欢迎回来') : loginPresentation.title
            }}</text
            ><text v-if="!WEBSITE_MODE" class="login-subtitle">{{ loginPresentation.subtitle }}</text></view
          >
          <BaseCard surface="glass" class="login-panel">
            <view v-if="!methods.length" class="login-stack" role="status">{{ t('login.providerClosed') }}</view>
            <view v-else-if="step === 'methods'" class="login-stack">
              <BaseButton
                v-for="(method, index) in methods"
                :key="method"
                :class="`${method}-btn`"
                :variant="index === 0 ? 'primary' : 'secondary'"
                :icon="method === 'phone' ? 'phone' : method === 'email' ? 'mail' : method"
                block
                :loading="busy"
                :loading-text="WEBSITE_MODE ? '请稍候' : ''"
                :disabled="busy"
                @tap="selectMethod(method)"
                >{{ t(`login.${method}`) }}</BaseButton
              >
            </view>
            <view v-else-if="step === 'age'" class="login-stack age-form">
              <text class="login-title">{{ t('login.birth') }}</text
              ><text class="login-subtitle">{{ t('login.birthHelp') }}</text>
              <BaseInput v-model="year" :label="t('login.year')" :options="birthYears" />
              <BaseInput v-model="month" :label="t('login.month')" :options="birthMonths" />
              <text class="login-subtitle">{{ t('login.birthPrivacy') }}</text>
              <BaseButton
                variant="primary"
                block
                :loading="busy"
                :loading-text="WEBSITE_MODE ? '请稍候' : ''"
                :disabled="busy || !consentSatisfied"
                @tap="submitAge"
                >{{ t('login.continue') }}</BaseButton
              >
            </view>
            <view v-else-if="step === 'blocked'" class="login-stack age-blocked" role="alert">
              <YoziMascot pose="encourage" play="once" size="state" /><text class="login-title">{{
                t('login.blocked')
              }}</text
              ><text class="login-subtitle">{{ t('login.blockedHelp') }}</text>
              <BaseButton variant="quiet" block @tap="step = 'methods'">{{ t('login.back') }}</BaseButton>
            </view>
            <view v-else-if="step === 'phone'" class="login-stack phone-form">
              <text class="login-title">{{ t('login.phone') }}</text>
              <BaseInput
                v-model="phone"
                :prefix="prefix"
                :label="t('login.phoneNumber')"
                inputmode="tel"
                :maxlength="16"
              />
              <BaseInput
                v-model="phoneCode"
                :label="t('login.code')"
                verification
                inputmode="numeric"
                :maxlength="6"
                :disabled="busy || !consentSatisfied"
                :resend-seconds="phoneCooldown"
                :verification-labels="WEBSITE_MODE ? websiteCodeLabels : null"
                :verification-sent="phoneSent"
                @resend="sendPhone"
              />
              <BaseButton
                variant="primary"
                block
                :loading="busy"
                :loading-text="WEBSITE_MODE ? '请稍候' : ''"
                :disabled="busy || !consentSatisfied"
                @tap="submitPhone"
                >{{ t('login.submit') }}</BaseButton
              >
              <BaseButton variant="quiet" block @tap="step = 'methods'">{{ t('login.other') }}</BaseButton>
            </view>
            <view v-else class="login-stack email-form">
              <text v-if="!WEBSITE_MODE" class="login-title">{{
                isRegister ? t('login.create') : t('login.email')
              }}</text>
              <BaseInput
                v-model="emailForm.email"
                :label="t('login.emailAddress')"
                inputmode="email"
                :maxlength="254"
              />
              <BaseInput
                v-if="!devTestBuild && (isRegister || friendTrial)"
                v-model="emailForm.code"
                :label="t('login.code')"
                verification
                inputmode="numeric"
                :maxlength="6"
                :resend-seconds="emailCooldown"
                :verification-labels="WEBSITE_MODE ? websiteCodeLabels : null"
                :disabled="busy || !consentSatisfied || !isEmailValid"
                @resend="sendEmail"
              />
              <BaseInput
                v-if="!friendTrial && (!devTestBuild || isRegister)"
                v-model="emailForm.password"
                :label="isRegister ? t('login.setPassword') : t('login.password')"
                :type="showPassword ? 'text' : 'password'"
                :maxlength="32"
                :help="isRegister ? (devTestBuild ? '1–32个字符' : t('login.passwordHelp')) : ''"
                ><template #suffix
                  ><BaseButton
                    variant="quiet"
                    icon-only
                    :icon="showPassword ? 'eye-off' : 'eye'"
                    :label="showPassword ? t('login.hidePassword') : t('login.showPassword')"
                    @tap="showPassword = !showPassword" /></template
              ></BaseInput>
              <BaseButton
                variant="primary"
                block
                :loading="busy"
                :loading-text="WEBSITE_MODE ? '请稍候' : ''"
                :disabled="busy || !consentSatisfied"
                @tap="submitEmail"
                >{{ isRegister ? t('login.register') : t('login.submit') }}</BaseButton
              >
              <BaseButton v-if="!friendTrial" variant="quiet" block @tap="toggleRegister">{{
                isRegister ? t('login.existing') : t('login.create')
              }}</BaseButton>
              <BaseButton variant="quiet" block @tap="step = 'methods'">{{ t('login.other') }}</BaseButton>
            </view>
            <text v-if="error" class="login-error" role="alert">{{ error }}</text>
            <view v-if="!['age', 'blocked'].includes(step)" class="login-agreement">
              <BaseCheckbox
                id="e2e-login-agreement"
                v-model="agreedToTerms"
                :disabled="busy"
                :aria-label="t('login.agree') + t('login.privacy') + t('login.and') + t('login.terms')"
                >{{ t('login.agree') }}</BaseCheckbox
              >
              <view>
                <view
                  role="link"
                  tabindex="0"
                  class="policy-link"
                  @tap.stop="openPrivacy"
                  @keydown.enter.stop="openPrivacy"
                  @keydown.space.prevent.stop="openPrivacy"
                  >{{ t('login.privacy') }}</view
                >
                {{ t('login.and') }}
                <view
                  role="link"
                  tabindex="0"
                  class="policy-link"
                  @tap.stop="openTerms"
                  @keydown.enter.stop="openTerms"
                  @keydown.space.prevent.stop="openTerms"
                  >{{ t('login.terms') }}</view
                >
              </view>
            </view>
          </BaseCard>
          <view v-if="step === 'methods' && !WEBSITE_MODE" class="login-offline"
            ><text>{{ t('login.offline') }}</text
            ><BaseButton variant="secondary" block @tap="openHomeTab()">{{ t('login.start') }}</BaseButton></view
          >
          <BaseButton v-if="WEBSITE_MODE" variant="quiet" class="login-home" @tap="goHome">返回官网</BaseButton>
        </view>
      </view></view
    >
  </view>
</template>
<script setup>
import { DEV_TEST as devTestBuild } from '@/config/build-channel.js';
import { assertSession, captureSession, checkSession } from '@/services/auth-storage.js';
import { loginPresentation, websiteLoginText } from './messages.js';
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { onShow, onHide, onLoad } from '@dcloudio/uni-app';
import { t as translated, currentLanguage, setLanguage } from '@/i18n/index.js';
import { WEBSITE_MODE } from '@/config/website.js';
import BrandScene from '@/components/business/website/brand-scene.vue';
import AnimatedAvatar from '@/components/base/animated-avatar/animated-avatar.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
import BaseCard from '@/components/base/base-card/base-card.vue';
import YoziMascot from '@/components/base/yozi-mascot/yozi-mascot.vue';
import PrivacyPopup from '@/components/common/privacy-popup.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { useAuthStore } from '@/stores/modules/auth';
import { useUserStore } from '@/stores/modules/user';
import { useThemeStore } from '@/stores/modules/theme.js';
import { storageService } from '@/services/storageService.js';
import { getToken } from '@/services/auth-storage.js';
import { readLoginRegion, chooseLoginRegion, US_LOGIN_ENABLED } from '@/services/auth-region.js';
import { availableLoginMethods, isAgeEligible, getAgeSession, loginErrorText } from './regional-utils.js';
import { normalizeEmailAddress } from './email-auth-utils.js';
import { beginWebOAuth, loginNativeWechat } from './oauth-utils.js';
const themeStore = useThemeStore();
import { requestProviderToken } from './provider-utils.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import { loginDesktopOAuth } from '@/services/desktop/oauth.js';
import { safeNavigateTo, safeNavigateBack } from '@/utils/safe-navigate';
import { openHomeTab } from '@/utils/home-navigation.js';
import { toast } from '@/utils/toast.js';
import config from '@/config/index.js';
const authStore = useAuthStore();
const websiteCodeLabels = { send: '获取验证码', resend: '重新发送', countdown: '{seconds}秒后重发' };
const t = (key, values) => (WEBSITE_MODE ? websiteLoginText(key, values) : translated(key, values));
const region = ref(readLoginRegion()),
  agreedToTerms = ref(false),
  step = ref('methods'),
  busy = ref(false),
  error = ref('');
const consentSatisfied = computed(() => devTestBuild || agreedToTerms.value);
const birthYears = Array.from({ length: 121 }, (_, index) => {
  const value = new Date().getFullYear() - index;
  return { value: String(value), label: String(value) };
});
const birthMonths = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));
const phoneSent = ref(false);
const year = ref(''),
  month = ref(''),
  phone = ref(''),
  phoneCode = ref(''),
  phoneCooldown = ref(0),
  emailCooldown = ref(0);
const emailForm = ref({ email: '', password: '', code: '' }),
  isRegister = ref(false),
  showPassword = ref(false);
onLoad((options) => {
  if (WEBSITE_MODE && options?.mode === 'register') {
    isRegister.value = true;
    step.value = 'email';
  }
});
const capabilities = ref({}),
  providers = ref([]),
  age = getAgeSession();
let platform = 'h5',
  os = '',
  active = true,
  version = 0,
  pendingMethod = '',
  ageTicket = '',
  ageExpiresAt = 0,
  redirectTimer;
// #ifdef MP-WEIXIN
platform = 'mp-weixin';
// #endif
// #ifdef APP-PLUS
platform = 'app';
// #endif
// #ifdef H5
platform = 'h5';
// #endif
try {
  const info = uni.getSystemInfoSync();
  os = String(info.osName || info.platform || '').toLowerCase();
} catch {
  /* capability fallback */
}
const desktop = isDesktopRuntime();
const isWeChatBrowser = typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent);
const isEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.value.email));
const prefix = computed(() => (region.value === 'US' ? '+1' : '+86'));
const regions = computed(() => [
  { value: 'US', label: t('login.us') },
  { value: 'CN', label: t('login.cn') }
]);
const isMethodAvailable = (method) =>
  method === 'phone' ? !!capabilities.value.sms : method !== 'email' || capabilities.value.email !== false;
const friendTrial = computed(() => !devTestBuild && capabilities.value.friendTrial === true);
const methods = computed(() =>
  availableLoginMethods(region.value, {
    platform,
    os,
    providers: providers.value,
    capabilities: capabilities.value,
    desktop
  })
    .filter((method) => !friendTrial.value || method === 'email')
    .filter(isMethodAvailable)
);
const current = () => {
  const captured = { version, session: captureSession() };
  return () => active && checkSession(captured.session) === 'current' && captured.version === version;
};
onShow(() => {
  active = true;
});
onHide(() => {
  active = false;
  version++;
  clearTimeout(redirectTimer);
  year.value = '';
  month.value = '';
});
onUnmounted(() => {
  active = false;
  version++;
  clearTimeout(redirectTimer);
  year.value = '';
  month.value = '';
  ageTicket = '';
});
const registration = () => ({ region: region.value, ...(region.value === 'US' && ageTicket ? { ageTicket } : {}) });
function consent() {
  if (!consentSatisfied.value) {
    error.value = t('login.consent');
    // #ifdef H5
    nextTick(() =>
      document
        .querySelector('#e2e-login-agreement [role=checkbox], #e2e-login-agreement input, #e2e-login-agreement')
        ?.focus?.()
    );
    // #endif
    return false;
  }
  return true;
}
function changeRegion(value) {
  if (busy.value || !chooseLoginRegion(value)) return;
  region.value = value;
  version++;
  clearDrafts();
  step.value = 'methods';
}
function clearDrafts() {
  year.value = '';
  month.value = '';
  phone.value = '';
  phoneSent.value = false;
  phoneCode.value = '';
  emailForm.value = { email: '', password: '', code: '' };
  ageTicket = '';
  ageExpiresAt = 0;
  error.value = '';
}
function back() {
  if (busy.value) return;
  if (step.value !== 'methods') {
    year.value = '';
    month.value = '';
    step.value = 'methods';
    error.value = '';
  } else if (WEBSITE_MODE) goHome();
  else safeNavigateBack();
}
function goHome() {
  if (WEBSITE_MODE) uni.reLaunch({ url: '/pages/index/index' });
  else openHomeTab();
}
function needsAge() {
  return region.value === 'US' && !getToken() && (!ageTicket || ageExpiresAt <= Date.now());
}
async function selectMethod(method) {
  if (method === 'phone' && !capabilities.value.sms) {
    if (consent()) error.value = t('login.smsClosed');
    return;
  }
  if (!consent() || busy.value || !methods.value.includes(method)) return;
  error.value = '';
  if (region.value === 'US' && age.isBlocked()) {
    clearDrafts();
    step.value = 'blocked';
    return;
  }
  pendingMethod = method;
  if (needsAge()) {
    step.value = 'age';
    return;
  }
  await proceed(method);
}
async function submitAge() {
  if (!consent() || busy.value) return;
  if (age.isBlocked()) {
    step.value = 'blocked';
    return;
  }
  const eligible = isAgeEligible(year.value, month.value);
  if (eligible === null) {
    error.value = t('login.invalidBirth');
    return;
  }
  if (!eligible) {
    age.block();
    clearDrafts();
    step.value = 'blocked';
    return;
  }
  const birth = { year: Number(year.value), month: Number(month.value) };
  ageTicket = '';
  ageExpiresAt = 0;
  year.value = '';
  month.value = '';
  const response = await run(() => authStore.regionalLogin({ type: 'age_confirm', region: 'US', ...birth }));
  if (response?.errorCode === 'AGE_BLOCKED') {
    age.block();
    clearDrafts();
    step.value = 'blocked';
    return;
  }
  if (response?.code === 0 && response.data?.ticket) {
    ageTicket = response.data.ticket;
    ageExpiresAt = response.data.expiresAt;
  }
  if (ageTicket && active) await proceed(pendingMethod);
}
async function proceed(method) {
  if (['email', 'phone'].includes(method)) {
    step.value = method;
    return;
  }
  if (method === 'wechat') return wechat();
  await run(async () => {
    const valid = current();
    const challenge = await authStore.regionalLogin({ type: method, action: 'begin', platform, ...registration() });
    if (!valid()) return null;
    if (challenge.code !== 0) return challenge;
    const identityToken = await requestProviderToken(method, challenge.data, platform);
    if (!valid()) return null;
    return authStore.regionalLogin({
      type: method,
      identityToken,
      session: challenge.data.session,
      platform,
      ...registration()
    });
  }, true);
}
async function run(action, accept = false) {
  if (!consent() || busy.value) return;
  let valid = current();
  busy.value = true;
  try {
    const attempt = accept ? await storageService.beginLoginAttempt() : null;
    const pageCurrent = current();
    valid = () => pageCurrent() && (!attempt || storageService.isLoginAttemptCurrent(attempt));
    if (!pageCurrent()) return;
    error.value = '';
    const response = await action(attempt);
    if (!valid() || !response) return;
    if (response.code !== 0) {
      error.value = loginErrorText(response);
      if (response.errorCode === 'AGE_CONFIRMATION_REQUIRED' && region.value === 'US') {
        ageTicket = '';
        ageExpiresAt = 0;
        year.value = '';
        month.value = '';
        step.value = 'age';
      }
    } else if (accept && response.data) await saveLoginInfo(response.data, attempt);
    return response;
  } catch (failure) {
    if (failure?.code === 'BROWSER_UPGRADE_REQUIRED') error.value = failure.message;
    else if (valid()) error.value = t('login.retry');
  } finally {
    busy.value = false;
  }
}
async function sendPhone() {
  if (needsAge()) {
    pendingMethod = 'phone';
    step.value = 'age';
    return;
  }
  const response = await run(() =>
    authStore.regionalLogin({
      type: 'phone',
      action: 'send',
      phone: phone.value,
      prefix: prefix.value,
      idempotencyKey: randomRequestId(),
      ...registration()
    })
  );
  if (response?.code === 0) {
    phoneSent.value = true;
    phoneCooldown.value = response.data?.retryAfter || 60;
  }
}
function randomRequestId() {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) return `${Date.now()}_phone_request`;
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function submitPhone() {
  if (needsAge()) {
    pendingMethod = 'phone';
    step.value = 'age';
    return;
  }
  await run(
    () =>
      authStore.regionalLogin({
        type: 'phone',
        phone: phone.value,
        prefix: prefix.value,
        verifyCode: phoneCode.value,
        ...registration()
      }),
    true
  );
}
async function sendEmail() {
  if (needsAge()) {
    pendingMethod = 'email';
    step.value = 'age';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.value.email)) {
    error.value = t('login.invalidEmail');
    return;
  }
  const response = await run(() => authStore.sendEmailCode(normalizeEmailAddress(emailForm.value.email)));
  if (response?.code === 0) {
    emailCooldown.value = response.retryAfter || 60;
    error.value = t('login.sent');
  } else if (response?.code === -1) {
    emailCooldown.value = 60;
    error.value = t('login.networkCode');
  }
}
async function submitEmail() {
  if (friendTrial.value) {
    if (!/^\d{6}$/.test(emailForm.value.code) || !isEmailValid.value) {
      error.value = t('login.invalidCode');
      return;
    }
    await run(
      () =>
        authStore.loginByEmail({
          email: normalizeEmailAddress(emailForm.value.email),
          verifyCode: emailForm.value.code,
          ...registration()
        }),
      true
    );
    return;
  }
  if (isRegister.value && needsAge()) {
    pendingMethod = 'email';
    step.value = 'age';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.value.email)) {
    error.value = t('login.invalidEmail');
    return;
  }
  if (
    (!devTestBuild || isRegister.value) &&
    (emailForm.value.password.length < (devTestBuild ? 1 : 8) ||
      emailForm.value.password.length > 32 ||
      (!devTestBuild &&
        isRegister.value &&
        (!/[A-Z]/.test(emailForm.value.password) ||
          !/[a-z]/.test(emailForm.value.password) ||
          !/\d/.test(emailForm.value.password))))
  ) {
    error.value = t('login.passwordHelp');
    return;
  }
  if (!devTestBuild && isRegister.value && !/^\d{6}$/.test(emailForm.value.code)) {
    error.value = t('login.invalidCode');
    return;
  }
  await run(
    () =>
      authStore.loginByEmail({
        email: normalizeEmailAddress(emailForm.value.email),
        ...(devTestBuild && !isRegister.value ? {} : { password: emailForm.value.password }),
        verifyCode: devTestBuild ? '000000' : isRegister.value ? emailForm.value.code : undefined,
        ...registration()
      }),
    true
  );
}
function toggleRegister() {
  isRegister.value = !isRegister.value;
  emailForm.value.code = '';
  showPassword.value = false;
  error.value = '';
}
async function wechat() {
  await run(async (attempt) => {
    if (desktop)
      return loginDesktopOAuth('wechat', authStore.desktopOAuth, current(), () => {
        error.value = t('login.browser');
      });
    if (platform === 'app')
      return loginNativeWechat(uni, (params) => authStore.loginByWechat({ ...params, ...registration() }), current());
    if (platform === 'mp-weixin') {
      const valid = current();
      const result = await new Promise((resolve, reject) =>
        uni.login({ provider: 'weixin', success: resolve, fail: reject })
      );
      if (!valid()) return null;
      return authStore.loginByWechat({ code: result.code, ...registration() });
    }
    const mode = isWeChatBrowser ? 'h5' : 'website';
    location.href = await beginWebOAuth(
      'wechat',
      mode === 'h5' ? config.wx.gzhAppId : config.wx.webAppId,
      mode === 'website' ? config.wx.webRedirectUri : '',
      { wechatMode: mode, attempt }
    );
    return null;
  }, true);
}
async function saveLoginInfo(data, attempt) {
  if (!data.token || !data.userId) {
    error.value = t('login.retry');
    return;
  }
  const userInfo = {
    uid: data.userId,
    _id: data.userId,
    userId: data.userId,
    nickName: data.userInfo?.nickname || t('login.learner'),
    avatarUrl: data.userInfo?.avatar_url || ''
  };
  const session = await storageService.saveLoginSession({ userId: data.userId, token: data.token, userInfo }, attempt);
  assertSession(session);
  storageService.migrateUserKeys(session);
  const userStore = useUserStore();
  userStore.restoreUserInfo?.();
  assertSession(session);
  uni.$emit('auth:userdata', userInfo, session);
  uni.$emit('loginStatusChanged', true);
  uni.$emit('userInfoUpdated', userInfo);
  toast.success(isRegister.value ? '注册成功' : '登录成功');
  emailForm.value = { email: '', password: '', code: '' };
  phone.value = '';
  phoneSent.value = false;
  phoneCode.value = '';
  ageTicket = '';
  let connectorRoute = null;
  if (!WEBSITE_MODE) {
    const learning = useConversationLearningStore();
    try {
      const catalog = await learning.loadModels();
      assertSession(session);
      if (catalog.success && learning.needsConnection) connectorRoute = learning.openModelConnector().route;
    } catch {
      assertSession(session);
    }
  }
  const valid = current();
  clearTimeout(redirectTimer);
  redirectTimer = setTimeout(
    () => {
      if (valid()) navigateAfterLogin(connectorRoute);
    },
    devTestBuild ? 0 : 1500
  );
}
function navigateAfterLogin(connectorRoute) {
  if (connectorRoute) {
    if (desktop) uni.redirectTo({ url: '/pages/learning/index', success: () => safeNavigateTo(connectorRoute) });
    else safeNavigateTo(connectorRoute);
    return;
  }
  const redirect = storageService.get('redirect_after_login');
  storageService.remove('redirect_after_login');
  if (WEBSITE_MODE) {
    goHome();
    return;
  }
  if (typeof redirect === 'string' && /^\/pages\/[a-zA-Z0-9_/-]+$/.test(redirect))
    uni.redirectTo({ url: redirect, fail: () => openHomeTab() });
  else openHomeTab();
}
function openPrivacy() {
  safeNavigateTo('/pages/settings/privacy');
}
function openTerms() {
  safeNavigateTo('/pages/settings/terms');
}
onMounted(async () => {
  if (platform === 'app')
    uni.getProvider({
      service: 'oauth',
      success: (result) => {
        if (active) providers.value = result.provider || [];
      }
    });
  const valid = current();
  try {
    const response = await authStore.regionalLogin({
      type: 'capabilities',
      platform,
      wechatMode: isWeChatBrowser ? 'h5' : 'website'
    });
    if (valid() && response.code === 0) capabilities.value = response.data || {};
  } catch {
    /* hide unavailable providers */
  }
});
</script>
<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: var(--s-4) var(--s-5) var(--s-8);
  background:
    radial-gradient(ellipse at 22% 18%, var(--glow-1), transparent 52%),
    radial-gradient(ellipse at 85% 75%, var(--glow-2), transparent 50%), var(--canvas);
  color: var(--ink);
  font-family: var(--font-ui);
}
.login-top {
  display: flex;
  gap: var(--s-2);
  align-items: center;
  justify-content: space-between;
  max-width: var(--account-header-width);
  margin: 0 auto;
  padding-top: max(var(--yozi-nav-top, 0px), env(safe-area-inset-top));
  flex-wrap: wrap;
}
.login-content {
  max-width: var(--account-width);
  margin: var(--s-8) auto 0;
}
.login-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  text-align: center;
  margin-bottom: var(--s-6);
}
.login-title {
  display: block;
  font-size: var(--size-title-1);
  font-weight: var(--weight-ui-emphasis);
  line-height: var(--leading-title-1);
}
.login-subtitle,
.login-offline {
  color: var(--ink-3);
  font-size: var(--size-small);
  line-height: var(--leading-body);
}
.login-stack {
  display: grid;
  gap: var(--s-4);
}
.login-agreement {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--s-1);
  margin-top: var(--s-6);
  color: var(--ink-3);
  font-size: var(--size-small);
  line-height: var(--leading-small);
}
.policy-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-min);
  color: var(--violet);
  cursor: pointer;
}
.policy-link:focus-visible {
  outline: var(--border-selected) solid var(--focus);
  outline-offset: var(--focus-offset);
}
.login-error {
  display: block;
  color: var(--coral);
  font-size: var(--size-small);
  line-height: var(--leading-body);
  margin-top: var(--s-4);
}
.login-offline {
  display: grid;
  gap: var(--s-2);
  text-align: center;
  margin-top: var(--s-6);
}
@media (max-width: 480px) {
  .login-top {
    flex-wrap: wrap;
  }
  .login-content {
    margin-top: var(--s-6);
  }
}
</style>

<style scoped>
.login-panel {
  border: var(--border-thin) solid var(--glass-line);
  box-shadow: var(--lift-3);
}
.login-content {
  margin-top: var(--s-5);
}
.login-hero .yozi-mascot {
  width: 144px;
  height: 144px;
}
.login-title {
  text-wrap: balance;
}
.login-offline {
  justify-items: stretch;
}
@media (max-width: 767px) {
  .login-hero .yozi-mascot {
    width: 112px;
    height: 112px;
  }
}
</style>

<style scoped>
.lazy-login {
  background: #faf9f6;
  padding: 20px;
  color: #2a2a25;
  --ink: #2a2a25;
  --ink-2: #515744;
  --ink-3: #7b7b70;
  --ink-placeholder: #7b7b70;
  --paper: #fff;
  --paper-sunk: #f3f4ee;
  --control-line: #deded5;
  --field-bg: #fff;
  --glass-line: #e3e2db;
  --violet: #515744;
  --violet-ink: #414835;
  --violet-soft: #e7e9df;
  --coral: #b42a45;
  --coral-soft: #fce6ea;
  --focus: #6b7652;
}
.login-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(400px, 1fr);
  gap: 24px;
  max-width: 1480px;
  margin: 0 auto;
  min-height: calc(100vh - 40px);
}
.login-form-column {
  padding: 12px 32px 48px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.lazy-login .login-top {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  max-width: none;
}
.lazy-login .login-content {
  width: 100%;
  max-width: 380px;
  margin: auto;
  box-sizing: border-box;
  padding: 40px 0;
}
.lazy-login .login-hero {
  align-items: flex-start;
  text-align: left;
  gap: 12px;
  margin-bottom: 32px;
}
.lazy-login .login-title {
  font-size: 34px;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: -0.055em;
}
.lazy-login .login-subtitle {
  font-size: 13px;
  line-height: 1.6;
}
.lazy-login .login-panel {
  background: transparent;
  border: 0;
  box-shadow: none;
  overflow: visible;
}
.lazy-login :deep(.login-panel > .base-card__body) {
  padding: 0;
}
.lazy-login :deep(.base-field__group) {
  background: #fff;
  border-color: #deded5;
  border-radius: 10px;
  min-height: 48px;
}
.lazy-login :deep(.base-button--primary) {
  background: #292b24;
  color: #fff;
  border-color: #292b24;
  box-shadow: none;
  border-radius: 10px;
  min-height: 48px;
}
.lazy-login :deep(.base-button--secondary) {
  background: #fff;
  color: #34372d;
  border: 1px solid #deded5;
  box-shadow: none;
  border-radius: 10px;
}
.lazy-login :deep(.base-button--quiet) {
  color: #6a6d5f;
  font-size: 13px;
}
.lazy-login .policy-link {
  color: #515744;
  font-size: 12px;
}
.lazy-login .login-agreement {
  font-size: 12px;
  line-height: 1.6;
}
.login-home {
  margin: 24px auto 0;
}
.lazy-login .login-offline {
  margin-top: 28px;
}
@media (max-width: 760px) {
  .lazy-login {
    padding: 12px;
  }
  .login-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    min-height: calc(100vh - 24px);
  }
  .login-form-column {
    padding: 0 16px 24px;
  }
  .lazy-login .login-content {
    padding: 28px 0;
    margin: 0 auto;
  }
  .lazy-login .login-hero {
    margin-bottom: 24px;
  }
  .lazy-login .login-title {
    font-size: 30px;
  }
  .lazy-login:not(.website-login) {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  .lazy-login:not(.website-login).theme-light {
    background: var(--yozi-mobile-surface);
    color: var(--yozi-mobile-ink);
    --ink: var(--yozi-mobile-ink);
    --ink-2: var(--yozi-mobile-muted);
    --ink-3: var(--yozi-mobile-muted);
  }
  .lazy-login:not(.website-login) :deep(.brand-scene) {
    min-height: 216px;
    background: var(--yozi-mobile-sky);
    color: var(--yozi-mobile-ink);
  }
  .lazy-login:not(.website-login) :deep(.brand-scene__media) {
    left: 44%;
    width: 56%;
    object-position: 80% center;
    mask-image: linear-gradient(to right, transparent, #000 22%);
    mix-blend-mode: multiply;
  }
  .lazy-login:not(.website-login) :deep(.brand-scene__copy) {
    right: 45%;
    left: 20px;
    font-size: clamp(21px, 6.5vw, 28px);
  }
  .lazy-login:not(.website-login) :deep(.base-button--primary:not([disabled])) {
    background: var(--yozi-mobile-action);
    border-color: var(--yozi-mobile-action);
    color: var(--yozi-mobile-ink);
  }
}
</style>
