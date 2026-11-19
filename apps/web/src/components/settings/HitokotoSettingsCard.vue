<template>
  <v-card border class="settings-card rounded-lg mb-4" elevation="2">
    <v-card-item>
      <template #prepend>
        <v-icon class="mr-2" icon="mdi-comment-quote" size="large" />
      </template>
      <v-card-title class="text-h6">一言</v-card-title>
      <v-card-subtitle>数据源、分类与违规过滤；按优先级顺序取句，全部不可用时回退内置词库（{{ builtinCount }} 条）</v-card-subtitle>
    </v-card-item>

    <v-card-text>
      <v-list>
        <v-list-item class="hk-toggle-row">
          <template #prepend>
            <v-icon class="mr-3" icon="mdi-toggle-switch-outline" />
          </template>
          <v-list-item-title>启用一言</v-list-item-title>
          <v-list-item-subtitle>在看板显示随机语句卡片</v-list-item-subtitle>
          <template #append>
            <v-switch
              :model-value="enabled"
              color="primary"
              density="comfortable"
              hide-details
              inset
              @update:model-value="(v) => emit('update', 'hitokoto.enabled', Boolean(v))"
            />
          </template>
        </v-list-item>

        <v-divider class="my-2" />

        <v-list-item class="flex-column align-start py-3">
          <div class="d-flex align-center mb-2">
            <v-icon class="mr-3" icon="mdi-source-branch" />
            <div>
              <div class="font-weight-medium">数据源</div>
              <div class="text-caption text-medium-emphasis">可多选；按勾选顺序依次尝试 —— 前面的源取不到才用后面的，今日诗词的 Token 会自动申请</div>
            </div>
          </div>
          <v-select
            :model-value="sources"
            :items="ALL_SOURCES"
            bg-color="surface"
            chips
            class="w-100"
            closable-chips
            density="comfortable"
            hide-details
            item-title="title"
            item-value="value"
            multiple
            variant="outlined"
            @update:model-value="(v) => onSourcesChange(v as HitokotoSourceId[])"
          >
            <template #chip="{ item, props }">
              <v-chip v-bind="props" size="small">
                <template #prepend><v-icon :icon="sourceIcon(item.value)" size="small" /></template>
                {{ item.title }}
              </v-chip>
            </template>
          </v-select>
          <div class="text-caption text-medium-emphasis mt-2">{{ sourceHint }}</div>
        </v-list-item>

        <v-divider class="my-2" />

        <v-list-item class="flex-column align-start py-3">
          <div class="d-flex align-center mb-2">
            <v-icon class="mr-3" icon="mdi-tag-multiple-outline" />
            <div>
              <div class="font-weight-medium">一言分类</div>
              <div class="text-caption text-medium-emphasis">仅“一言 API”生效，不选表示全部分类</div>
            </div>
          </div>
          <v-select
            :model-value="categories"
            :disabled="!sources.includes('hitokoto')"
            :items="HITOKOTO_CATEGORIES"
            bg-color="surface"
            chips
            class="w-100"
            closable-chips
            density="comfortable"
            hide-details
            item-title="title"
            item-value="value"
            multiple
            variant="outlined"
            @update:model-value="(v) => emit('update', 'hitokoto.categories', v as string[])"
          />
        </v-list-item>

        <v-divider v-if="sources.includes('jinrishici') || sources.includes('custom')" class="my-2" />

        <template v-if="sources.includes('jinrishici')">
          <v-text-field
            :model-value="jinrishiciToken"
            append-inner-icon="mdi-key-plus"
            class="mt-2"
            clearable
            density="comfortable"
            hide-details="auto"
            label="今日诗词 Token"
            :loading="tokenLoading"
            persistent-hint
            hint="选择「今日诗词」后会自动申请；留空也可用，取句时自动补发 Token"
            variant="outlined"
            @click:append-inner="requestToken"
            @update:model-value="(v) => emit('update', 'hitokoto.jinrishiciToken', String(v ?? ''))"
          />
          <v-divider class="my-2" />
        </template>

        <template v-if="sources.includes('custom')">
          <v-text-field
            :error-messages="customUrlError"
            :model-value="customUrl"
            class="mt-2"
            density="comfortable"
            hide-details="auto"
            label="自定义接口地址"
            placeholder="https://example.com/api/sentence"
            persistent-hint
            hint="支持 { content, author, origin }、一言格式 JSON 或纯文本；对方需允许跨域"
            variant="outlined"
            @update:model-value="(v) => emit('update', 'hitokoto.customUrl', String(v ?? ''))"
          />
          <v-divider class="my-2" />
        </template>

        <v-list-item class="flex-column align-start py-3">
          <div class="d-flex align-center mb-2 w-100">
            <v-icon class="mr-3" icon="mdi-shield-alert-outline" />
            <div class="flex-grow-1">
              <div class="font-weight-medium">自定义敏感词</div>
              <div class="text-caption text-medium-emphasis">逗号分隔；内置辱骂、色情、违法与广告词表，命中即换源重取</div>
            </div>
          </div>
          <v-text-field
            :model-value="sensitiveWords"
            class="w-100"
            clearable
            density="comfortable"
            hide-details
            placeholder="例如：某某、某老师名字"
            variant="outlined"
            @update:model-value="(v) => emit('update', 'hitokoto.sensitiveWords', String(v ?? ''))"
          />
        </v-list-item>

        <v-divider class="my-2" />

        <v-list-item class="flex-column align-start py-3">
          <div class="d-flex align-center mb-2 w-100">
            <v-icon class="mr-3" icon="mdi-timer-refresh-outline" />
            <div class="flex-grow-1">
              <div class="font-weight-medium">刷新间隔（秒）</div>
              <div class="text-caption text-medium-emphasis">0 表示不自动轮换，只可点击卡片换句</div>
            </div>
          </div>
          <v-text-field
            :model-value="refreshInterval"
            class="w-100"
            density="comfortable"
            hide-details
            max="3600"
            min="0"
            type="number"
            variant="outlined"
            @update:model-value="(v) => emit('update', 'hitokoto.refreshInterval', Math.min(3600, Math.max(0, Number(v) || 0)))"
          />
        </v-list-item>
      </v-list>

      <v-alert
        v-if="!hasRemoteSource"
        class="mt-4"
        density="compact"
        type="info"
        variant="tonal"
        text="当前只启用内置词库，不会请求任何外部接口。"
      />
      <v-alert
        v-else-if="customUrlInvalid"
        class="mt-4"
        density="compact"
        type="warning"
        variant="tonal"
        text="自定义接口地址必须以 http:// 或 https:// 开头，否则该源会被跳过。"
      />
    </v-card-text>

    <v-card-actions class="pa-4">
      <v-btn prepend-icon="mdi-restore" variant="text" @click="restoreDefault">恢复默认</v-btn>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-content-save" variant="elevated" @click="emit('save')">保存设置</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { BUILTIN_SENTENCES } from '@/lib/hitokotoBuiltin'
import {
  ALL_SOURCES,
  HITOKOTO_CATEGORIES,
  fetchJinrishiciToken,
  readHitokotoConfig,
  type HitokotoSourceId,
} from '@/lib/hitokotoSources'

const props = defineProps<{ model: Record<string, unknown> }>()
const emit = defineEmits<{
  update: [key: string, value: unknown]
  save: []
}>()

const config = computed(() => readHitokotoConfig(props.model))
const builtinCount = BUILTIN_SENTENCES.length
const enabled = computed(() => config.value.enabled)
const sources = computed(() => config.value.sources)
const categories = computed(() => config.value.categories)
const customUrl = computed(() => config.value.customUrl)
const jinrishiciToken = computed(() => config.value.jinrishiciToken)
const sensitiveWords = computed(() => config.value.sensitiveWords)
const refreshInterval = computed(() => config.value.refreshInterval)

const hasRemoteSource = computed(() => sources.value.some((item) => item !== 'builtin'))
const customUrlInvalid = computed(() => sources.value.includes('custom') && customUrl.value !== '' && !/^https?:\/\//i.test(customUrl.value))
const customUrlError = computed(() => (customUrlInvalid.value ? '需以 http:// 或 https:// 开头' : ''))

const sourceHint = computed(() => {
  const picked = sources.value.filter((item) => item !== 'builtin')
  if (picked.length === 0) return '未选择远程数据源，将只使用内置词库。'
  const names = picked.map((item) => ALL_SOURCES.find((entry) => entry.value === item)?.title ?? item)
  return '取句优先级：' + names.join(' → ') + '，全部不可用时回退内置词库。'
})

const tokenLoading = ref(false)

function sourceIcon(value: HitokotoSourceId): string {
  switch (value) {
    case 'builtin': return 'mdi-database'
    case 'hitokoto': return 'mdi-comment-quote-outline'
    case 'zhaoyu': return 'mdi-forum-outline'
    case 'jinrishici': return 'mdi-feather'
    default: return 'mdi-link-variant'
  }
}

function onSourcesChange(value: HitokotoSourceId[]): void {
  // 至少保留一个源，用户全取消时回退内置词库
  emit('update', 'hitokoto.sources', value.length > 0 ? value : ['builtin'])
  // 选中「今日诗词」且还没有 Token 时自动申请一个
  if (value.includes('jinrishici') && !jinrishiciToken.value) void requestToken()
}

async function requestToken(): Promise<void> {
  if (tokenLoading.value) return
  tokenLoading.value = true
  try {
    const token = await fetchJinrishiciToken()
    if (token) emit('update', 'hitokoto.jinrishiciToken', token)
  } finally {
    tokenLoading.value = false
  }
}

function restoreDefault(): void {
  emit('update', 'hitokoto.sources', ['builtin'])
  emit('update', 'hitokoto.categories', [])
  emit('update', 'hitokoto.customUrl', '')
  emit('update', 'hitokoto.sensitiveWords', '')
  emit('update', 'hitokoto.refreshInterval', 60)
}
</script>

<style scoped>
@media (max-width: 700px) {
  .hk-toggle-row {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
  }
  .hk-toggle-row > :deep(.v-list-item__prepend) {
    grid-column: 1;
    grid-row: 1 / 3;
  }
  .hk-toggle-row > :deep(.v-list-item__content) {
    grid-column: 2;
    grid-row: 1 / 3;
    min-width: 0;
  }
  .hk-toggle-row > :deep(.v-list-item__append) {
    grid-column: 3;
    grid-row: 1 / 3;
    margin-inline-start: 8px;
  }
}
</style>
