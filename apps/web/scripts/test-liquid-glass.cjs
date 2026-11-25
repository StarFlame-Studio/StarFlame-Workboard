/*
 * Local Electron pixel regression. From the repo root, with workspace dependencies installed:
 *   node apps/web/scripts/test-liquid-glass.cjs
 *   xvfb-run -a node apps/web/scripts/test-liquid-glass.cjs  # Linux without a display
 * Use --no-sandbox only when running as root in an isolated local test environment.
 */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { createRequire } = require('node:module')
const { setTimeout: delay } = require('node:timers/promises')
const { pathToFileURL } = require('node:url')

const loopback = [127, 0, 0, 1].join('.')
const route = '/__liquid-glass-test.html'
const entry = 'starflame-liquid-glass-test'
const toolbarRoute = '/__liquid-glass-toolbar-test.html'
const toolbarEntry = 'starflame-liquid-glass-toolbar-test'
const fixtureHtml = id => '<!doctype html><meta charset="utf-8"><div id="fixture"></div><script type="module" src="/@id/' + id + '"></script>'
// An opaque grid with irregular line spacing avoids spurious periodic matches when measuring displacement.
function paint(canvas) {
  const width = canvas.width = 1280
  const height = canvas.height = 1180
  const context = canvas.getContext('2d')
  const image = context.createImageData(width, height)
  const lines = (size, seed) => {
    const values = new Uint8Array(size)
    for (let x = 0; x < size;) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const spacing = 8 + (seed % 12)
      values.fill(40 + ((seed >>> 9) % 75), x, x + spacing)
      values.fill(195 + ((seed >>> 14) % 60), x, x + 3)
      x += spacing
    }
    return values
  }
  const columns = lines(width, 853)
  const rows = lines(height, 593)
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      image.data[i] = columns[x]
      image.data[i + 1] = rows[y]
      // Broad blue bands measure wallpaper color separately from fine texture.
      image.data[i + 2] = 120 + 80 * Math.cos(2 * Math.PI * x / 144)
      image.data[i + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
}

const source = `
import { createApp, h, nextTick } from 'vue'
import LiquidGlass from '/src/components/ui/LiquidGlass.vue'
import LiquidGlassPill from '/src/components/ui/LiquidGlassPill.vue'
import { applyCardTheme } from '/src/lib/cardTheme.ts'
import { applyLiquidGlassConfig, LIQUID_GLASS_DEFAULTS, liquidGlassConfig, readLiquidGlassConfig } from '/src/lib/liquidGlassSettings.ts'
import '/src/styles/liquid-glass.scss'

const style = document.createElement('style')
style.textContent = \`
  html, body { margin: 0; overflow: hidden; background: #36404c; }
  #scroller { position: relative; width: 100vw; height: 100vh; overflow: scroll; scrollbar-width: none; }
  #stage { position: relative; width: 1280px; height: 1180px; }
  canvas { position: absolute; top: 0; left: 0; }
  .fixed-backdrop canvas { position: fixed; }
  #nested { position: absolute; left: 242px; top: 186px; transform-origin: top left; }
  #lens {
    position: relative; width: 430px; height: 216px;
    border-radius: 36px 15% 44px 22% / 36px 24% 44px 31%;
    overflow: visible;
    --lg-frost: transparent; --lg-rim: transparent; --lg-sheen: none; --lg-shadow: none;
  }
  .lens-off .lg-layer { visibility: hidden !important; }
  #capsule { display: none; position: absolute; left: 270px; top: 440px; }
  #capsule .act { appearance: none; width: 270px; height: 44px; border: 0; border-radius: 999px; }
  .material-test #capsule { display: block; }
  .material-test #lens { --lg-frost: inherit; --lg-rim: inherit; --lg-sheen: inherit; --lg-shadow: inherit; }
  .dark-old-tint {
    --lg-frost: rgba(20, 17, 14, var(--test-card-alpha));
    --lg-pill-frost: rgba(34, 28, 23, var(--test-pill-alpha));
  }
  .dark-before-button-tint { --lg-pill-frost: rgba(91, 86, 82, var(--test-pill-alpha)); }
  .bare-backdrop :is(#lens, #capsule) { visibility: hidden; }
  #paint-marker { position: fixed; z-index: 10; inset: 0 auto auto 0; width: 8px; height: 8px; }
\`

${paint}
document.head.append(style)
applyCardTheme('liquid')
const sharpLens = {
  ...LIQUID_GLASS_DEFAULTS,
  backdropBlur: 0, displace: 0, saturation: 1,
  distortionScale: -360, borderWidth: 0.25, refractBlur: 2,
}
liquidGlassConfig.value = { ...sharpLens }
createApp({ render: () => h('div', { id: 'scroller' }, [
  h('div', { id: 'stage' }, [
    h('canvas', { ref: element => { if (element) paint(element) } }),
    h('div', { id: 'nested' }, [h('div', { id: 'lens', class: 'wall-card' }, [h(LiquidGlass)])]),
    h('div', { id: 'capsule', class: 'home-actions' }, [h(LiquidGlassPill, null, { default: () => h('button', { class: 'act v-btn' }) })]),
  ]),
  h('div', { id: 'paint-marker' }),
]) }).mount('#fixture')

const lens = document.querySelector('#lens')
const scroller = document.querySelector('#scroller')
const nested = document.querySelector('#nested')
const paintFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
window.glassTest = {
  async material(theme, preset) {
    document.documentElement.classList.toggle('v-theme--dark', theme === 'dark')
    document.body.classList.add('material-test')
    document.body.classList.toggle('bare-backdrop', preset === 'bare')
    scroller.classList.toggle('dark-old-tint', theme === 'dark' && preset === 'before-tint')
    scroller.classList.toggle('dark-before-button-tint', theme === 'dark' && preset === 'before-button-tint')
    const paintMarker = ({ bare: 50, previous: 100, custom: 80, default: 150, 'before-tint': 200, 'before-button-tint': 210 })[preset] + (theme === 'dark' ? 25 : 0)
    document.querySelector('#paint-marker').style.backgroundColor = 'rgb(' + paintMarker + ',0,0)'
    const previousSettings = {
      'liquid.backdropBlur': 2, 'liquid.pillBlur': 2,
      'liquid.distortionScale': -210, 'liquid.borderWidth': 0.09,
      'liquid.frostLight': 0.10, 'liquid.sheenLight': 0.5, 'liquid.pillFrostLight': 0.16,
    }
    const config = readLiquidGlassConfig(preset === 'previous' ? previousSettings :
      preset === 'custom' ? { 'liquid.backdropBlur': 1.5, 'liquid.pillBlur': 4 } : {})
    scroller.style.setProperty('--test-card-alpha', config.frostDark)
    scroller.style.setProperty('--test-pill-alpha', config.pillFrostDark)
    applyLiquidGlassConfig(config)
    lens.classList.remove('lens-off')
    await nextTick()
    await paintFrames()
    const capsule = document.querySelector('#capsule > .lg-pill')
    const layer = lens.querySelector('.lg-layer')
    const lensFilter = getComputedStyle(layer).backdropFilter
    const rim = getComputedStyle(layer, '::after')
    const filterId = /#([^"')]+)/.exec(lensFilter)?.[1]
    const lensBlur = document.getElementById(filterId || '')?.querySelector('feGaussianBlur')?.getAttribute('stdDeviation')
    return {
      dpr: devicePixelRatio, layout: [lens.offsetWidth, lens.offsetHeight],
      rect: lens.getBoundingClientRect().toJSON(), capsule: capsule.getBoundingClientRect().toJSON(),
      lensFilter, lensBlur, rimShadow: rim.boxShadow,
      rimRadius: rim.borderTopLeftRadius, lensRadius: getComputedStyle(layer).borderTopLeftRadius,
      pillFilter: getComputedStyle(capsule).backdropFilter, paintMarker,
    }
  },
  async setup({ x = 0, y = 0, cssZoom = 1, transform = 'none', wide = false, fixedBackdrop = false, bordered = false, defaults = false }) {
    scroller.classList.toggle('fixed-backdrop', fixedBackdrop)
    nested.style.zoom = cssZoom
    nested.style.transform = transform
    lens.style.width = wide ? '520px' : ''
    lens.style.height = wide ? '160px' : ''
    lens.style.border = bordered ? '1px solid transparent' : ''
    liquidGlassConfig.value = defaults ? { ...LIQUID_GLASS_DEFAULTS } : { ...sharpLens }
    scroller.scrollTo(x, y)
    await nextTick()
    await paintFrames()
    return { x: scroller.scrollLeft, y: scroller.scrollTop }
  },
  async capture(enabled) {
    lens.classList.toggle('lens-off', !enabled)
    await paintFrames()
    const layers = [...lens.querySelectorAll('.lg-layer')]
    const filtered = layers.map(layer => getComputedStyle(layer).backdropFilter).filter(filter => filter !== 'none')
    return { rect: lens.getBoundingClientRect().toJSON(), layout: [lens.offsetWidth, lens.offsetHeight],
      dpr: devicePixelRatio, filtered }
  },
}
`

// Use a separate document so Vuetify and the app-wide styles cannot affect the pixel baselines above.
const toolbarSource = `
import { createApp, h, nextTick } from 'vue'
import { VApp } from 'vuetify/components/VApp'
import vuetify from '/src/plugins/vuetify.ts'
import FloatingToolbar from '/src/components/FloatingToolbar.vue'
import HomeActions from '/src/components/home/HomeActions.vue'
import { applyCardTheme } from '/src/lib/cardTheme.ts'
import { applyLiquidGlassConfig, LIQUID_GLASS_DEFAULTS } from '/src/lib/liquidGlassSettings.ts'
import '/src/styles/main.scss'

${paint}
const style = document.createElement('style')
style.textContent = \`
  #toolbar-scroll { height: 100vh; overflow: scroll; scrollbar-width: none; }
  #toolbar-paint-marker { position: fixed; z-index: 200; inset: 0 auto auto 0; width: 8px; height: 8px; }
  html.toolbar-lens-off .floating-toolbar > .lg-layer { visibility: hidden !important; }
\`
document.head.append(style)

const activations = []
applyCardTheme('liquid')
applyLiquidGlassConfig(LIQUID_GLASS_DEFAULTS)
createApp({ render: () => h(VApp, null, { default: () => [
  h('div', { id: 'toolbar-scroll' }, [h('canvas', { ref: el => { if (el) paint(el) } }), h(HomeActions)]),
  h(FloatingToolbar, {
    selectedDate: new Date(2026, 0, 15), isToday: false,
    onPrevDay: () => activations.push('prev-day'),
    onCopyToToday: () => activations.push('copy-to-today'),
  }),
  h('div', { id: 'toolbar-paint-marker' }),
] }) }).use(vuetify).mount('#fixture')

const host = document.querySelector('.floating-toolbar')
const buttons = host.querySelector('.toolbar-buttons')
const side = document.querySelector('.side-action-btn')
const scroller = document.querySelector('#toolbar-scroll')
const marker = document.querySelector('#toolbar-paint-marker')
const afterPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
const activationPoint = (button) => {
  const { x, y, width, height } = button.getBoundingClientRect()
  const point = { x: Math.round(x + width / 2), y: Math.round(y + height / 2) }
  return { point, hit: document.elementFromPoint(point.x, point.y)?.closest('button') === button, width, height }
}
let paintMarker = 0
window.toolbarTest = {
  async setup({ theme = 'light', material = 'liquid', scroll = 0 }) {
    vuetify.theme.change(theme)
    applyCardTheme(material)
    document.documentElement.classList.remove('toolbar-lens-off')
    await nextTick()
    scroller.scrollTo(0, scroll)
    await afterPaint()
    // Wait out the real toolbar's theme/position transitions before taking style or pixel readings.
    await Promise.all(host.getAnimations().map(animation => animation.finished.catch(() => {})))
  },
  inspect() {
    const lens = host.querySelector(':scope > .lg-layer')
    const hostStyle = getComputedStyle(host)
    const lensStyle = lens && getComputedStyle(lens)
    const buttonStyle = getComputedStyle(buttons)
    const filter = lens?.style.getPropertyValue('--lg-filter')
    const id = filter?.startsWith('url(#') && filter.slice(5, -1)
    // Let Chromium normalize token colors and gradients just like the toolbar's computed values.
    const reference = document.createElement('span')
    reference.style.backgroundColor = 'var(--lg-pill-frost)'
    reference.style.backgroundImage = 'var(--lg-pill-sheen)'
    host.append(reference)
    const pillFrost = getComputedStyle(reference).backgroundColor
    const pillSheen = getComputedStyle(reference).backgroundImage
    reference.remove()
    return {
      container: getComputedStyle(host.parentElement).position,
      hostPosition: hostStyle.position,
      hostFilter: hostStyle.backdropFilter,
      rect: host.getBoundingClientRect().toJSON(), shadow: hostStyle.boxShadow,
      viewport: [innerWidth, innerHeight], scroll: scroller.scrollTop,
      tint: hostStyle.backgroundColor, sheen: hostStyle.backgroundImage, pillFrost, pillSheen,
      lensCount: host.querySelectorAll(':scope > .lg-layer').length,
      lensFilter: lensStyle?.backdropFilter, lensStack: lensStyle?.zIndex, lensPointer: lensStyle?.pointerEvents,
      hasDisplacement: !!(id && document.getElementById(id)?.querySelector('feDisplacementMap')),
      lensBlur: id && document.getElementById(id)?.querySelector('feGaussianBlur')?.getAttribute('stdDeviation'),
      buttonsPosition: buttonStyle.position, buttonsStack: buttonStyle.zIndex,
      previous: activationPoint(buttons.querySelector('button')),
      date: activationPoint(buttons.querySelector('[aria-haspopup="menu"]')),
      side: { ...activationPoint(side), filter: getComputedStyle(side).backdropFilter, lens: !!side.querySelector('.lg-layer') },
    }
  },
  async capture(enabled) {
    document.documentElement.classList.toggle('toolbar-lens-off', !enabled)
    paintMarker = (paintMarker + 50) % 255
    marker.style.backgroundColor = 'rgb(' + paintMarker + ', 0, 0)'
    await afterPaint()
    return { paintMarker, dpr: devicePixelRatio, rect: host.getBoundingClientRect().toJSON() }
  },
  buttonSkin(fallback = false) {
    const runtime = document.getElementById('sf-liquid-glass-vars').sheet
    runtime.disabled = fallback
    try {
      const fullscreen = document.querySelector('.act-full')
      const sync = document.querySelector('.act-sync')
      const style = getComputedStyle(fullscreen)
      return { border: style.borderTopColor, width: style.borderTopWidth, shadow: getComputedStyle(sync).boxShadow }
    } finally {
      runtime.disabled = false
    }
  },
  activations,
  dateMenu() {
    const card = document.querySelector('.v-overlay--active .date-picker-card')
    return card && { filter: getComputedStyle(card).backdropFilter, lens: !!card.querySelector('.lg-layer') }
  },
}
`

async function launch() {
  const web = resolve(__dirname, '..')
  const webRequire = createRequire(join(web, 'package.json'))
  const desktopRequire = createRequire(resolve(web, '../desktop/package.json'))
  const electron = desktopRequire('electron')
  const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
  const { default: vue } = await import(pathToFileURL(webRequire.resolve('@vitejs/plugin-vue')).href)
  const vuetify = webRequire('vite-plugin-vuetify').default
  const runtime = await mkdtemp(join(process.env.LG_TMP_ROOT || tmpdir(), 'starflame-glass-'))
  const fixture = {
    name: entry,
    resolveId(id) { return [entry, toolbarEntry].includes(id) ? '\0' + id : null },
    load(id) {
      if (id === '\0' + entry) return source
      if (id === '\0' + toolbarEntry) return toolbarSource
      return null
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (![route, toolbarRoute].includes(req.url)) return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(fixtureHtml(req.url === route ? entry : toolbarEntry))
      })
    },
  }
  let vite
  try {
    vite = await createServer({
      root: web, configFile: false, envFile: false, publicDir: false,
      cacheDir: join(runtime, 'vite'),
      resolve: { alias: { '@': join(web, 'src') } },
      plugins: [fixture, vue(), vuetify({ autoImport: true })],
      optimizeDeps: {
        entries: ['src/components/ui/LiquidGlass.vue', 'src/components/FloatingToolbar.vue', 'src/components/home/HomeActions.vue', 'src/plugins/vuetify.ts', 'src/lib/cardTheme.ts'],
        // The SFC auto-import plugin generates these after Vite scans the entry files.
        // Pre-optimize them to avoid a dependency reload during the toolbar test.
        include: ['vue', 'vuetify', 'vuetify/directives', 'vuetify/components/transitions',
          ...['VApp', 'VBtn', 'VBtnGroup', 'VCard', 'VDatePicker', 'VMenu'].map(name => 'vuetify/components/' + name)],
      },
      server: { host: loopback, watch: null },
    })
    await vite.listen()
    const origin = vite.resolvedUrls.local[0]
    const env = { ...process.env, STARFLAME_GLASS_URL: new URL(route, origin).href, STARFLAME_GLASS_PROFILE: join(runtime, 'electron') }
    delete env.ELECTRON_RUN_AS_NODE
    const status = await new Promise((resolveChild, reject) => {
      const flags = process.argv.includes('--no-sandbox') ? ['--no-sandbox'] : []
      const child = spawn(electron, [...flags, __filename], { stdio: 'inherit', env })
      const deadline = setTimeout(() => child.kill('SIGKILL'), 60000)
      child.once('error', error => { clearTimeout(deadline); reject(error) })
      child.once('exit', (code, signal) => {
        clearTimeout(deadline)
        if (signal) reject(new Error('Electron exited with ' + signal))
        else resolveChild(code)
      })
    })
    process.exitCode = status
  } finally {
    // Chromium helpers can still finish flushing the temporary profile after the browser exits.
    try { await vite?.close() } finally { await rm(runtime, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }) }
  }
}

function raster(image, geometry) {
  const { width, height } = image.getSize()
  const pixels = image.toBitmap()
  assert.equal(pixels.length, width * height * 4, 'Expected a BGRA Electron capture')
  const { dpr, rect } = geometry
  return {
    width, height, pixels,
    card: { x: rect.x * dpr, y: rect.y * dpr, w: rect.width * dpr, h: rect.height * dpr },
    layout: geometry.layout,
  }
}

function averageDifference(before, after, samples) {
  let total = 0
  let changed = 0
  for (const [x, y] of samples) {
    const index = (y * before.width + x) * 4
    let difference = 0
    for (let channel = 0; channel < 3; channel++) {
      difference += Math.abs(before.pixels[index + channel] - after.pixels[index + channel])
    }
    total += difference / 3
    if (difference > 18) changed++
  }
  return { mean: total / samples.length, percent: 100 * changed / samples.length }
}

// Contrast between nearby samples measures fine texture, while samples farther
// apart in the blue channel measure the larger color bands.
function backdropContrast(image, samples, channel, dx, dy) {
  let total = 0
  for (const [x, y] of samples) {
    const index = (y * image.width + x) * 4 + channel
    const next = index + (dx + dy * image.width) * 4
    total += Math.abs(image.pixels[index] - image.pixels[next])
  }
  return total / samples.length
}

// Average difference in sRGB luma on the same background pixels.
function brightnessGain(before, after, samples) {
  let total = 0
  for (const [x, y] of samples) {
    const index = (y * before.width + x) * 4
    total += 0.0722 * (after.pixels[index] - before.pixels[index])
      + 0.7152 * (after.pixels[index + 1] - before.pixels[index + 1])
      + 0.2126 * (after.pixels[index + 2] - before.pixels[index + 2])
  }
  return total / samples.length
}

function region(card, x0, y0, x1, y1) {
  const points = []
  for (let y = Math.ceil(card.y + y0 * card.h); y < card.y + y1 * card.h; y++) {
    for (let x = Math.ceil(card.x + x0 * card.w); x < card.x + x1 * card.w; x++) points.push([x, y])
  }
  assert.ok(points.length, 'sampling region must contain pixels')
  return points
}

// The red channel records x; the green channel records y. Compare each edge-normal trace
// to nearby shifted samples from the unfiltered grid. This checks spatial displacement.
function edgeShifts(before, after) {
  const { x, y, w, h } = before.card
  const minimumSize = Math.min(w, h)
  return ['top', 'bottom', 'left', 'right'].map(side => {
    const vertical = side === 'top' || side === 'bottom'
    const invert = side === 'bottom' || side === 'right'
    const normal = vertical ? y : x
    const length = vertical ? h : w
    const across = Math.round((vertical ? x : y) + (vertical ? w : h) / 2)
    const channel = vertical ? 1 : 2 // NativeImage bitmaps are BGRA on Electron.
    const value = (image, position) => {
      const px = vertical ? across : position
      const py = vertical ? position : across
      return image.pixels[(py * image.width + px) * 4 + channel]
    }
    const radius = Math.round(minimumSize * 0.15)
    let best = { shift: 0, gain: 0 }
    for (let depth = 4; depth <= minimumSize * 0.24; depth += 2) {
      const position = Math.round(invert ? normal + length - depth : normal + depth)
      function error(shift) {
        let sum = 0
        for (let n = -2; n <= 2; n++) {
          sum += Math.abs(value(after, position + n) - value(before, position + n + shift))
        }
        return sum / 5
      }
      const baseline = error(0)
      let fit = { shift: 0, error: baseline }
      for (let shift = -radius; shift <= radius; shift++) {
        const shifted = error(shift)
        if (shifted + Math.abs(shift) * 0.8 < fit.error + Math.abs(fit.shift) * 0.8) fit = { shift, error: shifted }
      }
      const gain = baseline - fit.error
      if (Math.abs(fit.shift) >= 2 && fit.error < 22 && gain > best.gain) best = { shift: fit.shift, gain }
    }
    return { side, ...best }
  })
}

function compare(before, after) {
  assert.equal(after.width, before.width)
  assert.equal(after.height, before.height)
  assert.deepEqual(after.card, before.card, 'Toggling refraction moved the host')
  const card = before.card
  const { x, y, w, h } = card
  assert.ok(x >= 40 && y >= 40 && x + w + 40 < before.width && y + h + 40 < before.height,
    'Lens and control regions must fit in the viewport: ' + JSON.stringify(card))
  const center = averageDifference(before, after, region(card, 0.3, 0.36, 0.7, 0.64))
  // Check the CSS shape from the fixture independently of the rendered filter. Sample
  // pixels inside the bounding box and beyond each ellipse, away from its antialiased arc.
  const [layoutWidth, layoutHeight] = before.layout
  const radii = [
    [36 / layoutWidth, 36 / layoutHeight], [0.15, 0.24],
    [44 / layoutWidth, 44 / layoutHeight], [0.22, 0.31],
  ]
  const corners = radii.map(([rx, ry], corner) => {
    const right = corner === 1 || corner === 2
    const bottom = corner === 2 || corner === 3
    const points = region(card, right ? 1 - rx : 0, bottom ? 1 - ry : 0,
      right ? 1 : rx, bottom ? 1 : ry).filter(([px, py]) => {
      const dx = (px + 0.5 - card.x) / w
      const dy = (py + 0.5 - card.y) / h
      return (1 - (right ? 1 - dx : dx) / rx) ** 2 + (1 - (bottom ? 1 - dy : dy) / ry) ** 2 > 1.2
    })
    assert.ok(points.length, 'Expected pixels outside each rounded corner')
    return averageDifference(before, after, points)
  })
  const outside = averageDifference(before, after, [
    ...region(card, 0.15, -0.13, 0.85, -0.025),
    ...region(card, -0.06, 0.15, -0.012, 0.85),
    ...region(card, 1.012, 0.15, 1.06, 0.85),
    ...region(card, 0.15, 1.025, 0.85, 1.13),
  ])
  return { center, outside, corners, edges: edgeShifts(before, after) }
}

async function testToolbar(window, url) {
  const contents = window.webContents
  await window.loadURL(new URL(toolbarRoute, url).href)
  const evaluate = code => contents.executeJavaScript(code)
  assert.ok(await evaluate('Boolean(window.toolbarTest)'), 'Vite toolbar fixture failed to load')

  async function state(options = {}) {
    await evaluate('toolbarTest.setup(' + JSON.stringify(options) + ')')
    const liquid = !options.material || options.material === 'liquid'
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await evaluate('toolbarTest.inspect()')
      if (!liquid || result.hasDisplacement) return result
      await delay(30)
    }
    assert.fail('Toolbar never acquired a Chromium displacement filter: ' + JSON.stringify(options))
  }

  function assertToolbar(result, liquid = true) {
    assert.equal(result.container, 'fixed', 'Toolbar container should stay fixed')
    assert.equal(result.hostPosition, 'absolute', 'Toolbar host should stay absolute')
    assert.equal(result.hostFilter, liquid ? 'none' : 'blur(22px) saturate(1.5)')
    assert.equal(result.lensCount, liquid ? 1 : 0, 'Only liquid mode should render a direct lens child')
    assert.ok(result.previous.hit, 'Previous-day button should remain hittable')
    assert.deepEqual({ filter: result.side.filter, lens: result.side.lens }, { filter: 'blur(20px) saturate(1.5)', lens: false })
    if (!liquid) return
    assert.match(result.lensFilter, /url[(]/, 'The child lens should use an SVG backdrop filter')
    assert.ok(result.hasDisplacement, 'The filter URL should point to an SVG displacement map')
    assert.equal(result.lensBlur, '10', 'The dock should share the capsule blur, not the card blur')
    assert.equal(result.lensPointer, 'none', 'Lens should not intercept click events')
    assert.equal(result.buttonsPosition, 'relative')
    assert.ok(Number(result.buttonsStack) > Number(result.lensStack), 'Buttons should paint over the lens')
    assert.equal(result.tint, result.pillFrost, 'Toolbar should use --lg-pill-frost')
    assert.match(result.sheen, /linear-gradient[(]/, 'Toolbar should retain the sheen')
    assert.equal(result.sheen, result.pillSheen, 'Toolbar should use --lg-pill-sheen')
    assert.match(result.shadow, /inset/, 'Toolbar should retain the inset pill shadow')
  }

  async function capture(enabled) {
    const geometry = await evaluate('toolbarTest.capture(' + enabled + ')')
    for (let attempt = 0; attempt < 20; attempt++) {
      const image = raster(await contents.capturePage(), geometry)
      if (image.pixels[2] === geometry.paintMarker) return image
      await delay(25)
    }
    assert.fail('Toolbar capture did not show the current lens state')
  }

  async function assertPaint(label) {
    const off = await capture(false)
    const on = await capture(true)
    assert.deepEqual(on.card, off.card, 'Toggling only the lens should not move the toolbar')
    const diff = averageDifference(off, on, region(on.card, 0.17, 0.16, 0.83, 0.84))
    console.log(label + ' toolbar lens on/off: RGB difference ' + diff.mean.toFixed(2) + ', ' + diff.percent.toFixed(1) + '% changed')
    assert.ok(diff.mean > 3 && diff.percent > 10, label + ': expected the lens to visibly sample the backdrop')
  }

  const light = await state()
  assertToolbar(light)
  const lightButton = await evaluate('toolbarTest.buttonSkin()')
  assert.notEqual(lightButton.border, 'rgba(0, 0, 0, 0)', 'Light fullscreen border should be unchanged')
  assert.match(lightButton.shadow, /rgb[a]?\(17, 17, 26[,) ]/, 'Light capsule should keep its original shadow')
  await assertPaint('Light')
  const scrolled = await state({ scroll: 187 })
  assertToolbar(scrolled)
  assert.equal(scrolled.scroll, 187)
  assert.deepEqual(scrolled.rect, light.rect, 'Board scrolling should not move the fixed toolbar')
  assert.equal(scrolled.lensFilter, light.lensFilter, 'Scrolling should not replace the lens filter')
  await assertPaint('Scrolled light')

  const dark = await state({ theme: 'dark' })
  assertToolbar(dark)
  assert.notEqual(dark.tint, light.tint, 'Liquid tint should differ with Vuetify theme')
  assert.notEqual(dark.sheen, light.sheen, 'Liquid sheen should differ with Vuetify theme')
  for (const fallback of [false, true]) {
    const button = await evaluate('toolbarTest.buttonSkin(' + fallback + ')')
    assert.equal(button.border, 'rgba(0, 0, 0, 0)', 'Dark liquid fullscreen border should be invisible')
    assert.equal(button.width, lightButton.width, 'Hiding the border must not change button size')
    const shadows = button.shadow.match(/rgba?\([^)]*\)[^,]*/g)
    assert.ok(shadows?.length && shadows.every(shadow => shadow.startsWith('rgba(255, 255, 255,') && shadow.includes('inset')), 'Dark capsules should use only light inner highlights')
  }
  for (const theme of ['light', 'dark']) {
    const ordinary = await state({ theme, material: 'default' })
    assertToolbar(ordinary, false)
    assert.notEqual(ordinary.tint, theme === 'light' ? light.tint : dark.tint)
    assert.notEqual((await evaluate('toolbarTest.buttonSkin()')).border, 'rgba(0, 0, 0, 0)', 'Non-liquid fullscreen border should be unchanged')
  }
  assertToolbar(await state({ material: 'glass' }), false)

  const click = ({ x, y }) => {
    contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
  }
  const active = await state()
  click(active.previous.point)
  assert.ok(active.side.hit, 'Side action should remain hittable')
  click(active.side.point)
  assert.ok(active.date.hit, 'Date activator should remain hittable')
  click(active.date.point)
  let menu
  for (let attempt = 0; attempt < 20; attempt++) {
    menu = await evaluate('toolbarTest.dateMenu()')
    if (menu) break
    await delay(25)
  }
  assert.deepEqual(await evaluate('toolbarTest.activations'), ['prev-day', 'copy-to-today'])
  assert.deepEqual(menu, { filter: 'blur(12px)', lens: false }, 'Date picker should keep its own material')
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  contents.sendInputEvent({ type: 'mouseMove', x: 16, y: 16 })

  window.setContentSize(390, 680)
  const mobile = await state()
  assertToolbar(mobile)
  assert.equal(mobile.viewport[0], 390)
  assert.ok(mobile.rect.left >= 0 && mobile.rect.right <= mobile.viewport[0], 'Mobile toolbar should fit within the viewport')
  assert.ok(mobile.previous.width >= 40 && mobile.previous.height >= 44, 'Mobile toolbar button should retain a usable hit target')
  console.log('Real floating toolbar passed liquid light/dark, scrolling, non-liquid modes, controls, and mobile sizing.')
}

async function testPixels() {
  const { app, BrowserWindow, session } = require('electron')
  app.setPath('userData', process.env.STARFLAME_GLASS_PROFILE)
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  app.commandLine.appendSwitch('force-color-profile', 'srgb')
  await app.whenReady()
  const url = new URL(process.env.STARFLAME_GLASS_URL)
  assert.equal(url.hostname, loopback)
  const fixtureSession = session.fromPartition('liquid-glass-pixel-test')
  fixtureSession.webRequest.onBeforeRequest((request, callback) => {
    const requestUrl = new URL(request.url)
    const local = requestUrl.host === url.host
      && ['http:', 'ws:'].includes(requestUrl.protocol)
      && !/^\/(api|socket\.io)(\/|$)/.test(requestUrl.pathname)
    callback({ cancel: !local && requestUrl.protocol !== 'data:' && requestUrl.protocol !== 'blob:' })
  })
  const window = new BrowserWindow({
    width: 1050, height: 680, useContentSize: true, show: false,
    webPreferences: { backgroundThrottling: false, session: fixtureSession },
  })
  const contents = window.webContents
  contents.on('console-message', (_event, level, message) => { if (level >= 2) console.error(message) })
  try {
    await window.loadURL(url.href)
    const evaluate = (code) => contents.executeJavaScript(code)
    assert.ok(await evaluate('Boolean(window.glassTest)'), 'Vite fixture failed to load')
    const scenarios = [
      { name: 'unscrolled' },
      { name: 'scrolled', x: 81, y: 67 },
      { name: 'scrolled over fixed backdrop', x: 53, y: 94, fixedBackdrop: true },
      { name: 'nested CSS zoom', x: 74, y: 60, cssZoom: 1.18 },
      { name: 'nested non-uniform transform', x: 82, y: 54, transform: 'translate(17px, 9px) scale(1.16, 0.88)' },
      { name: 'Electron page zoom and wide host', x: 81, y: 73, pageZoom: 1.25, wide: true },
      { name: 'bordered host with default blur', x: 65, y: 85, bordered: true, defaults: true },
    ]
    const failures = []
    console.log('Electron ' + process.versions.electron + ', Chromium ' + process.versions.chrome)
    for (const scenario of scenarios) {
      contents.setZoomFactor(scenario.pageZoom || 1)
      const scroll = await evaluate('glassTest.setup(' + JSON.stringify(scenario) + ')')
      // Chromium snaps scroll to whole device pixels at non-integer page zoom.
      assert.ok(Math.abs(scroll.x - (scenario.x || 0)) <= 1 && Math.abs(scroll.y - (scenario.y || 0)) <= 1,
        scenario.name + ': scroll did not apply: ' + JSON.stringify(scroll))
      const off = await evaluate('glassTest.capture(false)')
      const before = raster(await contents.capturePage(), off)
      let on
      for (let attempt = 0; attempt < 30; attempt++) {
        on = await evaluate('glassTest.capture(true)')
        if (on.filtered.some(filter => filter.includes('url('))) break
        await delay(30)
      }
      const after = raster(await contents.capturePage(), on)
      const { center, outside, corners, edges } = compare(before, after)
      const bentEdges = edges.filter(edge => edge.gain >= 28).length
      console.log(scenario.name + ' | center mean=' + center.mean.toFixed(2) + ' changed=' + center.percent.toFixed(2) + '%'
        + ' | outside mean=' + outside.mean.toFixed(2) + ' changed=' + outside.percent.toFixed(2) + '%'
        + ' | corners mean=' + corners.map(corner => corner.mean.toFixed(2)).join('/')
        + ' | edge shift/gain ' + edges.map(edge => edge.side + '=' + edge.shift + '/' + edge.gain.toFixed(0)).join(' '))
      if (!on.filtered.some(filter => filter.includes('url('))) failures.push(scenario.name + ': SVG refraction filter missing (' + on.filtered.join(', ') + ')')
      // The default blur and saturation change interior colors by design. The sharp
      // scenarios isolate position, while this one checks actual default clipping.
      if (!scenario.defaults && (center.mean > 1.2 || center.percent > 5)) {
        failures.push(scenario.name + ': grid shifted or changed in the lens center')
      }
      if ([outside, ...corners].some(region => region.mean > 0.35 || region.percent > 0.4)) {
        failures.push(scenario.name + ': lens affected pixels outside its rounded clip')
      }
      if (!scenario.defaults && bentEdges !== 4) failures.push(scenario.name + ': expected displacement on four edges')
    }
    assert.ok(!failures.length, failures.join('\n'))
    console.log('All ' + scenarios.length + ' liquid-glass pixel scenarios passed.')

    await evaluate('glassTest.setup({ fixedBackdrop: true })')
    for (const theme of ['light', 'dark']) {
      async function captureMaterial(preset) {
        const geometry = await evaluate('glassTest.material(' + JSON.stringify(theme) + ',' + JSON.stringify(preset) + ')')
        assert.match(geometry.lensFilter, /url\(/, theme + ' card SVG filter missing')
        if (preset === 'default') {
          assert.match(geometry.rimShadow, /rgba\(255, 255, 255, [\d.]+\).* 1px inset/, theme + ' card should have a thin white rim')
          assert.equal(geometry.rimRadius, geometry.lensRadius, 'The rim should follow the same rounding as the lens')
          assert.equal(geometry.lensBlur, '6', theme + ' card should use 6px background blur')
          assert.equal(geometry.pillFilter, 'blur(10px)', theme + ' capsule should use 10px background blur')
        } else if (preset === 'custom') {
          assert.equal(geometry.lensBlur, '1.5', 'custom card blur should be honored')
          assert.equal(geometry.pillFilter, 'blur(4px)', 'custom capsule blur should be honored independently')
        }
        // Two animation frames can still precede the next compositor commit in a hidden window.
        for (let attempt = 0; attempt < 20; attempt++) {
          const image = await contents.capturePage()
          const card = raster(image, geometry)
          if (card.pixels[2] === geometry.paintMarker) {
            return { card, pill: { ...card, card: raster(image, { ...geometry, rect: geometry.capsule }).card } }
          }
          await delay(25)
        }
        assert.fail(theme + ' ' + preset + ': capture did not show the current preset')
      }
      const bare = await captureMaterial('bare')
      const previous = await captureMaterial('previous')
      if (theme === 'light') await captureMaterial('custom')
      const beforeTint = theme === 'dark' ? await captureMaterial('before-tint') : null
      const beforeButtonTint = theme === 'dark' ? await captureMaterial('before-button-tint') : null
      const current = await captureMaterial('default')
      for (const part of ['card', 'pill']) {
        const samples = region(bare[part].card, 0.2, 0.3, 0.8, 0.7)
        const fine = image => backdropContrast(image, samples, 2, 2, 0) + backdropContrast(image, samples, 1, 0, 2)
        const retainedColor = backdropContrast(current[part], samples, 0, 30, 0) / backdropContrast(bare[part], samples, 0, 30, 0)
        const retainedDetail = fine(current[part]) / fine(previous[part])
        console.log(theme + ' ' + part + ' fine detail vs previous: ' + retainedDetail.toFixed(2) +
          '; broad wallpaper color vs bare: ' + retainedColor.toFixed(2))
        assert.ok(retainedDetail < (part === 'pill' ? 0.40 : 0.65), theme + ' ' + part + ': expected softer fine texture')
        assert.ok(retainedColor > 0.50, theme + ' ' + part + ': wallpaper color should remain visible')
        if (beforeTint) {
          const gain = brightnessGain(beforeTint[part], current[part], samples)
          console.log('dark ' + part + ' brightness gain: ' + gain.toFixed(2) + ' / 255')
          assert.ok(gain >= 6, 'dark ' + part + ': expected a visibly brighter tint')
        }
        if (beforeButtonTint) {
          if (part === 'pill') {
            const gain = brightnessGain(beforeButtonTint.pill, current.pill, samples)
            console.log('dark button brightness gain over previous tint: ' + gain.toFixed(2) + ' / 255')
            assert.ok(gain >= 6 && gain <= 12, 'dark button: expected a modest tint lift')
          } else {
            assert.equal(averageDifference(beforeButtonTint.card, current.card, samples).mean, 0, 'dark card: tint should be unchanged')
          }
        }
      }
    }

    await testToolbar(window, url)
  } finally {
    window.destroy()
  }
}

if (process.versions.electron) {
  testPixels().then(() => require('electron').app.exit(0), error => {
    console.error(error)
    require('electron').app.exit(1)
  })
} else {
  launch().catch(error => { console.error(error); process.exitCode = 1 })
}
