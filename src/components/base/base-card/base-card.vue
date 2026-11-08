<template>
  <view class="base-card" :class="[paddingClass, `base-card--${surface}`, { 'is-hoverable': hoverable }]">
    <view v-if="title || $slots.header" class="base-card__header"
      ><slot name="header"
        ><text v-if="title" class="base-card__title">{{ title }}</text
        ><text v-if="subtitle" class="base-card__subtitle">{{ subtitle }}</text></slot
      ></view
    >
    <view class="base-card__body"><slot></slot></view
    ><view v-if="$slots.footer" class="base-card__footer"><slot name="footer"></slot></view>
  </view>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  padding: { type: String, default: 'medium' },
  hoverable: Boolean,
  surface: { type: String, default: 'paper', validator: (value) => ['paper', 'glass'].includes(value) }
});
const paddingClass = computed(() => `padding-${props.padding}`);
</script>
<style scoped>
.base-card {
  background: var(--paper);
  color: var(--ink);
  border-radius: var(--r-lg);
  box-shadow: var(--lift-1);
  min-width: 0;
  font-family: var(--font-ui);
}
.base-card--glass {
  background: var(--glass);
  border: var(--border-thin) solid var(--glass-line);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--lift-2);
}
.base-card__body {
  padding: var(--s-5);
}
.padding-none > .base-card__body {
  padding: 0;
}
.padding-small > .base-card__body {
  padding: var(--s-3);
}
.padding-large > .base-card__body {
  padding: var(--s-6);
}
.base-card__header {
  padding: var(--s-5) var(--s-5) 0;
}
.base-card__title {
  display: block;
  font: var(--weight-ui-emphasis) var(--size-title-3)/var(--leading-title-3) var(--font-ui);
}
.base-card__subtitle {
  display: block;
  margin-top: var(--s-2);
  color: var(--ink-3);
  font-size: var(--size-small);
}
.base-card__footer {
  padding: 0 var(--s-5) var(--s-5);
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .base-card--glass {
    background: var(--paper);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
@supports not (backdrop-filter: blur(1px)) {
  .base-card--glass {
    background: var(--paper);
  }
}
</style>

<style lang="scss" scoped>
/* #ifdef MP-WEIXIN */
.base-card--glass {
  background: var(--paper);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
/* #endif */
</style>
