// 预设铃声库：全部用 Web Audio 实时合成，不依赖音频文件
export interface ToneNote {
  freq: number
  start: number
  duration: number
  type?: OscillatorType
  gain?: number
}

export interface TonePreset {
  id: string
  title: string
  desc: string
  notes: ToneNote[]
  loopGap?: number
}

export const TONE_PRESETS: TonePreset[] = [
  {
    id: 'ding',
    title: '叮铃',
    desc: '干净的单音提示',
    notes: [{ freq: 880, start: 0, duration: 0.35, type: 'sine', gain: 0.28 }],
  },
  {
    id: 'double-ding',
    title: '双响',
    desc: '两声清脆提示',
    notes: [
      { freq: 988, start: 0, duration: 0.22, type: 'sine', gain: 0.26 },
      { freq: 1319, start: 0.18, duration: 0.32, type: 'sine', gain: 0.24 },
    ],
  },
  {
    id: 'bubble',
    title: '气泡',
    desc: '柔和的上滑音',
    notes: [
      { freq: 520, start: 0, duration: 0.12, type: 'sine', gain: 0.22 },
      { freq: 660, start: 0.1, duration: 0.12, type: 'sine', gain: 0.24 },
      { freq: 820, start: 0.2, duration: 0.18, type: 'sine', gain: 0.22 },
    ],
  },
  {
    id: 'pop',
    title: '波普',
    desc: '短促有力的点击感',
    notes: [{ freq: 440, start: 0, duration: 0.09, type: 'square', gain: 0.16 }],
  },
  {
    id: 'chime',
    title: '和弦铃',
    desc: '三音和弦，教室友好',
    notes: [
      { freq: 523.25, start: 0, duration: 0.5, type: 'sine', gain: 0.18 },
      { freq: 659.25, start: 0, duration: 0.5, type: 'sine', gain: 0.16 },
      { freq: 783.99, start: 0, duration: 0.5, type: 'sine', gain: 0.14 },
    ],
  },
  {
    id: 'marimba',
    title: '木琴',
    desc: '轻快的三连音',
    notes: [
      { freq: 784, start: 0, duration: 0.18, type: 'triangle', gain: 0.22 },
      { freq: 988, start: 0.14, duration: 0.18, type: 'triangle', gain: 0.2 },
      { freq: 1175, start: 0.28, duration: 0.26, type: 'triangle', gain: 0.18 },
    ],
  },
  {
    id: 'alert',
    title: '警报',
    desc: '双音交替，适合紧急提醒',
    notes: [
      { freq: 880, start: 0, duration: 0.2, type: 'square', gain: 0.18 },
      { freq: 660, start: 0.22, duration: 0.2, type: 'square', gain: 0.18 },
      { freq: 880, start: 0.44, duration: 0.2, type: 'square', gain: 0.18 },
      { freq: 660, start: 0.66, duration: 0.28, type: 'square', gain: 0.16 },
    ],
  },
  {
    id: 'siren',
    title: '长鸣',
    desc: '持续升调，紧急通知用',
    notes: [
      { freq: 600, start: 0, duration: 0.35, type: 'sawtooth', gain: 0.14 },
      { freq: 800, start: 0.3, duration: 0.35, type: 'sawtooth', gain: 0.14 },
      { freq: 1000, start: 0.6, duration: 0.4, type: 'sawtooth', gain: 0.12 },
    ],
  },
  {
    id: 'droplet',
    title: '滴水',
    desc: '水滴般清亮',
    notes: [
      { freq: 1400, start: 0, duration: 0.1, type: 'sine', gain: 0.2 },
      { freq: 1000, start: 0.07, duration: 0.16, type: 'sine', gain: 0.16 },
    ],
  },
  {
    id: 'swing',
    title: '摇摆',
    desc: '轻快跳动感',
    notes: [
      { freq: 660, start: 0, duration: 0.12, type: 'triangle', gain: 0.2 },
      { freq: 880, start: 0.12, duration: 0.12, type: 'triangle', gain: 0.2 },
      { freq: 660, start: 0.24, duration: 0.12, type: 'triangle', gain: 0.18 },
      { freq: 880, start: 0.36, duration: 0.2, type: 'triangle', gain: 0.18 },
    ],
  },
  {
    id: 'pulse',
    title: '脉冲',
    desc: '均匀的电子提示',
    notes: [
      { freq: 1046, start: 0, duration: 0.08, type: 'sine', gain: 0.2 },
      { freq: 1046, start: 0.16, duration: 0.08, type: 'sine', gain: 0.2 },
      { freq: 1046, start: 0.32, duration: 0.08, type: 'sine', gain: 0.2 },
    ],
  },
  {
    id: 'star',
    title: '星火',
    desc: '上行琶音，品牌音',
    notes: [
      { freq: 659.25, start: 0, duration: 0.14, type: 'sine', gain: 0.2 },
      { freq: 783.99, start: 0.1, duration: 0.14, type: 'sine', gain: 0.2 },
      { freq: 987.77, start: 0.2, duration: 0.14, type: 'sine', gain: 0.2 },
      { freq: 1318.51, start: 0.3, duration: 0.3, type: 'sine', gain: 0.18 },
    ],
  },
]

export const DEFAULT_SINGLE_SOUND = 'ding'
export const DEFAULT_URGENT_SOUND = 'alert'

export function getPreset(id: string): TonePreset {
  return TONE_PRESETS.find((item) => item.id === id) ?? TONE_PRESETS[0]!
}

let currentCtx: AudioContext | null = null
let currentNodes: OscillatorNode[] = []

let unlocked = false

/**
 * 浏览器自动播放策略要求先有一次用户手势。
 * 绑定一次性的 pointerdown 监听，在首次交互时静默打开并关闭一个 AudioContext。
 */
export function unlockAudioOnFirstGesture(): void {
  if (unlocked) return
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return

  const handler = (): void => {
    try {
      const ctx = new Ctor()
      void ctx.resume().then(() => ctx.close()).catch(() => {})
      unlocked = true
    } catch {
      // 忽略
    }
    window.removeEventListener('pointerdown', handler)
    window.removeEventListener('keydown', handler)
  }

  window.addEventListener('pointerdown', handler, { once: true })
  window.addEventListener('keydown', handler, { once: true })
}

export function stopTone(): void {
  for (const node of currentNodes) {
    try {
      node.stop()
    } catch {
      // 已停止
    }
  }
  currentNodes = []
  if (currentCtx) {
    void currentCtx.close().catch(() => {})
    currentCtx = null
  }
}

/**
 * 播放预设铃声
 * @param id 预设 id
 * @param volume 0~1
 * @param repeat 是否重复播放（紧急通知）
 */
export function playTone(id: string, volume = 0.7, repeat = false): void {
  stopTone()
  const preset = getPreset(id)

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return

  const ctx = new Ctor()
  currentCtx = ctx

  const totalDuration = Math.max(...preset.notes.map((n) => n.start + n.duration))
  const loops = repeat ? 3 : 1

  for (let loop = 0; loop < loops; loop += 1) {
    for (const note of preset.notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = note.type ?? 'sine'
      osc.frequency.value = note.freq

      const startAt = ctx.currentTime + loop * (totalDuration + (preset.loopGap ?? 0.35)) + note.start
      const peak = Math.min(0.6, (note.gain ?? 0.2) * Math.max(0.05, volume))

      gain.gain.setValueAtTime(0, startAt)
      gain.gain.linearRampToValueAtTime(peak, startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(startAt)
      osc.stop(startAt + note.duration + 0.02)
      currentNodes.push(osc)
    }
  }

  const totalMs = (totalDuration + (preset.loopGap ?? 0.35)) * loops * 1000 + 200
  window.setTimeout(() => {
    if (currentCtx === ctx) stopTone()
  }, totalMs)
}
