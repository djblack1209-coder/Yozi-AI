<template>
  <view class="study-reminders">
    <view class="settings-group">
      <view v-if="targets.length" class="reminder-target">
        <BaseInput v-model="targetId" label="学习目标" :options="targets" :disabled="busy" />
      </view>
      <template v-if="targets.length">
        <BaseListRow
          v-for="kind in kinds"
          :key="kind.id"
          :label="kind.label"
          :value="reminderLabel(kind.id)"
          :disabled="busy"
          @tap="edit(kind.id)"
        />
      </template>
      <BaseListRow label="系统通知" :value="permissionLabel" :disabled="busy" @tap="allow" />
      <BaseListRow v-if="permission === 'denied'" label="打开系统通知设置" :disabled="busy" @tap="openSettings" />
    </view>
    <view v-if="form" class="settings-group reminder-editor">
      <text class="reminder-form-title">{{ kinds.find((item) => item.id === form.kind)?.label }}</text>
      <BaseInput v-model="form.time" label="时间" placeholder="20:00" maxlength="5" :disabled="busy" />
      <BaseInput v-model="repeat" label="重复" :options="repeats" :disabled="busy" />
      <BaseInput v-model="enabled" label="状态" :options="states" :disabled="busy" />
      <text class="reminder-timezone">{{ form.timezone }}</text>
      <view class="reminder-actions">
        <BaseButton variant="quiet" :disabled="busy" @tap="form = null">取消</BaseButton>
        <BaseButton variant="primary" :loading="busy" :disabled="busy" @tap="save">保存</BaseButton>
      </view>
    </view>
    <view v-if="message" class="reminder-status" :role="failed ? 'alert' : 'status'">{{ message }}</view>
  </view>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseListRow from '@/components/base/base-list-row/base-list-row.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningNotificationsFor } from '@/services/learning/learning-notifications.js';
import { REMINDER_KINDS } from '../../../../laf-backend/functions/_shared/learning-reminders.js';
import { captureSession, checkSession } from '@/services/auth-storage.js';
import { publicError } from '@/i18n/index.js';
const learning = useConversationLearningStore();
const controller = learningNotificationsFor(learning);
const kinds = REMINDER_KINDS;
const targets = computed(() =>
  learning.state.conversations
    .filter((item) => !item.stopped && (item.coach?.profile || item.studyProfile || item.journey))
    .map((item) => ({ value: item.id, label: item.goal }))
);
const targetId = ref(''),
  form = ref(null),
  repeat = ref('daily'),
  enabled = ref('on');
const handling = ref(false),
  permission = ref('unknown'),
  message = ref(''),
  failed = ref(false);
const repeats = computed(() => [
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '周一至周五' },
  { value: 'weekends', label: '周末' },
  ...(repeat.value === 'custom' ? [{ value: 'custom', label: '保留原重复日' }] : [])
]);
const states = [
  { value: 'on', label: '开启' },
  { value: 'off', label: '暂停' }
];
const daysFor = (value) =>
  value === 'weekdays' ? [1, 2, 3, 4, 5] : value === 'weekends' ? [0, 6] : [0, 1, 2, 3, 4, 5, 6];
const busy = computed(() => handling.value || learning.busy || learning.syncBusy || learning.historyBusy);
const target = computed(() => learning.state.conversations.find((item) => item.id === targetId.value));
const permissionLabel = computed(
  () =>
    ({
      granted: controller.channel === 'web' ? '已允许 · 页面打开时' : '已允许',
      denied: '已关闭',
      default: '未开启',
      unsupported: '当前终端不支持',
      unknown: '未确认'
    })[permission.value] || '未确认'
);
let editBinding = null,
  mounted = true;
const binding = () => JSON.stringify([learning.recordContext(), targetId.value]);
const current = (saved) => mounted && checkSession(saved.session) === 'current' && saved.target === binding();
function reminderLabel(kind) {
  const item = target.value?.reminders?.find((value) => value.kind === kind);
  if (!item) return '未设置';
  return item.enabled
    ? `${item.time} · ${item.repeatDays.length === 7 ? '每天' : item.repeatDays.length === 5 && !item.repeatDays.includes(0) && !item.repeatDays.includes(6) ? '工作日' : item.repeatDays.map((day) => '日一二三四五六'[day]).join('、')}`
    : '已暂停';
}
function edit(kind) {
  editBinding = { session: captureSession(), target: binding() };
  const item = target.value?.reminders?.find((value) => value.kind === kind);
  form.value = item
    ? { ...item, reminderId: item.id, repeatDays: [...item.repeatDays] }
    : {
        kind,
        time: kind === 'recap' ? '21:00' : '20:00',
        timezone: target.value?.coach?.timezone || target.value?.journey?.timezone || learning.state.timezone
      };
  repeat.value =
    !item || item.repeatDays.length === 7
      ? 'daily'
      : item.repeatDays.length === 5 && !item.repeatDays.includes(0) && !item.repeatDays.includes(6)
        ? 'weekdays'
        : item.repeatDays.length === 2 && item.repeatDays.includes(0) && item.repeatDays.includes(6)
          ? 'weekends'
          : 'custom';
  enabled.value = item?.enabled === false ? 'off' : 'on';
  message.value = '';
}
async function operation(callback) {
  if (busy.value) return;
  const saved = { session: captureSession(), target: binding() };
  handling.value = true;
  message.value = '';
  failed.value = false;
  try {
    await callback(saved);
  } catch (error) {
    if (current(saved)) {
      failed.value = true;
      message.value = publicError(error) || '提醒未确认，请重试';
    }
  } finally {
    handling.value = false;
  }
}
function allow() {
  operation(async (saved) => {
    await controller.allow();
    if (!current(saved)) return;
    permission.value = await controller.permission();
    message.value = permission.value === 'granted' ? '系统通知已允许' : '通知未获授权';
  });
}
function openSettings() {
  operation(() => controller.openSettings());
}
function save() {
  if (!form.value || !editBinding || !current(editBinding)) {
    form.value = null;
    return;
  }
  const draft = { ...form.value },
    id = targetId.value,
    active = enabled.value === 'on';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(draft.time || '')) {
    failed.value = true;
    message.value = '请输入 00:00 至 23:59 的时间';
    return;
  }
  // An existing custom repeat remains intact until the user chooses another repeat.
  const repeatDays = repeat.value === 'custom' ? draft.repeatDays : daysFor(repeat.value);
  operation(async (saved) => {
    if (active) await controller.allow();
    if (!current(saved)) return;
    learning.configureStudyReminder(learning.recordContext(), id, {
      ...(draft.reminderId ? { reminderId: draft.reminderId } : {}),
      kind: draft.kind,
      time: draft.time,
      timezone: draft.timezone,
      repeatDays,
      enabled: active
    });
    form.value = null;
    const result = await controller.refresh();
    if (!current(saved)) return;
    permission.value = await controller.permission();
    message.value = !active
      ? '提醒已暂停'
      : result?.status === 'scheduled' || result?.status === 'partial-scheduled'
        ? `系统已安排至 ${
            learning
              .reminderQueue()
              .filter((job) => job.dueAt > Date.now())
              .slice(0, 64)
              .at(-1)?.day || ''
          }`
        : ['macos', 'ios'].includes(controller.channel)
          ? '提醒已保存，当前没有待安排任务'
          : controller.channel === 'web'
            ? '提醒已保存 · 页面打开时提醒'
            : '时间已保存，当前终端暂不能后台提醒';
  });
}
watch(
  () => targets.value.map((item) => item.value).join(','),
  () => {
    if (!targets.value.some((item) => item.value === targetId.value))
      targetId.value = targets.value.some((item) => item.value === learning.selectedConversationId)
        ? learning.selectedConversationId
        : targets.value[0]?.value || '';
  },
  { immediate: true }
);
watch(binding, () => {
  form.value = null;
  editBinding = null;
  message.value = '';
  permission.value = 'unknown';
});
onMounted(async () => {
  try {
    const value = await controller.permission();
    if (mounted) permission.value = value;
  } catch {
    /* Settings remain usable. */
  }
});
onUnmounted(() => {
  mounted = false;
  form.value = null;
  editBinding = null;
});
</script>
<style scoped>
.settings-group {
  margin: 0 0 18px;
  padding: 0 16px;
  background: var(--paper);
  border-radius: 12px;
  overflow: hidden;
}
.reminder-target {
  padding: 16px 0;
}
.settings-group :deep(.base-list-row) {
  padding: 0;
  min-height: 52px;
  font-size: 14px;
  line-height: 20px;
}
.settings-group :deep(.base-field__input) {
  font-size: 13px;
}
.reminder-target :deep(.base-field__label),
.reminder-timezone {
  color: var(--ink-3);
  font-size: 12px;
}
.reminder-empty,
.reminder-status {
  display: block;
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-2);
}
.reminder-editor {
  margin-top: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.reminder-form-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}
.reminder-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
