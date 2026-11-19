<template>
  <v-card
    v-if="notices.length > 0"
    class="sf-board-card mb-4"
    :color="urgent ? 'error' : 'primary'"
    variant="tonal"
  >
    <v-card-text class="d-flex align-center py-3">
      <v-icon class="mr-3" :icon="urgent ? 'mdi-alert-octagon-outline' : 'mdi-bullhorn-outline'" />
      <div class="flex-grow-1">
        <span class="text-h6 font-weight-bold mr-3">{{ notices[0]?.title }}</span>
        <span class="text-body-1">{{ notices[0]?.content }}</span>
      </div>
      <v-chip v-if="notices.length > 1" size="small" variant="flat">+{{ notices.length - 1 }}</v-chip>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NoticeItem } from '@starflame/shared'

const props = defineProps<{ notices: NoticeItem[] }>()
const urgent = computed(() => props.notices.some((item) => item.level === 'urgent'))
</script>
