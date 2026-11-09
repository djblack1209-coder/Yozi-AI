<template>
  <view class="study-heatmap"
    ><scroll-view class="heatmap-scroll" scroll-x
      ><view class="heatmap-grid"
        ><view v-for="(week, weekIndex) in heatmapData" :key="weekIndex" class="week-column"
          ><text>{{ monthLabels[weekIndex] }}</text
          ><BaseButton
            v-for="(day, dayIndex) in week"
            :key="dayIndex"
            variant="quiet"
            :disabled="!day"
            :selected="selectedDay?.key === day?.key"
            :class="getDayClass(day)"
            :label="day ? t('study.dayLabel', { date: day.dateStr, minutes: day.minutes }) : t('study.noDay')"
            @tap="handleDayTap(day)"
            ><BaseTag :tone="day?.level > 2 ? 'mint' : day?.level ? 'violet' : 'neutral'">{{
              day?.minutes || '·'
            }}</BaseTag></BaseButton
          ></view
        ></view
      ></scroll-view
    ><text class="heatmap-caption">{{ t('study.heatmapLegend') }}</text
    ><view class="stats-row"
      ><BaseStat :label="t('study.learningDays')" :value="totalDays" /><BaseStat
        :label="t('study.currentStreak')"
        :value="currentStreak" /><BaseStat :label="t('study.maxStreak')" :value="maxStreak" /></view
    ><BaseListRow
      v-if="selectedDay"
      :label="selectedDay.dateStr"
      :value="t('study.minutes', { count: selectedDay.minutes })"
  /></view>
</template>
<script setup>
import { learningDateTimeFormat } from '../../../../laf-backend/functions/_shared/learning-date-time.js';
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { t, currentLanguage } from '@/i18n/index.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseStat from '@/components/base/base-stat/base-stat.vue';
import BaseTag from '@/components/base/base-tag/base-tag.vue';
import BaseListRow from '@/components/base/base-list-row/base-list-row.vue';
import { initTheme, onThemeUpdate, offThemeUpdate } from '@/composables/useTheme';

// ---- Props & Emits ----
const props = defineProps({
  // 学习记录数据 { 'YYYY-MM-DD': minutes }
  studyData: {
    type: Object,
    default: () => ({})
  },
  // 显示的周数（默认显示最近52周，即一年）
  weeks: {
    type: Number,
    default: 52
  }
});

const emit = defineEmits(['day-tap']);

// ---- 响应式状态 ----
const heatmapData = ref([]);
const monthLabels = ref([]);
const selectedDay = ref(null);
const totalDays = ref(0);
const currentStreak = ref(0);
const maxStreak = ref(0);
const isDark = ref(false);

// 主题回调引用，用于卸载时取消监听
let themeHandlerRef = null;

// ---- 工具函数 ----

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化显示日期
 */
function formatDisplayDate(date) {
  return learningDateTimeFormat(currentLanguage.value, { month: 'short', day: 'numeric', weekday: 'short' }).format(
    date
  );
}

/**
 * 获取月份标签
 */
function getMonthLabel(date) {
  return learningDateTimeFormat(currentLanguage.value, { month: 'short' }).format(date);
}

/**
 * 根据学习时长获取等级 (0-4)
 */
function getLevel(minutes) {
  if (minutes === 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

/**
 * 获取日期格子的类名
 */
function getDayClass(day) {
  if (!day) return 'empty';
  return `level-${day.level}`;
}

/**
 * 获取日期格子的样式
 */

// ---- 核心逻辑 ----

/**
 * 生成月份标签
 */
function generateMonthLabels() {
  const labels = [];
  const today = new Date();

  for (let i = 0; i < props.weeks; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (props.weeks - 1 - i) * 7);

    if (i === 0 || date.getDate() <= 7) {
      labels.push(getMonthLabel(date));
    } else {
      labels.push('');
    }
  }

  monthLabels.value = labels;
}

/**
 * 生成热力图数据
 */
function generateHeatmapData() {
  const today = new Date();
  const data = [];
  const months = new Set();

  // 计算起始日期（从最近的周日开始往前推）
  const endDate = new Date(today);
  const _dayOfWeek = endDate.getDay();

  // 计算需要显示的总天数
  const total = props.weeks * 7;

  // 从今天往前推算
  for (let i = total - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const weekIndex = Math.floor((total - 1 - i) / 7);
    const dayIndex = date.getDay();

    if (!data[weekIndex]) {
      data[weekIndex] = new Array(7).fill(null);
    }

    const dateStr = formatDate(date);
    const minutes = props.studyData[dateStr] || 0;

    data[weekIndex][dayIndex] = {
      date: date,
      dateStr: formatDisplayDate(date),
      key: dateStr,
      minutes: minutes,
      level: getLevel(minutes)
    };

    // 收集月份标签
    if (date.getDate() <= 7) {
      months.add(getMonthLabel(date));
    }
  }

  heatmapData.value = data;
  generateMonthLabels();
}

/**
 * 计算统计数据
 */
function calculateStats() {
  let _totalDays = 0;
  let _currentStreak = 0;
  let _maxStreak = 0;
  let tempStreak = 0;

  const today = new Date();
  const sortedDates = Object.keys(props.studyData).sort().reverse();

  // 计算总学习天数
  _totalDays = sortedDates.filter((date) => props.studyData[date] > 0).length;

  // 计算连续天数
  const checkDate = new Date(today);
  let isCurrentStreak = true;

  for (let i = 0; i < 365; i++) {
    const dateStr = formatDate(checkDate);
    const minutes = props.studyData[dateStr] || 0;

    if (minutes > 0) {
      tempStreak++;
      if (isCurrentStreak) {
        _currentStreak = tempStreak;
      }
    } else {
      if (isCurrentStreak && i > 0) {
        isCurrentStreak = false;
      }
      _maxStreak = Math.max(_maxStreak, tempStreak);
      tempStreak = 0;
    }

    checkDate.setDate(checkDate.getDate() - 1);
  }

  _maxStreak = Math.max(_maxStreak, tempStreak, _currentStreak);

  totalDays.value = _totalDays;
  currentStreak.value = _currentStreak;
  maxStreak.value = _maxStreak;
}

/**
 * 处理日期点击
 */
function handleDayTap(day) {
  if (!day) return;
  selectedDay.value = day;
  emit('day-tap', day);
}

// ---- 侦听器 ----
// [AUDIT FIX R135] 移除 deep: true —— 父组件替换整个 studyData 对象引用时
// 浅引用比较已能捕获变化，无需深度遍历 52×7 个属性
watch(
  () => props.studyData,
  () => {
    generateHeatmapData();
    calculateStats();
  },
  { immediate: true }
);

watch(currentLanguage, () => {
  generateHeatmapData();
  if (selectedDay.value)
    selectedDay.value = { ...selectedDay.value, dateStr: formatDisplayDate(selectedDay.value.date) };
});

// ---- 生命周期 ----
onMounted(() => {
  isDark.value = initTheme();
  themeHandlerRef = (mode) => {
    isDark.value = mode === 'dark';
  };
  onThemeUpdate(themeHandlerRef);
});

onBeforeUnmount(() => {
  if (themeHandlerRef) {
    offThemeUpdate(themeHandlerRef);
  }
});
</script>
<style scoped>
.study-heatmap {
  width: 100%;
}
.heatmap-grid {
  display: inline-flex;
  gap: var(--s-1);
}
.week-column {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.week-column > text {
  min-height: var(--leading-small);
  font-size: var(--size-caption);
}
.stats-row {
  display: flex;
  gap: var(--s-3);
  flex-wrap: wrap;
}
.heatmap-caption {
  color: var(--ink-3);
  font-size: var(--size-small);
}
</style>
