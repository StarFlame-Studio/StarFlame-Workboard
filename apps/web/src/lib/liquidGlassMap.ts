/**
 * 液态玻璃 · 位移贴图（canvas 生成）
 *
 * 贴图决定「玻璃边缘把背后的内容掰弯多少」：R 通道 = 横向位移，G 通道 = 纵向位移，
 * 128 表示不位移，越偏离 128 位移越大（feDisplacementMap 的 scale 再乘上去）。
 *
 * 这里相对 vue-bits 原版做了三件事，都是为了视觉和帧率：
 *
 * 1. **位移只发生在边缘一圈**。原版用横贯整张卡片的线性渐变，等于整块玻璃都在平移，
 *    左侧边缘把画面往右拉、右侧边缘把画面往左拉，采样点会跑出元素矩形被钳制，
 *    在卡片左右两端留下灰乎乎的拖影（真机上看着像「裁切异常」）。现在按圆角矩形的
 *    有符号距离场计算，位移在离边缘 band 像素内从峰值平滑衰减到 0，卡片中间是干净的
 *    128 中性值，只有边缘真正「弯」起来。
 * 2. **位移方向沿边缘法线**（数值梯度），圆角处自动从横向过渡到纵向，转角不会出现
 *    横竖位移互相打架的十字形脏边。
 * 3. **栅格化后按需降分辨率**。原版把一整张 SVG（宽高 = 卡片像素尺寸）编码成 data URL
 *    给 feImage，一屏十几张卡片就是十几张大图的解码与内存。这里用 canvas 直接画
 *    R/G 通道，长边最多 384px，PNG 体积小一个量级；同尺寸的卡片共用同一张图。
 *
 * 贴图内容只跟尺寸、圆角、带宽、位移量、滤镜倍率、柔化半径有关，和主题无关，
 * 所以缓存是全局的（亮色/暗色卡片共用）。
 */

export interface LiquidGlassMapOptions {
  /** 元素布局宽度（px） */
  width: number;
  /** 元素布局高度（px） */
  height: number;
  /** 圆角半径（px） */
  radius: number;
  /** 位移带宽度（px，从边缘往里算） */
  band: number;
  /** 位移带峰值处希望产生的最大位移（px，正数） */
  shift: number;
  /** feDisplacementMap 的 scale（本项目里是负数），只用来换算贴图幅度 */
  scale: number;
  /** 贴图柔化半径（px），让位移过渡更顺、避免硬边 */
  softness: number;
}

export interface LiquidGlassMap {
  /** 缓存键（喂给共享滤镜池做签名） */
  key: string;
  /** PNG data URL */
  url: string;
}

const CACHE_LIMIT = 64;
const cache = new Map<string, string>();

/** 贴图长边上限（px）：再大也只是把同样的渐变画得更细，PNG 体积却线性上涨 */
const MAX_RASTER = 384;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 圆角矩形的有符号距离场：元素内部为负，外部为正，单位是元素像素。
 * 与 CSS border-radius 的圆角几何一致（圆心在内缩 radius 的矩形角上）。
 */
const sdRoundRect = (px: number, py: number, width: number, height: number, radius: number): number => {
  const qx = Math.abs(px - width / 2) - (width / 2 - radius);
  const qy = Math.abs(py - height / 2) - (height / 2 - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - radius;
};

/** 把 RGBA 像素缓冲画成 canvas 并导出 data URL */
const toDataUrl = (width: number, height: number, data: Uint8ClampedArray): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const image = context.createImageData(width, height);
  image.data.set(data);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
};

/**
 * 生成（或命中缓存）位移贴图。
 *
 * 幅度的换算：feDisplacementMap 的位移 = scale × (通道值 / 255 - 0.5)，
 * 所以想让峰值位移正好是 shift 像素，贴图里偏离中性的幅度应该是
 * shift / (|scale| × 0.5)。这里统一按这个比例归一化，设置里的
 * 「折射强度」就变成了纯粹的位移像素数，不再依赖滤镜倍率的正负与大小。
 */
export function buildLiquidGlassMap(options: LiquidGlassMapOptions): LiquidGlassMap {
  const width = Math.max(2, Math.round(options.width));
  const height = Math.max(2, Math.round(options.height));
  const radius = clamp(options.radius, 0, Math.min(width, height) / 2);
  const band = clamp(options.band, 1.5, Math.min(width, height) / 2);
  const softness = clamp(options.softness, 0, 24);
  const scale = Math.max(1, Math.abs(options.scale));
  const shift = Math.max(0, options.shift);

  const key = [
    width,
    height,
    radius.toFixed(1),
    band.toFixed(2),
    shift.toFixed(2),
    scale.toFixed(1),
    softness.toFixed(2)
  ].join('|');

  const cached = cache.get(key);
  if (cached) {
    // LRU：命中就挪到队尾，避免长会话里把常用的尺寸挤掉
    cache.delete(key);
    cache.set(key, cached);
    return { key, url: cached };
  }

  // 分辨率：位移带至少要占到 ~8 个贴图像素，否则双线性插值会把峰值削平；
  // 长边再压到 MAX_RASTER 以内控制体积。
  const factor = Math.min(1, 8 / band, MAX_RASTER / Math.max(width, height));
  const rasterWidth = Math.max(16, Math.round(width * factor));
  const rasterHeight = Math.max(12, Math.round(height * factor));
  const stepX = width / rasterWidth;
  const stepY = height / rasterHeight;

  // 位移峰值在贴图里的幅度（0 = 完全不位移，0.96 = 贴图通道几乎打满）
  const amplitude = shift > 0 ? clamp(shift / (scale * 0.5), 0, 0.96) : 0;
  // 数值梯度求法线的步长：至少半个贴图像素，保证不会因为采样点相同而算出 0
  const gradStep = Math.max(0.4, Math.min(stepX, stepY) * 0.75);

  const data = new Uint8ClampedArray(rasterWidth * rasterHeight * 4);
  for (let y = 0; y < rasterHeight; y++) {
    const py = (y + 0.5) * stepY;
    for (let x = 0; x < rasterWidth; x++) {
      const px = (x + 0.5) * stepX;
      const index = (y * rasterWidth + x) * 4;

      const inside = -sdRoundRect(px, py, width, height, radius);
      const t = clamp(1 - inside / band, 0, 1);
      if (amplitude <= 0 || t <= 0) {
        data[index] = 128;
        data[index + 1] = 128;
        data[index + 2] = 128;
        data[index + 3] = 255;
        continue;
      }

      // 平滑过渡（smoothstep）：边缘处最强，往里逐渐归零
      const falloff = t * t * (3 - 2 * t) * amplitude;

      // 有符号距离场的梯度指向「离边缘越来越远」的方向（即元素内部），
      // 取负得到朝外法线；位移沿外法线方向为正，滤镜 scale 为负时就是「往内采样」，
      // 边缘看起来像把背景吸进来，也就是折射。
      const dx =
        sdRoundRect(px + gradStep, py, width, height, radius) -
        sdRoundRect(px - gradStep, py, width, height, radius);
      const dy =
        sdRoundRect(px, py + gradStep, width, height, radius) -
        sdRoundRect(px, py - gradStep, width, height, radius);
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dx / length;
      const ny = -dy / length;

      data[index] = clamp(Math.round(128 + 127 * nx * falloff), 0, 255);
      data[index + 1] = clamp(Math.round(128 + 127 * ny * falloff), 0, 255);
      data[index + 2] = 128;
      data[index + 3] = 255;
    }
  }

  // 柔化：贴图本身先糊一下，位移过渡不会出现一圈圈的台阶。
  // 关键点 —— 背景必须是中性灰（128），否则 blur 会把画布边缘的透明像素
  // 混进来，贴图边界处变成「往一个方向猛拉」，卡片外侧又会出脏边。
  let url = toDataUrl(rasterWidth, rasterHeight, data);
  const blurRadius = clamp(softness * factor, 0.35, 6);
  if (url && blurRadius > 0.35) {
    const raw = document.createElement('canvas');
    raw.width = rasterWidth;
    raw.height = rasterHeight;
    const rawContext = raw.getContext('2d');
    const soft = document.createElement('canvas');
    soft.width = rasterWidth;
    soft.height = rasterHeight;
    const softContext = soft.getContext('2d');
    if (rawContext && softContext) {
      const image = rawContext.createImageData(rasterWidth, rasterHeight);
      image.data.set(data);
      rawContext.putImageData(image, 0, 0);
      softContext.fillStyle = 'rgb(128, 128, 128)';
      softContext.fillRect(0, 0, rasterWidth, rasterHeight);
      softContext.filter = `blur(${blurRadius}px)`;
      softContext.drawImage(raw, 0, 0);
      softContext.filter = 'none';
      url = soft.toDataURL('image/png');
    }
  }

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, url);
  return { key, url };
}
