<template>
  <LegalDocument document="privacy" :query="query" />
</template>

<script>
import LegalDocument from './legal-document.vue';

export default {
  components: { LegalDocument },
  data: () => ({ query: {} }),
  onLoad(options) {
    this.query = options || {};
  }
};
</script>
