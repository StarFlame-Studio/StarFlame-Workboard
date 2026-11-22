<!--
  胶囊版液态玻璃 —— 卡片用 <LiquidGlass> 直接塞进 v-card，胶囊不行：
  v-btn / v-chip 是 inline-flex、靠内容撑宽度的，把组件塞进默认插槽会落进
  .v-btn__content（`position: relative`）——折射层只能撑满内容盒，撑不满胶囊本体。

  所以这里反过来：外面套一层 inline-flex 的 span 当宿主，折射层铺满它，
  按钮自己压在上面（z-index: 1）。按钮的霜层/高光/厚度仍由
  styles/liquid-glass.scss 的 `$lg-pills` 负责，和卡片完全同构。

  圆角给 999：组件用它算位移贴图的 rx，SVG 会自动按短边收敛成真正的胶囊形。
-->
<template>
  <span class="lg-pill">
    <LiquidGlass :radius="999" />
    <slot />
  </span>
</template>

<script setup lang="ts">
import LiquidGlass from './LiquidGlass.vue'
</script>

<style>
.lg-pill {
  position: relative;
  display: inline-flex;
  flex: none;
}

/* 按钮/标签压在折射层之上；底色仍是 $lg-pills 给的那层皮肤，不在这里改 */
html.ct-liquid .lg-pill > .v-btn,
html.ct-liquid .lg-pill > .v-chip {
  position: relative;
  z-index: 1;
}

/* 悬停/按下的位移与缩放交给外层：各组件原本写在按钮上的
   `translateY(-2px)` / `scale(.94)` 如果只动按钮，文字会从玻璃里脱出来。 */
html.ct-liquid .lg-pill {
  transition: transform 0.18s ease;
}

html.ct-liquid .lg-pill:hover {
  transform: translateY(-2px);
}

html.ct-liquid .lg-pill:active {
  transform: scale(0.96);
}

html.ct-liquid .lg-pill > .v-btn:hover,
html.ct-liquid .lg-pill > .v-btn:active,
html.ct-liquid .lg-pill > .v-chip:hover,
html.ct-liquid .lg-pill > .v-chip:active {
  transform: none !important;
}
</style>
