<template>
  <v-card border class="settings-card rounded-lg mb-4" elevation="2">
    <v-card-item>
      <template #prepend>
        <v-icon class="mr-2" icon="mdi-account-group" size="large" />
      </template>
      <v-card-title class="text-h6">学生列表</v-card-title>
    </v-card-item>

    <v-card-text>
      <v-list-item>
        <template #prepend><v-icon class="mr-3" icon="mdi-account-multiple" /></template>
        <v-list-item-title>当前班级共 {{ count }} 名学生</v-list-item-title>
        <v-list-item-subtitle>支持多套名单（如竞赛队），在花名册页面管理</v-list-item-subtitle>
      </v-list-item>
    </v-card-text>

    <v-card-actions class="pa-4">
      <v-btn color="primary" prepend-icon="mdi-account-plus" variant="tonal" @click="$emit('manage')">管理花名册</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{ count: number }>()
defineEmits<{ manage: [] }>()
</script>
