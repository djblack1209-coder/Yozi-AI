<template>
  <CustomModal
    visible
    :is-dark="isDark"
    :title="t('login.connectTitle')"
    :content="t('login.connectHelp')"
    :confirm-text="t('login.connectChoose')"
    :cancel-text="t('login.connectLater')"
    position="bottom"
    transition="slide-up"
    container-class="is-choice-sheet"
    mask-closable
    @confirm="$emit('choose')"
    @cancel="$emit('skip')"
  >
    <template #title>
      <view class="guide-art" aria-hidden="true">
        <view v-for="tile in tiles" :key="tile.icon" class="guide-orbit" :style="tile.style">
          <view class="guide-tile"><BaseIcon :name="tile.icon" size="19px" color="#11243d" /></view>
        </view>
      </view>
      <text>{{ t('login.connectTitle') }}</text>
    </template>
  </CustomModal>
</template>

<script setup>
import './messages.js';
import { t } from '@/i18n/index.js';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import CustomModal from '@/components/common/CustomModal.vue';

defineProps({ isDark: Boolean });
defineEmits(['choose', 'skip']);

// Tile centers sampled from the reference at 0, 1.28, 1.85, 2.30, 3.42, 4.80, 6.52, 8.22, 9.72 and 10.65 s.
const tiles = [
  [
    'book-open',
    '#a6d8ff',
    -12,
    [
      [69, 61],
      [72, 56],
      [92, 22],
      [90, 20],
      [89, 35],
      [91, 58],
      [81, 41],
      [71, 20],
      [85, 17],
      [61, 39]
    ]
  ],
  [
    'chat',
    '#b8eac8',
    16,
    [
      [45, 55],
      [31, 40],
      [53, 60],
      [30, 40],
      [31, 50],
      [48, 53],
      [62, 64],
      [10, 38],
      [7, 39],
      [8, 42]
    ]
  ],
  [
    'sparkle',
    '#c9c8ff',
    -8,
    [
      [58, 40],
      [54, 40],
      [48, 23],
      [45, 18],
      [46, 33],
      [53, 17],
      [11, 61],
      [7, 66],
      [8, 83],
      [8, 83]
    ]
  ],
  [
    'target',
    '#f1c7de',
    14,
    [
      [56, 80],
      [58, 75],
      [75, 39],
      [61, 44],
      [61, 76],
      [79, 80],
      [38, 71],
      [16, 85],
      [28, 82],
      [28, 85]
    ]
  ],
  [
    'file-text',
    '#ffcfb4',
    -13,
    [
      [19, 80],
      [22, 75],
      [28, 77],
      [9, 79],
      [8, 81],
      [42, 81],
      [91, 65],
      [45, 80],
      [31, 42],
      [29, 42]
    ]
  ],
  [
    'bulb',
    '#f5e29d',
    10,
    [
      [37, 80],
      [42, 76],
      [74, 76],
      [28, 77],
      [26, 80],
      [74, 39],
      [43, 37],
      [53, 18],
      [53, 27],
      [45, 18]
    ]
  ],
  [
    'calendar',
    '#dde7f2',
    19,
    [
      [76, 80],
      [71, 78],
      [88, 69],
      [41, 58],
      [41, 68],
      [80, 28],
      [85, 19],
      [81, 43],
      [63, 64],
      [44, 69]
    ]
  ]
].map(([icon, tint, tilt, positions]) => ({
  icon,
  style: {
    '--tile-tint': tint,
    '--tile-tilt': `${tilt}deg`,
    ...Object.fromEntries(positions.map(([x, y], index) => [`--point-${index}`, `${x}%, ${y}%`]))
  }
}));
</script>

<style scoped>
.guide-art {
  position: relative;
  width: min(100%, 300px);
  height: 126px;
  margin: 0 auto var(--s-3);
  pointer-events: none;
}
.guide-orbit {
  position: absolute;
  inset: 0;
  animation: guide-orbit 10.683s cubic-bezier(0.38, 0.12, 0.58, 0.95) both;
}
.guide-tile {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  transform: translate(-50%, -50%) rotate(var(--tile-tilt));
  border-radius: 11px;
  background: var(--tile-tint);
}
@keyframes guide-orbit {
  0% {
    transform: translate(var(--point-0));
  }
  12% {
    transform: translate(var(--point-1));
  }
  17.3% {
    transform: translate(var(--point-2));
  }
  21.5% {
    transform: translate(var(--point-3));
  }
  32% {
    transform: translate(var(--point-4));
  }
  45% {
    transform: translate(var(--point-5));
  }
  61% {
    transform: translate(var(--point-6));
  }
  77% {
    transform: translate(var(--point-7));
  }
  91% {
    transform: translate(var(--point-8));
  }
  100% {
    transform: translate(var(--point-9));
  }
}
@media (prefers-reduced-motion: reduce) {
  .guide-orbit {
    animation: none;
    transform: translate(var(--point-0));
  }
}
</style>
