<template>
  <v-card :border="border" class="settings-card rounded-lg" elevation="2">
    <v-card-item>
      <template #prepend>
        <v-icon :icon="icon" class="mr-2" size="large" />
      </template>
      <v-card-title class="text-h6">{{ title }}</v-card-title>
      <v-card-subtitle v-if="subtitle">{{ subtitle }}</v-card-subtitle>
    </v-card-item>

    <v-card-text>
      <v-progress-linear v-if="loading" class="mb-4" color="primary" indeterminate />
      <slot />
    </v-card-text>

    <v-card-actions v-if="$slots.actions" class="pa-4">
      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    icon: string
    subtitle?: string
    loading?: boolean
    border?: boolean
  }>(),
  { subtitle: '', loading: false, border: true },
)
</script>

<style scoped>
.settings-card {
  height: 100%;
  margin-bottom: 16px;
}
</style>
