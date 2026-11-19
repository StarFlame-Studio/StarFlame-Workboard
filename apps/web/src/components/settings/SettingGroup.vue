<template>
  <v-card :border="border" class="setting-group">
    <v-card-title v-if="title" class="d-flex align-center">
      <v-icon v-if="icon" :icon="icon" class="mr-2" />
      {{ title }}
    </v-card-title>

    <v-card-subtitle v-if="description">{{ description }}</v-card-subtitle>

    <v-card-text>
      <v-list>
        <slot />
      </v-list>
    </v-card-text>

    <v-card-actions v-if="$slots.actions">
      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    icon?: string
    border?: boolean
  }>(),
  { title: '', description: '', icon: '', border: true },
)
</script>

<style scoped>
.setting-group {
  margin-bottom: 16px;
  border-radius: 12px;
}
</style>
