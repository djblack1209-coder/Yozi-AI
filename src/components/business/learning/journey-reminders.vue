<template>
  <view v-if="learning.journey" ref="root" class="journey-reminders" data-test="journey-reminders">
    <view class="reminder-heading"
      ><text class="section-title">{{ t('learning.kjj') }}</text>
      <BaseButton :aria-expanded="editing" variant="quiet" @tap="edit">
        {{ editing ? t('learning.k3x') : t('learning.kgy') }}
      </BaseButton></view
    >
    <view v-if="editing" class="reminder-form">
      <view class="button-row" :aria-label="t('learning.kjz')">
        <BaseChip
          v-for="kind in REMINDER_KINDS"
          :key="kind.id"
          :class="{ chosen: form.kind === kind.id }"
          :model-value="form.kind === kind.id"
          @update:model-value="form.kind = kind.id"
        >
          {{ learningText(kind.label) }}
        </BaseChip>
      </view>
      <view class="button-row" :aria-label="t('learning.km6')">
        <BaseChip
          v-for="time in ['08:00', '14:00', '20:00']"
          :key="time"
          :model-value="form.time === time"
          @update:model-value="form.time = time"
        >
          {{ time }}
        </BaseChip>
        <BaseButton variant="quiet" @tap="nearbyTime">{{ t('learning.kbw') }}</BaseButton>
      </view>
      <label
        ><text>{{ t('learning.k97') }}</text
        ><BaseInput v-model="form.time" placeholder="HH:mm" maxlength="5" :label="t('learning.k97')"
      /></label>
      <label
        ><text>{{ t('learning.kux') }}</text
        ><BaseInput v-model="form.timezone" maxlength="80" :label="t('learning.kb7')"
      /></label>
      <view class="button-row" :aria-label="t('learning.kmb')">
        <BaseChip
          v-for="(label, day) in weekdays"
          :key="day"
          :class="{ chosen: form.repeatDays.includes(day) }"
          :model-value="form.repeatDays.includes(day)"
          @update:model-value="toggleDay(day)"
        >
          {{ learningText(label) }}
        </BaseChip>
      </view>
      <view class="button-row"
        ><BaseButton
          class="primary"
          :disabled="busy"
          :aria-disabled="busy"
          data-test="reminder-save"
          variant="primary"
          @tap="save"
          >{{ t('learning.kq7') }}</BaseButton
        ><BaseButton variant="quiet" @tap="cancelEdit()">{{ t('learning.k8s') }}</BaseButton></view
      >
    </view>
    <view v-for="reminder in learning.active.reminders || []" :key="reminder.id" class="reminder-row">
      <view
        ><text>{{ learningText(kindName(reminder.kind)) }} · {{ reminder.time }}</text>
        <text class="reminder-meta"
          >{{ reminder.timezone }} · {{ reminder.repeatDays.map((d) => weekdays[d]).join('、') }} ·
          {{ reminder.enabled ? t('learning.kok') : t('learning.kv5') }}</text
        ></view
      >
      <BaseButton :disabled="busy" :aria-disabled="busy" variant="quiet" @tap="toggle(reminder)">
        {{ reminder.enabled ? t('learning.k1x') : t('learning.kpf') }}
      </BaseButton>
    </view>
    <text v-for="receipt in latestReceipts" :key="receipt.id" class="reminder-meta"
      >{{ learningText(kindName(receipt.kind)) }} · {{ receipt.day }} ·
      {{ receipt.historyOnly ? t('learning.k1') : receiptLabel(receipt.status) }}</text
    >
    <view class="button-row"
      ><BaseButton
        :disabled="busy || channel === 'unsupported'"
        :aria-disabled="busy || channel === 'unsupported'"
        data-test="reminder-permission"
        variant="quiet"
        @tap="allow"
        >{{ t('learning.k8k') }}{{ channel === 'macos' ? t('learning.k8g') : t('learning.kfq')
        }}{{ t('learning.kex') }}</BaseButton
      >
      <BaseButton v-if="channel === 'macos'" :disabled="busy" :aria-disabled="busy" variant="quiet" @tap="check">{{
        t('learning.khk')
      }}</BaseButton></view
    >
    <text class="reminder-meta">{{
      channel === 'macos' ? t('learning.kk8') : channel === 'web' ? t('learning.kfc') : t('learning.ke3')
    }}</text>
    <view v-if="message" class="reminder-feedback"
      ><BaseEmpty v-if="failed" state="error" :title="learningText(message)" mascot-size="small" /><text v-else>{{
        learningText(message)
      }}</text></view
    >
  </view>
</template>
<script setup>
import { dateTimeParts, learningDateTimeFormat } from '../../../../laf-backend/functions/_shared/learning-date-time.js';
import BaseEmpty from '@/components/base/base-empty/base-empty.vue';
import { learningText } from '@/i18n/learning.js';
import { publicError, t } from '@/i18n/index.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseChip from '@/components/base/base-chip/base-chip.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { REMINDER_KINDS } from '../../../../laf-backend/functions/_shared/learning-reminders.js';
import { learningNotificationsFor } from '@/services/learning/learning-notifications.js';
import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { captureSession, checkSession } from '@/services/auth-storage.js';
const learning = useConversationLearningStore();
const root = ref(null),
  editing = ref(false),
  form = ref({}),
  message = ref(''),
  failed = ref(false),
  handling = ref(false);
const controller = learningNotificationsFor(learning);
const channel = controller.channel;
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const busy = computed(
  () => handling.value || learning.busy || learning.syncBusy || learning.materialBusy || learning.historyBusy
);
const latestReceipts = computed(() =>
  (learning.active.reminders || [])
    .map((reminder) => {
      const receipt = (learning.active.reminderReceipts || [])
        .filter((r) => r.reminderId === reminder.id && r.generation === reminder.generation)
        .at(-1);
      return receipt ? { ...receipt, kind: reminder.kind } : null;
    })
    .filter(Boolean)
);
const receiptLabel = (status) =>
  ({
    accepted: '终端已显示通知',
    failed: '显示失败，请调整并重新保存提醒',
    unknown: '显示状态待确认',
    opened: '已从提醒返回'
  })[status];
let unbind = () => undefined,
  refreshTimer = null,
  editBinding = null;
const editTarget = () => JSON.stringify([learning.recordContext(), learning.selectedConversationId]);
function cancelEdit(changed = false) {
  editing.value = false;
  form.value = {};
  editBinding = null;
  if (changed) {
    message.value = t('ui.contextChanged');
    failed.value = true;
  }
}
function currentEdit() {
  if (!editBinding) return false;
  const status = checkSession(editBinding.session);
  if (status === 'unavailable') {
    message.value = t('ui.storageBusy');
    failed.value = true;
    return false;
  }
  if (status === 'changed' || editBinding.target !== editTarget()) {
    cancelEdit(true);
    return false;
  }
  return true;
}
const kindName = (id) => REMINDER_KINDS.find((k) => k.id === id)?.label || '提醒';
function nearbyTime() {
  try {
    const clock = learningDateTimeFormat('en-GB', {
      timeZone: form.value.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    const { hour, minute } = dateTimeParts(clock, Date.now() + 3 * 60000);
    form.value.time = `${hour}:${minute}`;
  } catch {
    message.value = '请先填写有效时区';
    failed.value = true;
  }
}
function edit() {
  if (editing.value) {
    cancelEdit();
  } else {
    const session = captureSession();
    if (!session || checkSession(session) !== 'current') {
      message.value = t('ui.storageBusy');
      failed.value = true;
      return;
    }
    editBinding = { session, target: editTarget() };
    if (!currentEdit()) return;
    form.value = {
      kind: 'study',
      time: '20:00',
      repeatDays: [0, 1, 2, 3, 4, 5, 6],
      timezone: learning.journey.timezone,
      enabled: true
    };
    editing.value = true;
  }
  message.value = '';
}
function toggleDay(day) {
  form.value.repeatDays = form.value.repeatDays.includes(day)
    ? form.value.repeatDays.filter((d) => d !== day)
    : [...form.value.repeatDays, day];
}
async function operation(callback) {
  if (busy.value) return;
  handling.value = true;
  try {
    const result = await callback();
    failed.value = false;
    message.value =
      result?.status === 'partial-scheduled'
        ? `本机系统已确认 ${result.count} / ${result.total} 项安排，后续重开接续`
        : result?.status === 'scheduled'
          ? `本机系统已确认 ${result.count} 项定时安排`
          : '提醒设置已保存';
  } catch (error) {
    message.value = publicError(error) || '提醒暂不可用，请重试';
    failed.value = true;
  } finally {
    handling.value = false;
  }
}
function save() {
  if (!currentEdit()) return;
  // Keep the original record/conversation while accepting unrelated revision advances.
  const context = JSON.stringify([...JSON.parse(editBinding.target), learning.state.revision]);
  operation(async () => {
    learning.configureReminder(context, form.value);
    cancelEdit();
    return controller.refresh();
  });
}
function toggle(reminder) {
  operation(async () => {
    const { kind, time, timezone, repeatDays, enabled } = reminder;
    learning.configureReminder(learning.journeyContext(), {
      reminderId: reminder.id,
      kind,
      time,
      timezone,
      repeatDays,
      enabled: !enabled
    });
    return controller.refresh();
  });
}
function allow() {
  operation(() => controller.allow());
}
function check() {
  operation(() => controller.refresh());
}
watch(
  () => [learning.recordContext(), learning.selectedConversationId],
  () => {
    if (editing.value) currentEdit();
  }
);
watch(
  () => `${learning.recordContext()}:${learning.state.revision}`,
  () => {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      controller.refresh().catch((error) => {
        message.value = publicError(error);
        failed.value = true;
      });
    }, 250);
  }
);
onMounted(() => {
  unbind = bindLearningKeyboard(root.value);
  controller.initialize().catch((error) => {
    message.value = publicError(error);
    failed.value = true;
  });
});
onUnmounted(() => {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  unbind();
});
</script>
<style scoped>
.journey-reminders {
  margin-top: var(--s-8);
  padding-top: var(--s-6);
  border-top: var(--border-thin) solid var(--line);
}
.reminder-heading,
.reminder-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
}
.reminder-form {
  display: grid;
  gap: var(--s-4);
  margin-top: var(--s-5);
}
.reminder-form label {
  display: grid;
  gap: var(--s-2);
  font-size: var(--size-small);
}
.reminder-row {
  margin: var(--s-4) 0;
  padding: var(--s-3) 0;
  border-bottom: var(--border-thin) solid var(--line);
}
.reminder-row > view {
  min-width: 0;
  flex: 1;
  font-size: var(--size-body);
  line-height: 1.75;
}
.reminder-meta {
  display: block;
  font-size: var(--size-caption);
  color: var(--ink-3);
  line-height: 1.7;
  margin-top: var(--s-2);
  overflow-wrap: anywhere;
}
.reminder-feedback {
  display: block;
  font-size: var(--size-small);
  line-height: 1.7;
  margin-top: var(--s-4);
}
@media (max-width: 520px) {
  .reminder-heading {
    flex-wrap: wrap;
  }
}
</style>
