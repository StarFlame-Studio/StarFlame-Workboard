<!--
  GlassSurface —— Apple 风格液态玻璃面板（vue-bits 原版组件）

  来源：https://vue-bits.dev/r/GlassSurface.json（shadcn registry item），
  按 `npx shadcn@latest add https://vue-bits.dev/r/GlassSurface.json` 的产物原样移植，
  只改了文件位置，逻辑与样式一行未动。

  启用方式见 components/ui/LiquidGlass.vue（看板卡片 / 胶囊按钮的那层折射）。
  本项目额外做了两处改动（渲染结果与 vue-bits 原版一致）：
  · styles/tokens.css 给 :root 和 .v-theme--dark 补了 color-scheme，否则组件里的
    light-dark() 在暗色主题下永远走亮色分支；
  · 滤镜定义不再每个实例各存一份，交给 lib/glassFilter.ts 的共享池按参数复用；
    尺寸观察也交给 lib/sharedObservers.ts 的单例 ResizeObserver。
-->
<script lang="ts">
import { isRef, type CSSProperties, type Ref } from 'vue';

/**
 * 位移贴图由 lib/liquidGlassMap.ts 生成：按圆角矩形距离场只弯边缘一圈，用 canvas
 * 栅格化（长边 ≤384px）而不是拼一整张 SVG，尺寸/参数缓存也在那边。
 * 本组件只负责换算「多大、弯多宽、弯多深」这几个数。
 */

export type GlassSurfaceChannel = 'R' | 'G' | 'B';

export type GlassSurfaceRenderer = 'auto' | 'svg' | 'webgl';

export type GlassSurfaceBackdrop = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

export type GlassSurfaceBackdropSource =
  | Ref<GlassSurfaceBackdrop | null | undefined>
  | { current: GlassSurfaceBackdrop | null | undefined }
  | GlassSurfaceBackdrop
  | null;

export interface GlassSurfaceProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  backdropBlur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: GlassSurfaceChannel;
  yChannel?: GlassSurfaceChannel;
  mixBlendMode?: CSSProperties['mixBlendMode'];
  refraction?: boolean;
  renderer?: GlassSurfaceRenderer;
  backdrop?: GlassSurfaceBackdropSource;
  shape?: string;
  className?: string;
  style?: CSSProperties;
}

interface ShapeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShapeTrace {
  box: ShapeBox;
  depth: Float32Array;
  w: number;
  h: number;
  ratio: number;
  line: string;
  glow: string;
}

interface CachedTrace extends ShapeTrace {
  image: HTMLImageElement;
  width: number;
  height: number;
}

type ShapeArt =
  | { src: string; box: ShapeBox; line: string; glow: string; failed?: false }
  | { src: string; failed: true };

const FAR = 1e20;

const GLASS_VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const GLASS_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uBackdrop;
uniform sampler2D uMap;
uniform vec2 uCanvas;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform vec2 uStep;
uniform vec3 uScale;
uniform ivec2 uChannel;
uniform float uSpread;
uniform float uLod;
uniform float uSaturation;
out vec4 outColor;

vec4 bend(vec2 p) {
  vec4 map = texture(uMap, clamp(p / uSize, 0.0, 1.0));
  vec2 shift = vec2(map[uChannel.x], map[uChannel.y]) - 0.5;
  vec2 base = uOrigin + p * uStep;
  vec4 red = textureLod(uBackdrop, base + shift * uScale.r * uStep, uLod);
  vec4 green = textureLod(uBackdrop, base + shift * uScale.g * uStep, uLod);
  vec4 blue = textureLod(uBackdrop, base + shift * uScale.b * uStep, uLod);
  return vec4(red.r, green.g, blue.b, (red.a + green.a + blue.a) / 3.0);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y) / uCanvas * uSize;
  vec4 color = vec4(0.0);
  if (uSpread < 0.05) {
    color = bend(p);
  } else {
    float total = 0.0;
    for (int j = -2; j <= 2; j++) {
      for (int i = -2; i <= 2; i++) {
        vec2 offset = vec2(float(i), float(j)) * uSpread * 0.8;
        float weight = exp(-dot(offset, offset) / (2.0 * uSpread * uSpread));
        color += bend(p + offset) * weight;
        total += weight;
      }
    }
    color /= total;
  }
  vec3 rgb = color.a > 0.0 ? color.rgb / color.a : vec3(0.0);
  float s = uSaturation;
  mat3 tone = mat3(
    0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
    0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
    0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s
  );
  rgb = clamp(tone * rgb, 0.0, 1.0);
  outColor = vec4(rgb * color.a, color.a);
}`;

const CHANNELS: Record<string, number> = { R: 0, G: 1, B: 2, A: 3 };

const compileGlass = (gl: WebGL2RenderingContext) => {
  const make = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  };
  const vertex = make(gl.VERTEX_SHADER, GLASS_VERTEX);
  const fragment = make(gl.FRAGMENT_SHADER, GLASS_FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
};

const resolveBackdrop = (backdrop: GlassSurfaceBackdropSource | undefined): GlassSurfaceBackdrop | null => {
  if (typeof window === 'undefined' || !backdrop) return null;
  let node: unknown = backdrop;
  if (isRef(backdrop)) node = backdrop.value;
  else if (typeof backdrop === 'object' && 'current' in backdrop) node = backdrop.current;
  if (node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement) {
    return node;
  }
  return null;
};

const sourceSize = (node: GlassSurfaceBackdrop): [number, number] => {
  if (node instanceof HTMLImageElement) return [node.naturalWidth, node.naturalHeight];
  if (node instanceof HTMLVideoElement) return [node.videoWidth, node.videoHeight];
  return [node.width, node.height];
};

const placeAxis = (value: string | undefined, free: number) => {
  if (!value) return free / 2;
  if (value.endsWith('%')) return (parseFloat(value) / 100) * free;
  const px = parseFloat(value);
  return Number.isFinite(px) ? px : free / 2;
};

const contentBox = (node: GlassSurfaceBackdrop): ShapeBox => {
  const rect = node.getBoundingClientRect();
  const [naturalWidth, naturalHeight] = sourceSize(node);
  const style = getComputedStyle(node);
  const fit = style.objectFit || 'fill';
  if (!naturalWidth || !naturalHeight || fit === 'fill') {
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  const contain = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
  const cover = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
  const scale = fit === 'cover' ? cover : fit === 'contain' ? contain : fit === 'none' ? 1 : Math.min(1, contain);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const [px, py] = (style.objectPosition || '50% 50%').split(' ');
  return {
    x: rect.left + placeAxis(px, rect.width - width),
    y: rect.top + placeAxis(py ?? px, rect.height - height),
    width,
    height
  };
};

const distanceLine = (f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) => {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
};

const distanceGrid = (grid: Float32Array, w: number, h: number) => {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    distanceLine(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    distanceLine(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
};

const blurLine = (src: Float32Array, dst: Float32Array, offset: number, stride: number, n: number, r: number) => {
  const scale = 1 / (2 * r + 1);
  let sum = src[offset] * (r + 1);
  for (let i = 1; i <= r; i++) sum += src[offset + Math.min(i, n - 1) * stride];
  for (let i = 0; i < n; i++) {
    dst[offset + i * stride] = sum * scale;
    sum += src[offset + Math.min(i + r + 1, n - 1) * stride] - src[offset + Math.max(i - r, 0) * stride];
  }
};

const blurGrid = (grid: Float32Array, w: number, h: number, r: number) => {
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) blurLine(grid, tmp, y * w, 1, w, r);
    for (let x = 0; x < w; x++) blurLine(tmp, grid, x, w, h, r);
  }
};

const settle = (x: number) => 1 / (1 + Math.exp(-1.702 * x));

const paint = (w: number, h: number, fill: (data: Uint8ClampedArray) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(w, h);
  fill(image.data);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
};

const shade = (depth: Float32Array, w: number, h: number, falloff: (t: number) => number) =>
  paint(w, h, data => {
    data.fill(255);
    for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255 * (1 - falloff(depth[i]));
  });

const traceShape = (image: HTMLImageElement, width: number, height: number, ratio: number): ShapeTrace => {
  const naturalWidth = image.naturalWidth || width;
  const naturalHeight = image.naturalHeight || height;
  const fit = Math.min(width / naturalWidth, height / naturalHeight);
  const box = {
    x: (width - naturalWidth * fit) / 2,
    y: (height - naturalHeight * fit) / 2,
    width: naturalWidth * fit,
    height: naturalHeight * fit
  };
  const w = Math.max(2, Math.round(width * ratio));
  const h = Math.max(2, Math.round(height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, box.x * ratio, box.y * ratio, box.width * ratio, box.height * ratio);
  const pixels = context.getImageData(0, 0, w, h).data;
  const outside = new Float32Array(w * h);
  const inside = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const edge = 0.5 - pixels[i * 4 + 3] / 255;
    outside[i] = edge >= 0.5 ? FAR : Math.max(edge, 0) ** 2;
    inside[i] = edge <= -0.5 ? FAR : Math.min(edge, 0) ** 2;
  }
  distanceGrid(outside, w, h);
  distanceGrid(inside, w, h);
  const depth = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) depth[i] = (Math.sqrt(inside[i]) - Math.sqrt(outside[i])) / ratio;
  return {
    box,
    depth,
    w,
    h,
    ratio,
    line: shade(depth, w, h, t => settle(t - 1)),
    glow: shade(depth, w, h, t => settle((t - 4) / 5))
  };
};

const bendShape = (trace: ShapeTrace, edge: number, softness: number, calm: number, level: number) => {
  const { depth, w, h, ratio } = trace;
  const reach = edge + softness * 2;
  const field = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) field[i] = Math.min(Math.max(depth[i], -6), reach);
  blurGrid(field, w, h, Math.max(1, Math.round(Math.max(1.5, softness * 0.35) * ratio)));
  return paint(w, h, data => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dx = field[i + (x < w - 1 ? 1 : 0)] - field[i - (x > 0 ? 1 : 0)];
        const dy = field[i + (y < h - 1 ? w : 0)] - field[i - (y > 0 ? w : 0)];
        const still = calm * settle((depth[i] - edge) / softness);
        const bend = (1 - still) * ratio * 0.25;
        const shift = still * (level - 0.5);
        data[i * 4] = 255 * (0.5 + dx * bend + shift);
        data[i * 4 + 1] = 255 * (0.5 + dy * bend + shift);
        data[i * 4 + 2] = 255 * (0.5 + shift);
        data[i * 4 + 3] = 255;
      }
    }
  });
};
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  acquireGlassFilter,
  glassFilterSignature,
  releaseGlassFilter,
  supportsGlassSvgFilter,
  type GlassFilterSpec
} from '@/lib/glassFilter';
import { buildLiquidGlassMap } from '@/lib/liquidGlassMap';
import { observeResize, unobserveResize } from '@/lib/sharedObservers';

const props = withDefaults(defineProps<GlassSurfaceProps>(), {
  width: 200,
  height: 80,
  borderRadius: 20,
  borderWidth: 0.07,
  brightness: 50,
  opacity: 0.93,
  blur: 11,
  backdropBlur: 0,
  displace: 0,
  backgroundOpacity: 0,
  saturation: 1,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  xChannel: 'R',
  yChannel: 'G',
  mixBlendMode: 'difference',
  refraction: true,
  renderer: 'auto',
  backdrop: undefined,
  shape: undefined,
  className: '',
  style: () => ({})
});

const svgSupported = ref(false);
const checked = ref(false);
const webglFailed = ref(false);
const boxSize = ref('');
const loaded = shallowRef<{ src: string; image: HTMLImageElement | null }>({ src: '', image: null });
const art = shallowRef<ShapeArt | null>(null);

const containerRef = ref<HTMLDivElement | null>(null);
/** 共享滤镜的 id（lib/glassFilter.ts 按参数分配）；空字符串表示暂时没有滤镜 */
const sharedFilterId = ref('');
const canvasRef = ref<HTMLCanvasElement | null>(null);

let trace: CachedTrace | null = null;
let shapeMap = '';
let mapUrl = '';
let filterSignature = '';

/**
 * 位移贴图参数：把「卡片多大、边缘弯多宽、弯多深」换算成 lib/liquidGlassMap.ts 的入参。
 *
 * · 带宽随短边缩放（borderWidth 是比例，0.07 约等于短边的 3.5%），但有上下限：
 *   小卡片不至于整块都在弯，大卡片也不会弯出一条几十像素的糊边；
 * · 弯的深度取带宽的 0.95 倍左右 —— 再深就会把远处的背景整块搬过来，看着像错位而不是折射；
 * · 设置里的「折射强度」和红/绿/蓝偏移合成一个倍率，调的是深度，不改贴图结构。
 */
const generateDisplacementMap = (): { key: string; url: string } => {
  const element = containerRef.value;
  // 用 offsetWidth/offsetHeight（布局像素、整数）而不是 getBoundingClientRect()：
  // · 后者会强制同步布局，一屏十几张卡片就是十几次；
  // · 后者返回的是缩放后的小数（html 上还有 zoom:1.15），每个实例都不同，
  //   按尺寸做键的贴图缓存会一个都命中不了。
  const width = Math.max(1, Math.round(element?.offsetWidth || 400));
  const height = Math.max(1, Math.round(element?.offsetHeight || 200));
  const shortSide = Math.min(width, height);
  const scale = props.distortionScale + (props.redOffset + props.greenOffset + props.blueOffset) / 3;
  // 位移深度刻意压浅：边缘只要「轻轻把背景吸进来」就够了，弯得太深会把
  // 远处的背景整块搬过来，观感上会变成背景错位而不是折射。
  const strength = Math.min(Math.max(Math.abs(scale) / 300, 0.12), 1.8);
  const band = Math.min(Math.max(shortSide * props.borderWidth * 0.5, 2.5), 44);
  const depth = Math.min(band * 0.95 * strength, band * 1.6);
  return buildLiquidGlassMap({
    width,
    height,
    radius: props.borderRadius,
    band,
    shift: depth,
    scale,
    softness: props.blur
  });
};

/**
 * 位移贴图缓存键：shape 贴图是一整张 data URL（可能几百 KB），直接拿它当键会
 * 在每次同步滤镜时拼出巨大的字符串，所以只取长度 + FNV-1a 散列。
 * 形状路径在本项目里没有使用（没有卡片传 shape），这里只是不留下性能坑。
 */
const shapeMapKey = (url: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `shape:${url.length}:${(hash >>> 0).toString(36)}`;
};

/** 当前实例需要的位移贴图（shape 优先，否则按尺寸生成并缓存） */
const currentDisplacementMap = (): { key: string; url: string } =>
  shapeMap ? { key: shapeMapKey(shapeMap), url: shapeMap } : generateDisplacementMap();

/**
 * 同步共享滤镜。
 *
 * 原来每次参数变化都要往自己那份 <feImage>/<feDisplacementMap>/<feGaussianBlur>
 * 上 setAttribute，一屏十几张卡片就是十几次 DOM 写入。现在滤镜交给
 * lib/glassFilter.ts 的共享池：参数签名没变就什么都不用做，变了就换一个 id
 * （只改 --filter-id 一个 CSS 变量），换下来的 id 归还给池子。
 */
const updateFilter = () => {
  // Safari / Firefox 不支持 url(#…) 形式的 backdrop-filter，会退回毛玻璃质感，
  // 这时既用不上滤镜也用不上位移贴图，直接跳过（不必为每张卡片生成 SVG 贴图）；
  // 只有走 WebGL 路径（传了 backdrop）时才需要贴图地址，仍然生成。
  if (!svgSupported.value) {
    if (webgl.value) mapUrl = currentDisplacementMap().url;
    return;
  }
  const map = currentDisplacementMap();
  mapUrl = map.url;
  // 原来这里是红/绿/蓝三条位移链（各一次 feDisplacementMap + feColorMatrix 分离通道 +
  // 两次 feBlend screen 合回），能做出很细的彩色色散边，但滤镜链一共 8 个节点，
  // 一屏十几张卡片时实测把看板拖到个位数帧率。现在合并成一次位移：
  // 保留「卡片边缘把背景掰弯」这个主要观感，节点数降到 2 个；
  // 设置里的红/绿/蓝通道偏移改为取平均后叠加到位移倍率上，仍然能调节折射强弱。
  const offset = (props.redOffset + props.greenOffset + props.blueOffset) / 3;
  // 背景模糊（backdropBlur）和散景（displace）合进同一条滤镜链：CSS 侧只留
  // backdrop-filter: url(#id)，不再叠一层 blur() —— 实测那层 CSS blur 是滚动时
  // 最大的单项开销（51.8fps → 24.7fps），挪进滤镜链后整条链只光栅化一次。
  const spec: GlassFilterSpec = {
    mapKey: map.key,
    mapUrl: map.url,
    scale: props.distortionScale + offset,
    xChannel: props.xChannel,
    yChannel: props.yChannel,
    displace: Math.hypot(Math.max(0, props.displace), Math.max(0, props.backdropBlur)),
    saturate: props.saturation
  };
  const signature = glassFilterSignature(spec);
  if (signature === filterSignature && sharedFilterId.value) return;
  const nextId = acquireGlassFilter(spec);
  if (!nextId) return;
  releaseGlassFilter(sharedFilterId.value);
  sharedFilterId.value = nextId;
  filterSignature = signature;
};

const shapeImage = computed(() => (props.shape && loaded.value.src === props.shape ? loaded.value.image : null));

const updateShape = () => {
  const element = containerRef.value;
  const w = element?.offsetWidth || 0;
  const h = element?.offsetHeight || 0;
  const image = shapeImage.value;
  let map = '';
  let current: CachedTrace | null = null;
  if (image && w && h) {
    const ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(400000 / (w * h)));
    current = trace;
    try {
      if (
        !current ||
        current.image !== image ||
        current.width !== w ||
        current.height !== h ||
        current.ratio !== ratio
      ) {
        current = { image, width: w, height: h, ...traceShape(image, w, h, ratio) };
        trace = current;
      }
      map = bendShape(
        current,
        Math.min(w, h) * props.borderWidth * 0.5,
        Math.max(props.blur, 0.5),
        props.opacity,
        props.brightness / 100
      );
    } catch {
      current = null;
      trace = null;
    }
  }
  shapeMap = map;
  updateFilter();
  if (props.shape && current)
    art.value = { src: props.shape, box: current.box, line: current.line, glow: current.glow };
  else if (props.shape && loaded.value.src === props.shape) art.value = { src: props.shape, failed: true };
};



watch(
  () => [
    boxSize.value,
    props.width,
    props.height,
    props.borderRadius,
    props.borderWidth,
    props.brightness,
    props.opacity,
    props.blur,
    props.displace,
    props.distortionScale,
    props.redOffset,
    props.greenOffset,
    props.blueOffset,
    props.xChannel,
    props.yChannel,
    props.mixBlendMode
  ],
  updateFilter,
  { flush: 'post' }
);

watch(
  () => props.shape,
  (shape, _previous, onCleanup) => {
    if (!shape) return;
    let alive = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      if (alive) loaded.value = { src: shape, image };
    };
    image.onerror = () => {
      if (alive) loaded.value = { src: shape, image: null };
    };
    image.src = shape;
    onCleanup(() => {
      alive = false;
    });
  },
  { immediate: true }
);

watch(
  () => [props.shape, loaded.value, boxSize.value, props.borderWidth, props.blur, props.opacity, props.brightness],
  updateShape,
  { flush: 'post' }
);

const webgl = computed(
  () =>
    checked.value &&
    props.refraction &&
    Boolean(props.backdrop) &&
    !webglFailed.value &&
    (props.renderer === 'webgl' || (props.renderer === 'auto' && !svgSupported.value))
);
const refractive = computed(() => !webgl.value && svgSupported.value && props.refraction);
const frosted = computed(() => !webgl.value && !refractive.value);

const startWebgl = () => {
  const canvas = canvasRef.value;
  const element = containerRef.value;
  const gl = canvas?.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false
  });
  const program = gl ? compileGlass(gl) : null;
  if (!canvas || !element || !gl || !program) {
    webglFailed.value = true;
    return undefined;
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  [
    'uBackdrop',
    'uMap',
    'uCanvas',
    'uSize',
    'uOrigin',
    'uStep',
    'uScale',
    'uChannel',
    'uSpread',
    'uLod',
    'uSaturation'
  ].forEach(name => {
    uniforms[name] = gl.getUniformLocation(program, name);
  });
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  const makeTexture = () => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  };
  const backdropTexture = makeTexture();
  const mapTexture = makeTexture();
  const mapCanvas = document.createElement('canvas');
  const mapContext = mapCanvas.getContext('2d');
  const picture: {
    node: GlassSurfaceBackdrop | null;
    key: string;
    width: number;
    height: number;
    mipmapped: boolean;
    ready: boolean;
  } = { node: null, key: '', width: 0, height: 0, mipmapped: false, ready: false };
  const map = { url: '', ready: false };
  let frame = 0;
  let visible = true;
  let drawn = '';

  const loadMap = (url: string) => {
    map.url = url;
    const image = new Image();
    image.onload = () => {
      if (map.url !== url || !mapContext) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      mapCanvas.width = Math.max(1, Math.round(element.offsetWidth * ratio));
      mapCanvas.height = Math.max(1, Math.round(element.offsetHeight * ratio));
      mapContext.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
      mapContext.drawImage(image, 0, 0, mapCanvas.width, mapCanvas.height);
      gl.bindTexture(gl.TEXTURE_2D, mapTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mapCanvas);
      map.ready = true;
      drawn = '';
    };
    image.src = url;
  };

  const upload = (node: GlassSurfaceBackdrop) => {
    const still = node instanceof HTMLImageElement;
    gl.bindTexture(gl.TEXTURE_2D, backdropTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, node);
    if (still) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, still ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    [picture.width, picture.height] = sourceSize(node);
    picture.mipmapped = still;
    picture.ready = true;
  };

  const tick = () => {
    frame = 0;
    if (!visible || document.hidden) return;
    frame = requestAnimationFrame(tick);
    const s = props;
    if (mapUrl && mapUrl !== map.url) loadMap(mapUrl);
    const node = resolveBackdrop(s.backdrop);
    if (!node) return;
    let key = '';
    if (node instanceof HTMLImageElement) key = node.complete && node.naturalWidth ? node.currentSrc || node.src : '';
    else if (node instanceof HTMLVideoElement)
      key = node.readyState >= 2 ? `${node.currentSrc}|${node.currentTime}` : '';
    else key = `${node.width}x${node.height}|${performance.now()}`;
    if (key && (node !== picture.node || key !== picture.key)) {
      try {
        upload(node);
      } catch {
        webglFailed.value = true;
        return;
      }
      picture.node = node;
      picture.key = key;
      drawn = '';
    }
    if (!picture.ready || !map.ready) return;

    const layoutWidth = element.offsetWidth;
    const layoutHeight = element.offsetHeight;
    if (!layoutWidth || !layoutHeight) return;
    const box = element.getBoundingClientRect();
    const content = contentBox(node);
    if (!content.width || !content.height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(layoutWidth * ratio));
    const height = Math.max(1, Math.round(layoutHeight * ratio));
    const signature = [
      box.left,
      box.top,
      box.width,
      box.height,
      content.x,
      content.y,
      content.width,
      content.height,
      width,
      height,
      picture.key,
      map.url,
      s.displace,
      s.saturation,
      s.distortionScale,
      s.redOffset,
      s.greenOffset,
      s.blueOffset,
      s.xChannel,
      s.yChannel
    ].join('|');
    if (signature === drawn) return;
    drawn = signature;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const scaleX = box.width / layoutWidth;
    const scaleY = box.height / layoutHeight;
    const texelsPerPixel = (picture.width / content.width) * (scaleX / ratio);
    const spreadTexels = (picture.width / content.width) * scaleX * Math.max(0, s.displace);
    const lod = picture.mipmapped ? Math.max(0, Math.log2(Math.max(texelsPerPixel, spreadTexels * 0.5, 0.000001))) : 0;
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, backdropTexture);
    gl.uniform1i(uniforms.uBackdrop, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, mapTexture);
    gl.uniform1i(uniforms.uMap, 1);
    gl.uniform2f(uniforms.uCanvas, width, height);
    gl.uniform2f(uniforms.uSize, layoutWidth, layoutHeight);
    gl.uniform2f(uniforms.uOrigin, (box.left - content.x) / content.width, (box.top - content.y) / content.height);
    gl.uniform2f(uniforms.uStep, scaleX / content.width, scaleY / content.height);
    gl.uniform3f(
      uniforms.uScale,
      s.distortionScale + s.redOffset,
      s.distortionScale + s.greenOffset,
      s.distortionScale + s.blueOffset
    );
    gl.uniform2i(uniforms.uChannel, CHANNELS[s.xChannel] ?? 0, CHANNELS[s.yChannel] ?? 1);
    gl.uniform1f(uniforms.uSpread, Math.max(0, s.displace));
    gl.uniform1f(uniforms.uLod, lod);
    gl.uniform1f(uniforms.uSaturation, s.saturation);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const wake = () => {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    webglFailed.value = true;
  };
  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    wake();
  });
  intersection.observe(element);
  document.addEventListener('visibilitychange', wake);
  canvas.addEventListener('webglcontextlost', onLost);
  wake();

  return () => {
    cancelAnimationFrame(frame);
    intersection.disconnect();
    document.removeEventListener('visibilitychange', wake);
    canvas.removeEventListener('webglcontextlost', onLost);
    gl.deleteTexture(backdropTexture);
    gl.deleteTexture(mapTexture);
    gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  };
};

watch(
  webgl,
  (active, _previous, onCleanup) => {
    if (!active) return;
    const stop = startWebgl();
    if (stop) onCleanup(stop);
  },
  { flush: 'post' }
);

// 尺寸观察用 lib/sharedObservers.ts 的模块级单例 ResizeObserver：
// 原来每个实例各 new 一个，一屏十几张卡片就是十几个观察器做同一件事。
onMounted(() => {
  svgSupported.value = supportsGlassSvgFilter();
  checked.value = true;
  updateFilter();
  const element = containerRef.value;
  if (element) {
    observeResize(element, () => {
      boxSize.value = `${element.offsetWidth}x${element.offsetHeight}`;
    });
  }
  updateShape();
});

onBeforeUnmount(() => {
  const element = containerRef.value;
  if (element) unobserveResize(element);
  releaseGlassFilter(sharedFilterId.value);
  sharedFilterId.value = '';
  filterSignature = '';
});

const outline = computed(() => {
  const current = art.value;
  return props.shape && current && current.src === props.shape && !current.failed ? current : null;
});

const containerStyle = computed(() => {
  const current = outline.value;
  const maskUrl = current ? `url("${current.src.replace(/"/g, '%22').replace(/[\n\r]+/g, ' ')}")` : '';
  const maskPlace = current
    ? `${current.box.x}px ${current.box.y}px / ${current.box.width}px ${current.box.height}px no-repeat`
    : '';
  const shapeStyle: Record<string, string | number> = current
    ? { borderRadius: 0, boxShadow: 'none', WebkitMask: `${maskUrl} ${maskPlace}`, mask: `${maskUrl} ${maskPlace}` }
    : props.shape && art.value?.src !== props.shape
      ? { opacity: 0, transition: 'none' }
      : {};
  return {
    ...props.style,
    width: typeof props.width === 'number' ? `${props.width}px` : props.width,
    height: typeof props.height === 'number' ? `${props.height}px` : props.height,
    borderRadius: `${props.borderRadius}px`,
    '--glass-frost': props.backgroundOpacity,
    '--glass-saturation': props.saturation,
    // 不支持 url(#…) 形式 backdrop-filter 的浏览器（Safari / Firefox）没有共享滤镜，
    // 这里退回普通背景模糊，至少保住毛玻璃质感，而不是一层不透明色块。
    '--filter-id': sharedFilterId.value
      ? `url(#${sharedFilterId.value})`
      : `blur(${Math.max(0, props.backdropBlur)}px)`,
    ...shapeStyle
  } as CSSProperties;
});

const modeClass = computed(() =>
  webgl.value ? 'glass-surface--webgl' : refractive.value ? 'glass-surface--svg' : 'glass-surface--fallback'
);
</script>

<template>
  <div ref="containerRef" :class="`glass-surface ${modeClass} ${className}`" :style="containerStyle">

    <canvas v-if="webgl" ref="canvasRef" class="glass-surface__canvas" aria-hidden="true" />
    <span
      v-if="webgl"
      class="glass-surface__frame"
      aria-hidden="true"
      :style="outline ? { boxShadow: 'none' } : undefined"
    />
    <span v-if="frosted" class="glass-surface__sheen" aria-hidden="true" />
    <span v-if="frosted && !outline" class="glass-surface__rim" aria-hidden="true" />
    <span
      v-if="outline"
      class="glass-surface__glow"
      aria-hidden="true"
      :style="{ WebkitMaskImage: `url(${outline.glow})`, maskImage: `url(${outline.glow})` }"
    />
    <span
      v-if="outline"
      class="glass-surface__line"
      aria-hidden="true"
      :style="{ WebkitMaskImage: `url(${outline.line})`, maskImage: `url(${outline.line})` }"
    />

    <div class="glass-surface__content">
      <slot />
    </div>
  </div>
</template>

<style>
.glass-surface {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: opacity 0.26s ease-out;
}


.glass-surface__content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border-radius: inherit;
  position: relative;
  z-index: 1;
}

.glass-surface--svg {
  background: light-dark(hsl(0 0% 100% / var(--glass-frost, 0)), hsl(0 0% 0% / var(--glass-frost, 0)));
  backdrop-filter: var(--filter-id, blur(0px)) saturate(var(--glass-saturation, 1));
  box-shadow:
    0 0 2px 1px light-dark(color-mix(in oklch, black, transparent 85%), color-mix(in oklch, white, transparent 65%))
      inset,
    0 0 10px 4px light-dark(color-mix(in oklch, black, transparent 90%), color-mix(in oklch, white, transparent 85%))
      inset,
    0px 4px 16px rgba(17, 17, 26, 0.05),
    0px 8px 24px rgba(17, 17, 26, 0.05),
    0px 16px 56px rgba(17, 17, 26, 0.05),
    0px 4px 16px rgba(17, 17, 26, 0.05) inset,
    0px 8px 24px rgba(17, 17, 26, 0.05) inset,
    0px 16px 56px rgba(17, 17, 26, 0.05) inset;
}

.glass-surface--webgl {
  box-shadow:
    0px 4px 16px rgba(17, 17, 26, 0.05),
    0px 8px 24px rgba(17, 17, 26, 0.05),
    0px 16px 56px rgba(17, 17, 26, 0.05);
}

.glass-surface__canvas,
.glass-surface__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
}

.glass-surface__frame {
  background: light-dark(hsl(0 0% 100% / var(--glass-frost, 0)), hsl(0 0% 0% / var(--glass-frost, 0)));
  box-shadow:
    0 0 2px 1px light-dark(color-mix(in oklch, black, transparent 85%), color-mix(in oklch, white, transparent 65%))
      inset,
    0 0 10px 4px light-dark(color-mix(in oklch, black, transparent 90%), color-mix(in oklch, white, transparent 85%))
      inset,
    0px 4px 16px rgba(17, 17, 26, 0.05) inset,
    0px 8px 24px rgba(17, 17, 26, 0.05) inset,
    0px 16px 56px rgba(17, 17, 26, 0.05) inset;
}

.glass-surface--fallback {
  background: light-dark(
    hsl(0 0% 100% / calc(0.12 + var(--glass-frost, 0) * 0.5)),
    hsl(0 0% 100% / calc(0.04 + var(--glass-frost, 0) * 0.3))
  );
  -webkit-backdrop-filter: blur(12px) saturate(calc(var(--glass-saturation, 1) * 1.4)) brightness(1.04);
  backdrop-filter: blur(12px) saturate(calc(var(--glass-saturation, 1) * 1.4)) brightness(1.04);
  box-shadow:
    inset 0 1px 0 0 light-dark(hsl(0 0% 100% / 0.85), hsl(0 0% 100% / 0.3)),
    inset 0 -1px 0 0 light-dark(hsl(0 0% 100% / 0.35), hsl(0 0% 100% / 0.08)),
    0 0 2px 1px light-dark(color-mix(in oklch, black, transparent 88%), color-mix(in oklch, white, transparent 72%))
      inset,
    0 0 12px 3px light-dark(color-mix(in oklch, white, transparent 72%), color-mix(in oklch, white, transparent 90%))
      inset,
    0px 4px 16px rgba(17, 17, 26, 0.06),
    0px 8px 24px rgba(17, 17, 26, 0.06),
    0px 16px 56px rgba(17, 17, 26, 0.06);
}

.glass-surface__sheen,
.glass-surface__rim {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.glass-surface__sheen {
  background: linear-gradient(
    135deg,
    light-dark(hsl(0 0% 100% / 0.42), hsl(0 0% 100% / 0.14)) 0%,
    transparent 42%,
    transparent 64%,
    light-dark(hsl(0 0% 100% / 0.18), hsl(0 0% 100% / 0.05)) 100%
  );
}

.glass-surface__rim {
  padding: 3px;
  background: linear-gradient(
    150deg,
    light-dark(hsl(0 0% 100% / 0.7), hsl(0 0% 100% / 0.34)),
    light-dark(hsl(0 0% 100% / 0.1), hsl(0 0% 100% / 0.03)) 45%,
    light-dark(hsl(0 0% 100% / 0.08), hsl(0 0% 100% / 0.02)) 60%,
    light-dark(hsl(0 0% 100% / 0.42), hsl(0 0% 100% / 0.18))
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box exclude,
    linear-gradient(#000 0 0);
}

.glass-surface__line,
.glass-surface__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

.glass-surface--svg .glass-surface__line,
.glass-surface--webgl .glass-surface__line {
  background: light-dark(color-mix(in oklch, black, transparent 85%), color-mix(in oklch, white, transparent 65%));
}

.glass-surface--svg .glass-surface__glow,
.glass-surface--webgl .glass-surface__glow {
  background: light-dark(color-mix(in oklch, black, transparent 90%), color-mix(in oklch, white, transparent 85%));
}

.glass-surface--fallback .glass-surface__line {
  background: light-dark(color-mix(in oklch, black, transparent 88%), color-mix(in oklch, white, transparent 72%));
}

.glass-surface--fallback .glass-surface__glow {
  background: light-dark(color-mix(in oklch, white, transparent 72%), color-mix(in oklch, white, transparent 90%));
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-surface--fallback {
    background: light-dark(hsl(0 0% 100% / 0.72), hsl(0 0% 12% / 0.72));
  }
}

.glass-surface:focus-visible {
  outline: 2px solid light-dark(#007aff, #0a84ff);
  outline-offset: 2px;
}
</style>
