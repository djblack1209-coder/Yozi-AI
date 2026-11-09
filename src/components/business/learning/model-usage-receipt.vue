<template>
  <CustomModal
    :visible="Boolean(receipt)"
    :title="t('muse.usage.receipt')"
    :is-dark="dark"
    :show-actions="false"
    initial-focus-selector=".modal-close"
    close-button
    mask-closable
    @cancel="$emit('close')"
  >
    <view v-if="receipt" :key="receipt.id" class="usage-print">
      <view class="usage-print-head">
        <image :src="BRAND.mark" mode="aspectFit" alt="" />
        <view class="usage-print-identity"
          ><text>{{ receipt.provider }}</text
          ><text>{{ receipt.model }}</text></view
        >
      </view>
      <view class="usage-print-slot">
        <view class="usage-paper">
          <text class="usage-paper-scope">{{ scope }}</text>
          <view class="usage-paper-line"
            ><text>{{ t('muse.usage.requests') }}</text
            ><text>{{ receipt.count }}</text></view
          >
          <view class="usage-paper-line"
            ><text>{{ t('muse.usage.tokens') }}</text
            ><text>{{ receipt.tokenLabel }}</text></view
          >
          <view class="usage-paper-line"
            ><text>{{ t('muse.usage.usd') }}</text
            ><text>{{ receipt.costLabel }}</text></view
          >
        </view>
      </view>
    </view>
  </CustomModal>
</template>

<script setup>
import CustomModal from '@/components/common/CustomModal.vue';
import { BRAND } from '@/config/brand.js';
import { t } from '@/i18n/index.js';

defineProps({ receipt: Object, scope: String, dark: Boolean });
defineEmits(['close']);
</script>

<style scoped>
.usage-print {
  width: min(100%, 350px);
  margin: 2px auto 12px;
}
.usage-print-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 17px 19px;
  border: 1px solid #526b82;
  border-radius: 15px;
  background: linear-gradient(155deg, #344c64, #142a41 75%);
  color: #f2f8ff;
  box-shadow: 0 6px 14px #081a3030;
}
.usage-print-head::after {
  position: absolute;
  inset: auto 9% 5px;
  height: 4px;
  border-radius: 4px;
  background: #081624;
  box-shadow: 0 1px 0 #a6c7e56b;
  content: '';
}
.usage-print-head image {
  flex: none;
  width: 32px;
  height: 32px;
}
.usage-print-identity text {
  display: block;
}
.usage-print-identity text + text {
  color: #c6d7e8;
  font-size: 12px;
}
.usage-print-slot {
  margin: -1px 7% 0;
  padding-bottom: 8px;
  overflow: hidden;
}
.usage-paper {
  padding: 16px 16px 12px;
  border: 1px solid #d8e2ee;
  border-top: 0;
  border-radius: 0 0 3px 3px;
  background: #f7faff;
  color: #1c344e;
  box-shadow: 0 4px 5px #1027442c;
}
.usage-paper-scope {
  display: block;
  padding-bottom: 9px;
  border-bottom: 1px dashed #9cafc3;
  color: #435d76;
  font-size: 12px;
}
.usage-paper-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  font-variant-numeric: tabular-nums;
}
.usage-paper-line + .usage-paper-line {
  border-top: 1px solid #dbe5ef;
}
.usage-paper-line > text:last-child {
  text-align: right;
  font-weight: 650;
}
@media (prefers-reduced-motion: no-preference) {
  .usage-paper {
    animation: usage-paper-feed 1.16s cubic-bezier(0.28, 0.64, 0.3, 1) 0.2s both;
  }
}
@keyframes usage-paper-feed {
  from {
    transform: translateY(-104%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
