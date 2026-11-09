<template>
  <view class="study-trend-chart"
    ><BaseSegmented
      :model-value="selectedRange"
      :options="ranges"
      :label="t('study.rangeLabel')"
      @update:model-value="selectRange" /><view class="chart-wrapper"
      ><canvas
        id="trendChart"
        canvas-id="trendChart"
        class="trend-canvas"
        :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
        :aria-label="t('study.chartLabel')"
      ></canvas></view
    ><view class="stats-row"
      ><BaseStat :label="t('study.totalMinutes')" :value="totalMinutes" /><BaseStat
        :label="t('study.averageMinutes')"
        :value="avgMinutes" /></view
    ><BaseListRow
      :label="t('study.trend')"
      :value="t('study.trendValue', { direction: t('study.' + trendDirection), percent: trendPercent })"
  /></view>
</template>
<script setup>
import { learningDateTimeFormat } from '../../../laf-backend/functions/_shared/learning-date-time.js';
import { computed, ref, watch, onMounted, onBeforeUnmount, getCurrentInstance, nextTick } from 'vue';

const props = defineProps({
  // 学习记录数据 { 'YYYY-MM-DD': minutes }
  studyData: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['range-change']);

import { t, currentLanguage } from '@/i18n/index.js';
import { tokens } from '@/design/tokens.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
import BaseStat from '@/components/base/base-stat/base-stat.vue';
import BaseListRow from '@/components/base/base-list-row/base-list-row.vue';
const theme = useThemeStore();
const palette = computed(() => tokens[theme.isDark ? 'dark' : 'light']);
const size = (name) => parseFloat(palette.value[name]);
const selectedRange = ref(7);
const ranges = computed(() => [7, 14, 30].map((value) => ({ value, label: t('study.range', { count: value }) })));
const canvasWidth = ref(size('--dialog-width'));
const canvasHeight = ref(size('--s-10') * 5);
const chartData = ref([]);
const totalMinutes = ref(0);
const avgMinutes = ref(0);
const trendDirection = ref('stable');
const trendPercent = ref(0);

const instance = getCurrentInstance();

// [AUDIT FIX R135] 移除 deep: true —— 父组件替换整个 studyData 对象引用时
// 浅引用比较已能捕获变化，无需深度遍历每个属性
watch(
  () => props.studyData,
  () => {
    prepareChartData();
    nextTick(() => {
      drawChart();
    });
  }
);

watch(selectedRange, () => {
  prepareChartData();
  nextTick(() => {
    drawChart();
  });
});

watch([() => theme.isDark, currentLanguage], () => {
  prepareChartData();
  nextTick(drawChart);
});

// 定时器追踪，防止组件卸载后执行回调
let _chartTimer = null;

onMounted(() => {
  initCanvas();
});

onBeforeUnmount(() => {
  if (_chartTimer) {
    clearTimeout(_chartTimer);
    _chartTimer = null;
  }
});

/**
 * 初始化 Canvas
 */
function initCanvas() {
  // 获取容器宽度
  const query = uni.createSelectorQuery().in(instance.proxy);
  query
    .select('.chart-wrapper')
    .boundingClientRect((rect) => {
      if (rect) {
        canvasWidth.value = rect.width - size('--s-4') * 2; // 减去 padding
        canvasHeight.value = size('--s-10') * 5;
      }
      prepareChartData();
      nextTick(() => {
        _chartTimer = setTimeout(() => {
          _chartTimer = null;
          drawChart();
        }, 100);
      });
    })
    .exec();
}

/**
 * 准备图表数据
 */
function prepareChartData() {
  const data = [];
  const today = new Date();

  for (let i = selectedRange.value - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = formatDate(date);
    const minutes = props.studyData[dateStr] || 0;

    data.push({
      date: date,
      dateStr: dateStr,
      label: getDateLabel(date),
      minutes: minutes
    });
  }

  chartData.value = data;
  calculateSummary();
}

/**
 * 计算摘要数据
 */
function calculateSummary() {
  const minutes = chartData.value.map((d) => d.minutes);
  totalMinutes.value = minutes.reduce((a, b) => a + b, 0);
  avgMinutes.value = chartData.value.length > 0 ? Math.round(totalMinutes.value / chartData.value.length) : 0;

  // 计算趋势（比较前半段和后半段）
  const mid = Math.floor(minutes.length / 2);
  const firstHalf = minutes.slice(0, mid);
  const secondHalf = minutes.slice(mid);

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length || 0;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length || 0;

  if (firstAvg === 0 && secondAvg === 0) {
    trendDirection.value = 'stable';
    trendPercent.value = 0;
  } else if (firstAvg === 0) {
    trendDirection.value = 'up';
    trendPercent.value = 100;
  } else {
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    trendPercent.value = Math.abs(Math.round(change));

    if (change > 5) {
      trendDirection.value = 'up';
    } else if (change < -5) {
      trendDirection.value = 'down';
    } else {
      trendDirection.value = 'stable';
    }
  }
}

/**
 * 绘制图表
 */
function drawChart() {
  const ctx = uni.createCanvasContext('trendChart', instance.proxy);
  if (!ctx) return;

  const width = canvasWidth.value;
  const height = canvasHeight.value;
  const padding = { top: size('--s-5'), right: size('--s-5'), bottom: size('--s-10'), left: size('--s-10') };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 获取数据范围
  const values = chartData.value.map((d) => d.minutes);
  const maxValue = Math.max(...values, 10); // 至少显示到10
  const minValue = 0;

  // 绘制背景网格
  drawGrid(ctx, padding, chartWidth, chartHeight, maxValue);

  // 绘制折线和面积
  drawLineAndArea(ctx, padding, chartWidth, chartHeight, maxValue, minValue);

  // 绘制数据点
  drawDataPoints(ctx, padding, chartWidth, chartHeight, maxValue, minValue);

  // 绘制X轴标签
  drawXLabels(ctx, padding, chartWidth, chartHeight);

  ctx.draw();
}

/**
 * 绘制网格
 */
function drawGrid(ctx, padding, chartWidth, chartHeight, maxValue) {
  const gridLines = 4;
  ctx.setStrokeStyle(palette.value['--line']);
  ctx.setLineWidth(size('--border-thin'));

  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartHeight / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();

    // Y轴标签
    const value = Math.round(maxValue - (maxValue / gridLines) * i);
    ctx.setFillStyle(palette.value['--ink-3']);
    ctx.setFontSize(size('--size-caption'));
    ctx.setTextAlign('right');
    ctx.fillText(value.toString(), padding.left - 5, y + 3);
  }
}

/**
 * 绘制折线和面积
 */
function drawLineAndArea(ctx, padding, chartWidth, chartHeight, maxValue, _minValue) {
  if (chartData.value.length === 0) return;

  const points = chartData.value.map((d, i) => {
    const x = padding.left + (chartWidth / (chartData.value.length - 1 || 1)) * i;
    const y = padding.top + chartHeight - (d.minutes / maxValue) * chartHeight;
    return { x, y };
  });

  // 绘制渐变面积
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  gradient.addColorStop(0, palette.value['--violet-soft-2']);
  gradient.addColorStop(1, palette.value['--paper']);

  ctx.beginPath();
  ctx.moveTo(points[0].x, padding.top + chartHeight);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
  ctx.closePath();
  ctx.setFillStyle(gradient);
  ctx.fill();

  // 绘制折线
  ctx.beginPath();
  ctx.setStrokeStyle(palette.value['--violet']);
  ctx.setLineWidth(size('--border-selected'));
  ctx.setLineCap('round');
  ctx.setLineJoin('round');

  points.forEach((p, i) => {
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  });
  ctx.stroke();
}

/**
 * 绘制数据点
 */
function drawDataPoints(ctx, padding, chartWidth, chartHeight, maxValue, _minValue) {
  chartData.value.forEach((d, i) => {
    const x = padding.left + (chartWidth / (chartData.value.length - 1 || 1)) * i;
    const y = padding.top + chartHeight - (d.minutes / maxValue) * chartHeight;

    // 外圈
    ctx.beginPath();
    ctx.arc(x, y, size('--s-3') / 2, 0, Math.PI * 2);
    ctx.setFillStyle(palette.value['--paper']);
    ctx.fill();
    ctx.setStrokeStyle(palette.value['--violet']);
    ctx.setLineWidth(size('--border-selected'));
    ctx.stroke();

    // 内圈
    ctx.beginPath();
    ctx.arc(x, y, size('--s-3') / 4, 0, Math.PI * 2);
    ctx.setFillStyle(palette.value['--violet']);
    ctx.fill();
  });
}

/**
 * 绘制X轴标签
 */
function drawXLabels(ctx, padding, chartWidth, chartHeight) {
  ctx.setFillStyle(palette.value['--ink-3']);
  ctx.setFontSize(size('--size-caption'));
  ctx.setTextAlign('center');

  // 根据数据量决定显示哪些标签
  const step = chartData.value.length <= 7 ? 1 : Math.ceil(chartData.value.length / 7);

  chartData.value.forEach((d, i) => {
    if (i % step === 0 || i === chartData.value.length - 1) {
      const x = padding.left + (chartWidth / (chartData.value.length - 1 || 1)) * i;
      const y = padding.top + chartHeight + 20;
      ctx.fillText(d.label, x, y);
    }
  });
}

/**
 * 选择时间范围
 */
function selectRange(range) {
  selectedRange.value = range;
  emit('range-change', range);
}

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
 * 获取日期标签
 */
function getDateLabel(date) {
  return learningDateTimeFormat(currentLanguage.value, { month: 'numeric', day: 'numeric' }).format(date);
}
</script>
<style scoped>
.study-trend-chart {
  width: 100%;
}
.chart-wrapper {
  padding: var(--s-4);
  overflow: hidden;
}
.stats-row {
  display: flex;
  gap: var(--s-3);
  flex-wrap: wrap;
}
</style>
