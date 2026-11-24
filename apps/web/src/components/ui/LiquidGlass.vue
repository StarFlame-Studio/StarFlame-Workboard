<!--
  液态玻璃层 —— 把 vue-bits 的 GlassSurface 挂成宿主的「背景层」。

  为什么它是一层而不是宿主本身：
  · 看板卡片是 Vuetify 的 .v-card（自带 padding / 圆角 / 点击 / 网格高度测量），
    直接换成 GlassSurface 会把这些一起打乱；胶囊按钮更麻烦，它是 inline-flex
    靠内容撑宽度的，外面塞组件会改尺寸。
  · 所以这里让它 `position: absolute; inset: 0` 铺满宿主，只负责「折射」；
    霜层 / 描边 / 高光 / 投影仍由 styles/liquid-glass.scss 那层皮肤给。

  所有数值都来自设置页「主题 → 液态玻璃参数」（lib/liquidGlassSettings.ts），
  这里只是把配置翻译成组件的 props；改设置后折射层会自动重建贴图。

  两个不能动的取值：
  · `background-opacity = 0` —— 霜层不在这层做，否则和皮肤叠成两层雾。
  · `opacity`（neutralOpacity）默认 1 —— 组件默认 0.93 会让中性灰遮挡层漏 7%
    的位移渐变，实测导致背景整体恒定偏移 ≈6px。

  性能：只在「看得见」的时候挂载折射层。
  每个 GlassSurface 实例 = 一条 `backdrop-filter: url(#…) blur()`，后者会让浏览器
  为这块区域单独采样一次背景。看板一屏十几张卡片，其中一半在折叠线以下 ——
  那些层本来就没必要存在。这里用 IntersectionObserver 判断宿主是否接近视口，
  离开后直接卸载（连带释放共享滤镜引用与 backdrop-filter），滚回来时重新挂载。
  观察器走 lib/sharedObservers.ts 的模块级单例（一屏十几个实例共用一个），
  不再是每个实例各 new 一个。
-->
<template>
  <span v-if="active" ref="hostRef" class="lg-layer lg-host">
    <GlassSurface
      v-if="visible"
      class="lg-layer"
      width="100%"
      height="100%"
      :background-opacity="0"
      :border-radius="radius"
      :blur="config.refractBlur"
      :backdrop-blur="config.backdropBlur"
      :brightness="config.brightness"
      :displace="config.displace"
      :distortion-scale="config.distortionScale"
      :border-width="config.borderWidth"
      :opacity="config.neutralOpacity"
      :saturation="config.saturation"
      :red-offset="config.redOffset"
      :green-offset="config.greenOffset"
      :blue-offset="config.blueOffset"
      :style="{ position: 'absolute', inset: '0', zIndex: '0' }"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { cardThemeMode } from '@/lib/cardTheme'
import { observeVisibility, unobserveVisibility } from '@/lib/sharedObservers'
import { liquidGlassConfig } from '@/lib/liquidGlassSettings'
import GlassSurface from './GlassSurface.vue'

withDefaults(defineProps<{ radius?: number }>(), { radius: 22 })

const active = computed(() => cardThemeMode.value === 'liquid')
const config = liquidGlassConfig

/** 宿主是否在（或接近）视口内；不支持的浏览器直接当可见处理 */
const visible = ref(true)
const hostRef = ref<HTMLElement | null>(null)
/** 真正登记到共享观察器上的元素：v-if 卸载后 hostRef 会变 null，得靠它退订 */
let observedEl: HTMLElement | null = null

/** 提前一屏挂载，滚动时不会看到折射层「突然出现」 */
const ROOT_MARGIN = '320px'

function disconnect(): void {
  if (observedEl) {
    unobserveVisibility(observedEl)
    observedEl = null
  }
}

function observe(): void {
  disconnect()
  const el = hostRef.value
  if (!el || !active.value) return
  if (typeof IntersectionObserver === 'undefined') {
    visible.value = true
    return
  }
  observedEl = el
  observeVisibility(el, (isVisible) => {
    visible.value = isVisible
  }, ROOT_MARGIN)
}

// 主题切到液态玻璃时才挂载宿主，所以要在 DOM 出现后（而不是 setup 时）开始观察
watch(active, (on) => {
  visible.value = true
  if (on) void nextTick(observe)
  else disconnect()
})

onMounted(observe)
onBeforeUnmount(disconnect)
</script>

<style>
/* 这一层只是「折射背景」，霜层/描边/高光/投影由 styles/liquid-glass.scss 负责，
   所以把组件自带皮肤里的底色与投影关掉，只留 backdrop-filter。 */
html.ct-liquid .lg-layer {
  background: none !important;
  box-shadow: none !important;
  border-radius: inherit;
}

/* 宿主包裹层：绝对定位铺满卡片，不吃点击，也不参与布局 */
html.ct-liquid .lg-host {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  pointer-events: none;
}

/* 折射层的 backdrop-filter：整条滤镜链（位移 + 背景模糊 + 饱和度）都在
   lib/glassFilter.ts 生成的那个 <filter> 里，这里只引用它，不再叠 CSS 滤镜 ——
   少一遍全区域采样，滚动时明显更顺。
   兜底值必须是合法滤镜：--filter-id 还没就绪时用普通的模糊 + 饱和，
   整条声明依然生效，不会因为 none 把后面的效果一起丢掉。 */
html.ct-liquid .glass-surface--svg.lg-layer {
  backdrop-filter: var(--filter-id, blur(var(--lg-blur, 3.5px)) saturate(var(--glass-saturation, 1)));
  -webkit-backdrop-filter: var(--filter-id, blur(var(--lg-blur, 3.5px)) saturate(var(--glass-saturation, 1)));
}

/* 滚动时不再降级：折射是实时渲染的。
   早期版本会在滚动时把 backdrop-filter 整个关掉换普通模糊，看起来「玻璃突然变塑料」，
   而且滚动停下后还要 160ms 才恢复。现在整条链只有一次光栅化，滚动成本可以接受，
   液态玻璃在滚动/滑动过程中保持实时折射（毛玻璃主题的滚动降级仍在 styles/glass.scss）。 */
</style>
