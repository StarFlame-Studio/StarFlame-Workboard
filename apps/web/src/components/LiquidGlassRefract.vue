<template>
  <!--
    边缘折射滤镜：把透镜环带背后的画面做**几何位移**，于是环带里的背景相对周围
    明显错开/折断 —— 这才是"厚玻璃边缘把画面切断"的折射感。

    原理：feDisplacementMap 按映射图的 R 通道位移 X、G 通道位移 Y，
    位移量 = scale × (通道值 − 0.5)。映射图用两张 2×2 线性渐变拼出来：
      · 横向渐变（黑→白）→ R = 归一化 x
      · 纵向渐变（黑→白）→ G = 归一化 y
    于是 dx ∝ (x − 0.5)、dy ∝ (y − 0.5)：以元素中心为原点向外位移，
    越靠边位移越大 —— 环带正好在边缘，所以位移全部集中在那一圈上。

    scale = 14 → 边缘位移 ±7px，足够看出"折断"；数值越小滤镜越省。
  -->
  <svg aria-hidden="true" class="lg-defs" focusable="false">
    <defs>
      <filter
        id="sf-lg-refract"
        color-interpolation-filters="sRGB"
        height="106%"
        width="106%"
        x="-3%"
        y="-3%"
      >
        <feImage :href="RAMP_X" preserveAspectRatio="none" result="rampX" />
        <feImage :href="RAMP_Y" preserveAspectRatio="none" result="rampY" />
        <feColorMatrix in="rampX" result="offsetX" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
        <feColorMatrix in="rampY" result="offsetY" type="matrix" values="0 0 0 0 0  1 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
        <feComposite in="offsetX" in2="offsetY" k1="0" k2="1" k3="1" k4="0" operator="arithmetic" result="map" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="14"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>
</template>

<script setup lang="ts">
/** 横向渐变：左黑右白 → R = x */
const RAMP_X =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23000000'/%3E%3Cstop offset='1' stop-color='%23ffffff'/%3E%3C/linearGradient%3E%3Crect width='2' height='2' fill='url(%23g)'/%3E%3C/svg%3E"

/** 纵向渐变：上黑下白 → G = y */
const RAMP_Y =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='2'%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23000000'/%3E%3Cstop offset='1' stop-color='%23ffffff'/%3E%3C/linearGradient%3E%3Crect width='2' height='2' fill='url(%23g)'/%3E%3C/svg%3E"
</script>

<style scoped>
/* 不能 display:none：部分引擎会跳过不可见子树里的滤镜定义 */
.lg-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
