<template>
  <v-card border class="settings-card rounded-lg mb-4" elevation="2">
    <v-card-item>
      <template #prepend>
        <v-icon class="mr-2" icon="mdi-image" size="large" />
      </template>
      <v-card-title class="text-h6">背景设置</v-card-title>
    </v-card-item>

    <v-card-text>
      <v-list>
        <v-list-item>
          <template #prepend><v-icon class="mr-3" icon="mdi-image-outline" /></template>
          <v-list-item-title>启用自定义背景</v-list-item-title>
          <template #append>
            <v-switch :model-value="enabled" density="comfortable" hide-details @update:model-value="(v) => update('background.enabled', v)" />
          </template>
        </v-list-item>
      </v-list>

      <v-divider class="mb-4" />

      <div class="px-4 pb-4">
        <!-- 预览 -->
        <div class="preview-area mb-6" :style="previewContainerStyle">
          <div class="preview-bg" :style="previewBgStyle" />
          <div class="preview-overlay" :style="previewOverlayStyle" />
          <div class="preview-text">背景预览</div>
        </div>

        <!-- 图片来源 -->
        <div class="d-flex align-center mb-4">
          <v-icon class="mr-2" color="primary">mdi-image-search</v-icon>
          <span class="text-subtitle-1 font-weight-bold">图片来源</span>
        </div>

        <v-btn-toggle v-model="imageSource" class="mb-4" color="primary" density="comfortable" mandatory rounded="xl">
          <v-btn prepend-icon="mdi-link-variant" value="url">网络地址</v-btn>
          <v-btn prepend-icon="mdi-upload" value="upload">本地上传</v-btn>
        </v-btn-toggle>

        <div v-if="imageSource === 'url'" class="mb-4">
          <v-text-field
            :model-value="url"
            clearable
            density="compact"
            hide-details="auto"
            label="图片地址"
            placeholder="https://example.com/background.jpg"
            prepend-inner-icon="mdi-link"
            variant="outlined"
            @update:model-value="(v) => update('background.url', String(v ?? ''))"
          />
          <div class="d-flex flex-wrap mt-2" style="gap: 8px">
            <v-chip
              v-for="preset in urlPresets"
              :key="preset.label"
              class="cursor-pointer"
              color="primary"
              size="small"
              variant="tonal"
              @click="update('background.url', preset.url)"
            >
              {{ preset.label }}
            </v-chip>
          </div>
        </div>

        <div v-else class="mb-4">
          <div
            class="upload-area rounded-xl pa-6 text-center mb-3"
            :class="{ 'upload-hover': isDragging }"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop.prevent="handleDrop"
            @click="triggerFileInput"
          >
            <v-icon class="mb-2" color="primary" size="40">mdi-image-plus</v-icon>
            <div class="text-body-2">点击或拖拽图片到此处上传</div>
            <div class="text-caption text-medium-emphasis mt-1">支持 JPG、PNG、WebP、GIF（最大 5MB，建议小于 2MB）</div>
            <input ref="fileInput" accept="image/*" style="display: none" type="file" @change="handleFileChange" />
          </div>

          <v-alert v-if="uploadWarning" class="mb-2" density="compact" icon="mdi-alert" type="warning" variant="tonal">
            {{ uploadWarning }}
          </v-alert>

          <div v-if="imageData" class="d-flex align-center" style="gap: 8px">
            <v-chip color="success" prepend-icon="mdi-check-circle" size="small">已上传本地图片</v-chip>
            <v-btn color="error" prepend-icon="mdi-delete" size="small" variant="text" @click="update('background.imageData', '')">清除</v-btn>
          </div>
        </div>

        <v-divider class="my-5" />

        <!-- 毛玻璃效果 -->
        <div class="d-flex align-center mb-4">
          <v-icon class="mr-2" color="blue">mdi-blur</v-icon>
          <span class="text-subtitle-1 font-weight-bold">毛玻璃效果</span>
        </div>

        <div class="mb-4">
          <div class="d-flex justify-space-between align-center mb-1">
            <span class="text-body-2 text-medium-emphasis">模糊幅度</span>
            <span class="text-body-2 font-weight-bold">{{ blur }}px</span>
          </div>
          <v-slider
            :model-value="blur"
            color="primary"
            hide-details
            :max="50"
            :min="0"
            :step="1"
            thumb-label
            @update:model-value="(v) => update('background.blur', Number(v))"
          >
            <template #prepend><v-icon color="grey" size="small">mdi-blur-off</v-icon></template>
            <template #append><v-icon color="primary" size="small">mdi-blur</v-icon></template>
          </v-slider>
        </div>

        <div class="mb-4">
          <div class="d-flex justify-space-between align-center mb-1">
            <span class="text-body-2 text-medium-emphasis">遮罩暗色程度</span>
            <span class="text-body-2 font-weight-bold">{{ opacity }}%</span>
          </div>
          <v-slider
            :model-value="opacity"
            color="blue-grey"
            hide-details
            :max="80"
            :min="0"
            :step="1"
            thumb-label
            @update:model-value="(v) => update('background.opacity', Number(v))"
          >
            <template #prepend><v-icon color="grey" size="small">mdi-brightness-7</v-icon></template>
            <template #append><v-icon color="blue-grey" size="small">mdi-brightness-2</v-icon></template>
          </v-slider>
        </div>

        <v-divider class="my-5" />

        <div class="d-flex justify-end" style="gap: 12px">
          <v-btn prepend-icon="mdi-restore" variant="text" @click="resetAll">重置</v-btn>
          <v-btn color="primary" prepend-icon="mdi-content-save" variant="elevated" @click="$emit('save')">保存设置</v-btn>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ model: Record<string, unknown> }>()
const emit = defineEmits<{
  update: [key: string, value: unknown]
  save: []
}>()

const imageSource = ref<'url' | 'upload'>('url')
const isDragging = ref(false)
const uploadWarning = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const urlPresets = [
  { label: 'Bing 每日壁纸', url: 'https://bing.img.run/1920x1080.php' },
  { label: '随机风景', url: 'https://api.dujin.org/bing/1920.php' },
  { label: '随机二次元', url: 'https://api.dujin.org/pic/1920/1080' },
]

const enabled = computed(() => Boolean(props.model['background.enabled']))
const url = computed(() => String(props.model['background.url'] ?? ''))
const imageData = computed(() => String(props.model['background.imageData'] ?? ''))
const blur = computed(() => Number(props.model['background.blur'] ?? 10))
const opacity = computed(() => Number(props.model['background.opacity'] ?? 30))

const previewImage = computed(() => imageData.value || url.value)

const previewContainerStyle = computed(() => ({ position: 'relative' as const }))

const previewBgStyle = computed(() => ({
  position: 'absolute' as const,
  inset: '0',
  backgroundImage: previewImage.value ? 'url(' + previewImage.value + ')' : 'linear-gradient(135deg, #4b6cb7, #6a4c93)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  filter: 'blur(' + blur.value + 'px)',
  transform: 'scale(1.06)',
}))

const previewOverlayStyle = computed(() => ({
  position: 'absolute' as const,
  inset: '0',
  background: 'rgba(0,0,0,' + opacity.value / 100 + ')',
}))

function update(key: string, value: unknown): void {
  emit('update', key, value)
}

function resetAll(): void {
  update('background.enabled', false)
  update('background.url', '')
  update('background.imageData', '')
  update('background.blur', 10)
  update('background.opacity', 30)
}

function triggerFileInput(): void {
  fileInput.value?.click()
}

function readFile(file: File): void {
  // 上限 5MB：图片会转成 data URL 存进班级设置，太大既拖慢同步也拖慢大屏首屏
  if (file.size > 5 * 1024 * 1024) {
    uploadWarning.value = '图片超过 5MB，请压缩后再上传'
    return
  }
  // 2MB 以上仍然允许上传，但提前告知可能卡顿
  uploadWarning.value =
    file.size > 2 * 1024 * 1024
      ? '图片较大（超过 2MB），大屏加载时可能出现卡顿，建议压缩到 2MB 以内'
      : ''
  const reader = new FileReader()
  reader.onload = () => update('background.imageData', String(reader.result ?? ''))
  reader.readAsDataURL(file)
}

function handleFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) readFile(file)
  target.value = ''
}

function handleDrop(event: DragEvent): void {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) readFile(file)
}
</script>

<style scoped>
.preview-area {
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-text {
  position: relative;
  z-index: 1;
  color: #fff;
  font-size: 14px;
  opacity: 0.85;
}

.upload-area {
  border: 2px dashed rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-area:hover,
.upload-hover {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.05);
}

.cursor-pointer {
  cursor: pointer;
}
</style>
