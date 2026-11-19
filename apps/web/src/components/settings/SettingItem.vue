<template>
  <v-list-item :class="['setting-item', { 'setting-item--stacked': stacked }]" :disabled="disabled">
    <template #prepend>
      <v-icon :icon="def?.icon || 'mdi-cog-outline'" />
    </template>

    <v-list-item-title class="text-wrap">
      <div class="font-weight-medium">{{ def?.title || settingKey }}</div>
      <div v-if="def?.desc" class="text-caption text-medium-emphasis">{{ def.desc }}</div>
    </v-list-item-title>

    <template #append>
      <div class="d-flex align-center">
        <v-switch
          v-if="def?.type === 'boolean'"
          v-model="localValue"
          :disabled="disabled"
          color="primary"
          density="comfortable"
          hide-details
          inset
          @update:model-value="commit"
        />

        <v-select
          v-else-if="def?.type === 'select'"
          v-model="localValue"
          :disabled="disabled"
          :items="def.options"
          bg-color="surface"
          density="compact"
          hide-details
          item-title="title"
          item-value="value"
          style="min-width: 130px"
          variant="outlined"
          @update:model-value="commit"
        />

        <v-text-field
          v-else-if="def?.type === 'string'"
          v-model="localValue"
          :disabled="disabled"
          bg-color="surface"
          density="compact"
          hide-details
          style="min-width: 240px"
          variant="outlined"
          @update:model-value="commit"
        />

        <div v-else-if="def?.type === 'number'" class="d-flex align-center">
          <v-btn
            :disabled="disabled || Number(localValue) <= (def.min ?? 0)"
            icon="mdi-minus"
            size="small"
            variant="text"
            @click="adjust(-(def.step ?? 1))"
          />
          <v-text-field
            v-model.number="localValue"
            :disabled="disabled"
            :max="def.max"
            :min="def.min"
            :step="def.step"
            bg-color="surface"
            class="mx-1"
            density="compact"
            hide-details
            style="width: 96px"
            type="number"
            variant="outlined"
            @update:model-value="commit"
          />
          <v-btn
            :disabled="disabled || Number(localValue) >= (def.max ?? 9999)"
            icon="mdi-plus"
            size="small"
            variant="text"
            @click="adjust(def.step ?? 1)"
          />
        </div>

        <v-menu location="bottom end">
          <template #activator="{ props }">
            <v-btn :disabled="disabled" class="ml-1" icon="mdi-dots-vertical" size="small" v-bind="props" variant="text" />
          </template>
          <v-list density="compact">
            <v-list-item @click="copyKey">
              <template #prepend><v-icon icon="mdi-key" size="small" /></template>
              <v-list-item-title>复制设置 ID</v-list-item-title>
            </v-list-item>
            <v-list-item @click="copyValue">
              <template #prepend><v-icon icon="mdi-content-copy" size="small" /></template>
              <v-list-item-title>复制设置值</v-list-item-title>
            </v-list-item>
            <v-divider />
            <v-list-item :disabled="isDefault" @click="resetDefault">
              <template #prepend><v-icon icon="mdi-restore" size="small" /></template>
              <v-list-item-title>重置为默认值</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { getDefault, getDef } from '@/lib/settingDefs'

const props = withDefaults(
  defineProps<{
    settingKey: string
    modelValue: unknown
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  'update:settingKey': [key: string, value: unknown]
}>()

const { mobile } = useDisplay()
const def = computed(() => getDef(props.settingKey))
/** 移动端：需要输入的设置项（文本 / 数字 / 下拉）改成「标题 / 说明 / 控件」三行 */
const stacked = computed(
  () => mobile.value && ['string', 'number', 'select'].includes(String(def.value?.type ?? '')),
)
const localValue = ref<unknown>(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    localValue.value = value
  },
)

const isDefault = computed(() => localValue.value === getDefault(props.settingKey))

function commit(): void {
  emit('update:modelValue', localValue.value)
  emit('update:settingKey', props.settingKey, localValue.value)
}

function adjust(delta: number): void {
  const min = def.value?.min ?? 0
  const max = def.value?.max ?? 9999
  const next = Math.min(max, Math.max(min, Number(localValue.value ?? 0) + delta))
  localValue.value = def.value?.step && def.value.step < 1 ? Number(next.toFixed(2)) : next
  commit()
}

async function copyKey(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.settingKey)
  } catch {
    // 忽略
  }
}

async function copyValue(): Promise<void> {
  try {
    await navigator.clipboard.writeText(String(localValue.value ?? ''))
  } catch {
    // 忽略
  }
}

function resetDefault(): void {
  localValue.value = getDefault(props.settingKey)
  commit()
}
</script>

<style scoped>
/* 移动端：需要输入的设置项改为三行（标题 / 说明 / 控件），控件占满整行 */
@media (max-width: 700px) {
  .setting-item--stacked {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    column-gap: 10px;
    row-gap: 8px;
    min-height: 0 !important;
    padding: 10px 12px !important;
  }

  .setting-item--stacked :deep(.v-list-item__prepend) {
    grid-area: 1 / 1;
    align-self: start;
    margin-inline-end: 0;
  }

  .setting-item--stacked :deep(.v-list-item__content) {
    grid-area: 1 / 2;
    padding: 0;
    overflow: visible;
  }

  .setting-item--stacked :deep(.v-list-item-title) {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }

  .setting-item--stacked :deep(.v-list-item__append) {
    grid-area: 2 / 1 / 3 / 3;
    width: 100%;
    margin-inline-start: 0;
    padding-inline-start: 0;
  }

  .setting-item--stacked :deep(.v-list-item__append > .d-flex) {
    width: 100%;
    gap: 6px;
    justify-content: flex-start;
  }

  .setting-item--stacked :deep(.v-list-item__append > .d-flex > *) {
    min-width: 0 !important;
  }

  .setting-item--stacked :deep(.v-list-item__append .v-select),
  .setting-item--stacked :deep(.v-list-item__append .v-text-field) {
    flex: 1 1 auto;
    width: auto !important;
  }

  /* 数字型：减号 + 输入 + 加号 占满整行 */
  .setting-item--stacked :deep(.v-list-item__append > .d-flex > .d-flex) {
    flex: 1 1 auto;
    width: 100%;
  }

  .setting-item--stacked :deep(.v-list-item__append > .d-flex > .d-flex .v-text-field) {
    flex: 1 1 auto;
    width: auto !important;
  }

  .setting-item--stacked :deep(.v-list-item__append .v-menu) {
    flex: 0 0 auto;
  }
}
</style>
