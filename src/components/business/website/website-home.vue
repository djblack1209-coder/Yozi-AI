<template>
  <PortalWorkspace
    v-if="!showPublicHome && (signedIn || portalOpen)"
    :signed-in="signedIn"
    @signed-out="signedOut"
    @login="open('login')"
    @home="showPublicHome = true"
  />
  <NomiLanding v-else @open="open" />
  <slot></slot>
</template>
<script setup>
import { defineAsyncComponent, onMounted, onBeforeUnmount, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import NomiLanding from '../learning/nomi-landing.vue';
const PortalWorkspace = defineAsyncComponent(() => import('./website-workspace.vue'));
import { readSessionSnapshot } from '@/services/auth-storage.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import { storageService } from '@/services/storageService.js';
const signedIn = ref(false);
const portalOpen = ref(false);
const showPublicHome = ref(false);
let unsubscribe;
function refreshIdentity() {
  const snapshot = readSessionSnapshot();
  signedIn.value = snapshot.status === 'current' && Boolean(snapshot.token) && snapshot.session?.owner !== 'guest';
}
function open(target) {
  if (target === 'progress') {
    showPublicHome.value = false;
    portalOpen.value = true;
    return;
  }
  safeNavigateTo('/pages/login/index' + (target === 'register' ? '?mode=register' : ''));
}
function signedOut() {
  portalOpen.value = false;
  refreshIdentity();
}
onMounted(() => {
  document.getElementById('website-first-paint')?.remove();
  refreshIdentity();
  unsubscribe = storageService.onIdentityChange(refreshIdentity);
});
onShow(refreshIdentity);
onBeforeUnmount(() => {
  unsubscribe?.();
});
</script>
