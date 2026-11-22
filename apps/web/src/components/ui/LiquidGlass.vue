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
-->
<template>
  <GlassSurface
    v-if="active"
    class="lg-layer"
    width="100%"
    height="100%"
    :background-opacity="0"
    :border-radius="radius"
    :blur="config.refractBlur"
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
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { cardThemeMode } from '@/lib/cardTheme'
import { liquidGlassConfig } from '@/lib/liquidGlassSettings'
import GlassSurface from './GlassSurface.vue'

withDefaults(defineProps<{ radius?: number }>(), { radius: 22 })

const active = computed(() => cardThemeMode.value === 'liquid')
const config = liquidGlassConfig
</script>

<style>
/* 这一层只是「折射背景」，霜层/描边/高光/投影由 styles/liquid-glass.scss 负责，
   所以把组件自带皮肤里的底色与投影关掉，只留 backdrop-filter。 */
html.ct-liquid .lg-layer {
  background: none !important;
  box-shadow: none !important;
  border-radius: inherit;
}

/* 组件在 SVG 折射模式下只做位移、不模糊；看板是密集文字，
   加一点柔化才看得清，并且把折射的彩边收细。半径由设置里的「背景模糊」控制。 */
html.ct-liquid .glass-surface--svg.lg-layer {
  backdrop-filter: var(--filter-id, none) saturate(var(--glass-saturation, 1)) blur(var(--lg-blur, 3.5px));
  -webkit-backdrop-filter: var(--filter-id, none) saturate(var(--glass-saturation, 1)) blur(var(--lg-blur, 3.5px));
}
</style>
