<!--
  胶囊版液态玻璃 —— 卡片用 <LiquidGlass> 直接塞进 v-card，胶囊不行：
  v-btn / v-chip 是 inline-flex、靠内容撑宽度的，把组件塞进默认插槽会落进
  .v-btn__content（`position: relative`）——折射层只能撑满内容盒，撑不满胶囊本体。

  性能取舍（重要）：
  胶囊按钮数量多（底栏 6–8 个、空科目按钮最多 10+ 个），而它们只有 44px 高，
  SVG 位移贴图按短边收敛，折射在这么小的面积上几乎看不出来。
  早期版本给每个胶囊都挂了一份完整的 <LiquidGlass>（SVG filter + backdrop-filter
  url(#…)，三层 feDisplacementMap 两次 feBlend），实测这是液态玻璃模式下最大的
  开销来源之一，收益却接近于零。
  所以这里退回「普通毛玻璃」：一层便宜的 backdrop blur + 皮肤层（霜层/高光/厚度
  由 styles/liquid-glass.scss 的 `$lg-pills` 负责）。视觉上仍是半透明玻璃胶囊，
  但不再有逐帧的位移滤镜。

  外面套一层 inline-flex 的 span 当宿主，按钮自己压在上面（z-index: 1）。
  悬停/按下的位移与缩放也写在外层：各组件原本写在按钮上的
  `translateY(-2px)` / `scale(.94)` 如果只动按钮，文字会从玻璃里脱出来。
-->
<template>
  <span class="lg-pill">
    <slot />
  </span>
</template>

<style>
.lg-pill {
  position: relative;
  display: inline-flex;
  flex: none;
}

/* 按钮/标签压在模糊层之上；底色仍是 $lg-pills 给的那层皮肤，不在这里改 */
html.ct-liquid .lg-pill > .v-btn,
html.ct-liquid .lg-pill > .v-chip {
  position: relative;
  z-index: 1;
}

/* 胶囊的「玻璃」本体：便宜的模糊 + 提饱和，替掉原来的 SVG 折射层。
   圆角必须自己给，否则模糊背景是按矩形裁的。 */
html.ct-liquid .lg-pill {
  border-radius: 999px;
  -webkit-backdrop-filter: blur(10px) saturate(1.35);
  backdrop-filter: blur(10px) saturate(1.35);
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
