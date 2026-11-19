<template>
  <v-card border class="settings-card rounded-lg mb-4" elevation="2">
    <v-card-item>
      <template #prepend>
        <v-icon class="mr-2" icon="mdi-bell-ring" size="large" />
      </template>
      <v-card-title class="text-h6">通知铃声设置</v-card-title>
    </v-card-item>

    <v-card-text>
      <v-alert class="mb-4" closable density="compact" type="info" variant="tonal">
        首次使用请点击试听按钮测试音频播放是否正常（浏览器需要一次用户交互才允许播放声音）
      </v-alert>

      <v-list class="mb-4">
        <v-list-item>
          <template #prepend><v-icon class="mr-3" icon="mdi-bell-outline" /></template>
          <v-list-item-title>启用通知提示音</v-list-item-title>
          <template #append>
            <v-switch :model-value="enabled" density="comfortable" hide-details @update:model-value="(v) => update('notification.enabled', v)" />
          </template>
        </v-list-item>
        <v-divider class="my-2" />
        <v-list-item>
          <template #prepend><v-icon class="mr-3" icon="mdi-volume-high" /></template>
          <v-list-item-title>提示音音量</v-list-item-title>
          <v-list-item-subtitle>{{ volume }}%</v-list-item-subtitle>
          <template #append>
            <v-slider
              :model-value="volume"
              hide-details
              :max="100"
              :min="0"
              :step="10"
              style="max-width: 220px"
              thumb-label
              @update:model-value="(v) => update('notification.volume', Number(v))"
            />
          </template>
        </v-list-item>
      </v-list>

      <v-row dense>
        <!-- 单次通知 -->
        <v-col cols="12" md="6">
          <v-card border variant="outlined">
            <v-card-title class="d-flex align-center text-subtitle-1 py-3">
              <v-icon class="mr-2" icon="mdi-bell-ring" size="small" />
              单次通知铃声
            </v-card-title>
            <v-card-text>
              <v-list density="compact" class="mb-3">
                <v-list-item
                  v-for="preset in presets"
                  :key="'single-' + preset.id"
                  :active="singleId === preset.id"
                  :color="singleId === preset.id ? 'primary' : undefined"
                  class="rounded-lg mb-1"
                  @click="pick('single', preset.id)"
                >
                  <template #prepend>
                    <v-icon class="mr-2" :icon="singleId === preset.id ? 'mdi-check-circle' : 'mdi-music-note'" size="small" />
                  </template>
                  <v-list-item-title>{{ preset.title }}</v-list-item-title>
                  <v-list-item-subtitle class="text-caption">{{ preset.desc }}</v-list-item-subtitle>
                  <template #append>
                    <v-btn icon="mdi-play" size="small" variant="text" @click.stop="preview(preset.id, false)" />
                  </template>
                </v-list-item>
              </v-list>

              <div class="d-flex" style="gap: 8px">
                <v-btn color="primary" prepend-icon="mdi-play" variant="tonal" @click="preview(singleId, false)">试听</v-btn>
                <v-btn prepend-icon="mdi-restore" variant="text" @click="pick('single', DEFAULT_SINGLE_SOUND)">恢复默认</v-btn>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- 紧急通知 -->
        <v-col cols="12" md="6">
          <v-card border variant="outlined">
            <v-card-title class="d-flex align-center text-subtitle-1 py-3">
              <v-icon class="mr-2" color="error" icon="mdi-bell-alert" size="small" />
              紧急通知铃声
            </v-card-title>
            <v-card-text>
              <v-list density="compact" class="mb-3">
                <v-list-item
                  v-for="preset in presets"
                  :key="'urgent-' + preset.id"
                  :active="urgentId === preset.id"
                  :color="urgentId === preset.id ? 'error' : undefined"
                  class="rounded-lg mb-1"
                  @click="pick('urgent', preset.id)"
                >
                  <template #prepend>
                    <v-icon class="mr-2" :color="urgentId === preset.id ? 'error' : undefined" :icon="urgentId === preset.id ? 'mdi-check-circle' : 'mdi-music-note'" size="small" />
                  </template>
                  <v-list-item-title>{{ preset.title }}</v-list-item-title>
                  <v-list-item-subtitle class="text-caption">{{ preset.desc }}</v-list-item-subtitle>
                  <template #append>
                    <v-btn icon="mdi-play" size="small" variant="text" @click.stop="preview(preset.id, true)" />
                  </template>
                </v-list-item>
              </v-list>

              <div class="d-flex" style="gap: 8px">
                <v-btn color="error" prepend-icon="mdi-play" variant="tonal" @click="preview(urgentId, true)">试听</v-btn>
                <v-btn prepend-icon="mdi-restore" variant="text" @click="pick('urgent', DEFAULT_URGENT_SOUND)">恢复默认</v-btn>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>

    <v-card-actions class="pa-4">
      <v-btn prepend-icon="mdi-content-save" color="primary" variant="elevated" @click="$emit('save')">保存设置</v-btn>
    </v-card-actions>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="2000">{{ snack.text }}</v-snackbar>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive } from 'vue'
import { DEFAULT_SINGLE_SOUND, DEFAULT_URGENT_SOUND, playTone, stopTone, TONE_PRESETS } from '@/lib/soundPresets'

const props = defineProps<{ model: Record<string, unknown> }>()
const emit = defineEmits<{
  update: [key: string, value: unknown]
  save: []
}>()

const presets = TONE_PRESETS
const snack = reactive({ show: false, text: '', color: 'success' })

const enabled = computed(() => props.model['notification.enabled'] !== false)
const volume = computed(() => Number(props.model['notification.volume'] ?? 70))
const singleId = computed(() => String(props.model['notification.singleSound'] ?? DEFAULT_SINGLE_SOUND))
const urgentId = computed(() => String(props.model['notification.urgentSound'] ?? DEFAULT_URGENT_SOUND))

function update(key: string, value: unknown): void {
  emit('update', key, value)
}

function pick(kind: 'single' | 'urgent', id: string): void {
  const key = kind === 'single' ? 'notification.singleSound' : 'notification.urgentSound'
  update(key, id)
  const preset = presets.find((item) => item.id === id)
  snack.text = '已选择「' + (preset?.title ?? id) + '」'
  snack.color = 'success'
  snack.show = true
}

function preview(id: string, repeat: boolean): void {
  playTone(id, volume.value / 100, repeat)
}

onBeforeUnmount(stopTone)
</script>

<style scoped>
.settings-card {
  margin-bottom: 16px;
}
</style>
