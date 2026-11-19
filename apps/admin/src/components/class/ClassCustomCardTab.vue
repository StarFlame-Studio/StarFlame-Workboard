<template>
  <div>
    <div class="d-flex align-center ga-2 mb-4">
      <div class="text-subtitle-2">共 {{ cards.length }} 张卡片</div>
      <v-spacer />
      <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load">刷新</v-btn>
      <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-plus" @click="addCard">新建卡片</v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>

    <!-- 骨架：卡片标题输入框 + 内容文本块 + 右下保存按钮 -->
    <v-row v-if="loading" dense>
      <v-col v-for="n in 4" :key="'card-skel-' + n" cols="12" md="6">
        <div class="sf-skel-surface sf-skel-tile">
          <div class="sf-skel-tile__head">
            <SfSkeleton w="100%" h="34px" radius="10px" />
            <SfSkeleton w="26px" h="26px" radius="8px" />
          </div>
          <SfSkeleton w="100%" h="104px" radius="10px" />
          <SfSkeleton w="34%" h="14px" radius="6px" style="align-self: flex-end" />
        </div>
      </v-col>
    </v-row>
    <v-card v-else-if="!cards.length" variant="outlined" class="pa-8 text-center">
      <v-icon size="40" color="medium-emphasis">mdi-card-plus-outline</v-icon>
      <div class="text-body-2 text-medium-emphasis mt-2">还没有自定义卡片，比如「通知事项」「值日表」。</div>
    </v-card>

    <v-row v-else dense>
      <v-col v-for="(card, index) in cards" :key="card.id" cols="12" md="6">
        <v-card variant="outlined" class="pa-3 h-100">
          <div class="d-flex align-center ga-2 mb-2">
            <v-text-field v-model="card.title" density="compact" variant="outlined" hide-details maxlength="32" placeholder="卡片标题" />
            <v-btn size="x-small" variant="text" icon="mdi-arrow-up" :disabled="index === 0" @click="move(index, -1)" />
            <v-btn size="x-small" variant="text" icon="mdi-arrow-down" :disabled="index === cards.length - 1" @click="move(index, 1)" />
            <v-btn size="x-small" variant="text" color="error" icon="mdi-delete-outline" @click="remove(card)" />
          </div>
          <v-textarea v-model="card.content" rows="4" auto-grow density="compact" variant="outlined" hide-details placeholder="卡片内容" />
          <div class="d-flex justify-end mt-2">
            <v-btn size="x-small" variant="text" :disabled="!isDirty(card)" :loading="savingId === card.id" @click="save(card)">保存</v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <ToastBar :toast="toast" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ApiError } from '../../lib/api'
import { createCustomCard, deleteCustomCard, getCustomCards, updateCustomCard, type CustomCard } from '../../lib/boardApi'
import { useToast } from '../../composables/useToast'
import SfSkeleton from '../skeleton/SfSkeleton.vue'
import ToastBar from './ToastBar.vue'

const props = defineProps<{ classId: string }>()

const { toast, notify } = useToast()
const cards = ref<CustomCard[]>([])
const saved = ref<Record<string, { title: string; content: string }>>({})
const loading = ref(true)
const savingId = ref('')
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const items = await getCustomCards(props.classId)
    cards.value = items
    saved.value = Object.fromEntries(items.map((c) => [c.id, { title: c.title, content: c.content }]))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载卡片失败'
  } finally {
    loading.value = false
  }
}

function isDirty(card: CustomCard): boolean {
  const base = saved.value[card.id]
  return !base || base.title !== card.title || base.content !== card.content
}

async function addCard() {
  try {
    const created = await createCustomCard(props.classId, '新卡片')
    notify('卡片已创建')
    await load()
    const found = cards.value.find((c) => c.id === created.id)
    if (found) saved.value[found.id] = { title: found.title, content: found.content }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '创建失败'
  }
}

async function save(card: CustomCard) {
  savingId.value = card.id
  try {
    await updateCustomCard(props.classId, card.id, { title: card.title.trim() || '未命名卡片', content: card.content })
    saved.value[card.id] = { title: card.title.trim() || '未命名卡片', content: card.content }
    notify('卡片已保存')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '保存失败'
  } finally {
    savingId.value = ''
  }
}

async function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= cards.value.length) return
  const next = [...cards.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  cards.value = next
  try {
    await Promise.all(next.map((card, i) => updateCustomCard(props.classId, card.id, { sortIndex: i })))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '排序保存失败'
  }
}

async function remove(card: CustomCard) {
  try {
    await deleteCustomCard(props.classId, card.id)
    notify('卡片已删除')
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '删除失败'
  }
}

onMounted(load)
</script>
