<template>
  <v-snackbar :model-value="toast.show" :color="toast.color" :timeout="2600" location="bottom" @update:model-value="toast.show = $event">
    {{ toast.text }}
  </v-snackbar>
</template>

<script setup lang="ts">
import type { ToastState } from '../../composables/useToast'

defineProps<{ toast: ToastState }>()
</script>
