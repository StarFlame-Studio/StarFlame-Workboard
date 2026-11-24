import { TONE_PRESETS } from './soundPresets'

export type SettingType = 'boolean' | 'number' | 'string' | 'select' | 'json'

export interface SettingDef {
  key: string
  title: string
  desc?: string
  icon: string
  type: SettingType
  default: unknown
  min?: number
  max?: number
  step?: number
  options?: Array<{ title: string; value: unknown }>
  /** 本机设置：只存浏览器本地，不同步云端、不进待同步队列 */
  local?: boolean
}

const num = (key: string, title: string, def: number, min: number, max: number, step: number, icon: string, desc = ''): SettingDef =>
  ({ key, title, desc, icon, type: 'number', default: def, min, max, step })

const bool = (key: string, title: string, def: boolean, icon: string, desc = ''): SettingDef =>
  ({ key, title, desc, icon, type: 'boolean', default: def })

const text = (key: string, title: string, def: string, icon: string, desc = ''): SettingDef =>
  ({ key, title, desc, icon, type: 'string', default: def })

export const SETTING_DEFS: SettingDef[] = [
  // ---- 显示 display.* ----
  { key: 'theme.mode', title: '主题模式', desc: '本机设置，不同步云端（每台设备各自生效）', icon: 'mdi-theme-light-dark', type: 'select', default: 'dark', local: true,
    options: [{ title: '明亮', value: 'light' }, { title: '暗黑', value: 'dark' }] },
  // 卡片主题与下面的 liquid.* 都是「这台设备看起来怎样」，属于本机设置：
  // 不同设备屏幕/显卡差异大，参数同步到云端只会互相覆盖，所以不加进班级设置。
  { key: 'theme.card', title: '卡片主题', desc: '本机设置，不同步云端（每台设备各自生效）', icon: 'mdi-palette-outline', type: 'select', default: 'glass',
    options: [{ title: '默认', value: 'default' }, { title: '玻璃', value: 'glass' }, { title: '液态玻璃', value: 'liquid' }] },

  // ---- 液态玻璃 liquid.* ----
  // 选中「液态玻璃」后才会在设置页展开。数值全部由 lib/liquidGlassSettings.ts
  // 翻译成 CSS 变量（皮肤层）或组件 props（折射层），作用于全局所有玻璃卡片/胶囊。
  num('liquid.distortionScale', '折射强度', -210, -400, -40, 10, 'mdi-magnify-scan', '位移贴图缩放；绝对值越大弯折越强，默认 -210'),
  num('liquid.borderWidth', '折射带宽度', 0.09, 0.02, 0.3, 0.01, 'mdi-border-outside', '贴边折射带占短边的比例（再 ×0.5），默认 0.09'),
  num('liquid.refractBlur', '贴图柔化', 3, 0, 12, 0.5, 'mdi-blur', '位移贴图的高斯 σ；过大边缘会出现内嵌边界，默认 3'),
  num('liquid.saturation', '折射饱和度', 1.5, 0.5, 2.5, 0.05, 'mdi-palette-swatch-outline', '折射后背景的饱和度，默认 1.5'),
  num('liquid.brightness', '中性亮度', 50, 30, 70, 1, 'mdi-brightness-6', '贴图中性区灰度；保持 50，偏离会造成整体位移'),
  num('liquid.neutralOpacity', '中性层不透明度', 1, 0.5, 1, 0.01, 'mdi-opacity', '必须 1；小于 1 会让位移渐变漏出，导致背景整体偏移'),
  num('liquid.displace', '散景', 0, 0, 4, 0.1, 'mdi-blur-radial', '额外 5×5 采样柔化，0 关闭；越大越糊也越慢'),
  num('liquid.redOffset', '红通道偏移', 0, -40, 40, 1, 'mdi-record-circle-outline', '与另两个通道的差值决定色散强弱'),
  num('liquid.greenOffset', '绿通道偏移', 10, -40, 40, 1, 'mdi-record-circle-outline', ''),
  num('liquid.blueOffset', '蓝通道偏移', 20, -40, 40, 1, 'mdi-record-circle-outline', '三个偏移越接近，彩边越弱'),
  num('liquid.backdropBlur', '背景模糊（px）', 3, 0, 12, 0.5, 'mdi-blur-linear', '折射层背后的模糊半径，越大文字越好读，默认 3'),
  num('liquid.frostLight', '霜层不透明度（亮色）', 0.24, 0, 1, 0.02, 'mdi-circle-opacity', '卡片底色不透明度，越大越不透'),
  num('liquid.frostDark', '霜层不透明度（暗色）', 0.26, 0, 1, 0.02, 'mdi-circle-opacity', ''),
  num('liquid.rimLight', '描边亮度（亮色）', 0.8, 0, 1, 0.02, 'mdi-border-color', '卡片 1px 描边的白色不透明度'),
  num('liquid.rimDark', '描边亮度（暗色）', 0.32, 0, 1, 0.02, 'mdi-border-color', ''),
  num('liquid.sheenLight', '高光强度（亮色）', 0.85, 0, 2, 0.05, 'mdi-weather-sunny', '135° 斜向反光的倍率，0 关闭'),
  num('liquid.sheenDark', '高光强度（暗色）', 1.15, 0, 2, 0.05, 'mdi-weather-sunny', ''),
  num('liquid.thicknessLight', '玻璃厚度（亮色）', 0.06, 0, 0.5, 0.01, 'mdi-layers-outline', 'inset 2px 那圈厚度描边的浓度'),
  num('liquid.thicknessDark', '玻璃厚度（暗色）', 0.24, 0, 0.5, 0.01, 'mdi-layers-outline', ''),
  num('liquid.glowLight', '内晕（亮色）', 0.05, 0, 0.3, 0.01, 'mdi-radiobox-blank', '厚度向内晕开的范围浓度'),
  num('liquid.glowDark', '内晕（暗色）', 0.12, 0, 0.3, 0.01, 'mdi-radiobox-blank', ''),
  num('liquid.outerLight', '外投影强度（亮色）', 1, 0, 3, 0.1, 'mdi-box-shadow', '三层外投影的倍率，0 为无投影'),
  num('liquid.outerDark', '外投影强度（暗色）', 1, 0, 3, 0.1, 'mdi-box-shadow', ''),
  num('liquid.pillFrostLight', '胶囊霜层（亮色）', 0.3, 0, 1, 0.02, 'mdi-pill', '底栏按钮 / 学科按钮的底色不透明度'),
  num('liquid.pillFrostDark', '胶囊霜层（暗色）', 0.4, 0, 1, 0.02, 'mdi-pill', ''),
  num('liquid.pillSheenLight', '胶囊高光（亮色）', 1, 0, 2, 0.05, 'mdi-pill', '胶囊反光的倍率'),
  num('liquid.pillSheenDark', '胶囊高光（暗色）', 1, 0, 2, 0.05, 'mdi-pill', ''),
  bool('timeCard.enabled', '启用时间卡片', true, 'mdi-clock-outline', '大号时钟与日期'),
  { key: 'display.emptySubjectDisplay', title: '空科目的显示方式', desc: '当日无作业的科目如何展示', icon: 'mdi-card-plus-outline', type: 'select', default: 'button',
    options: [{ title: '卡片', value: 'card' }, { title: '按钮', value: 'button' }] },
  bool('display.dynamicSort', '是否启用动态排序', true, 'mdi-sort-variant', '按内容高度自动调整卡片顺序'),
  bool('display.showRandomButton', '是否显示随机点人按钮', true, 'mdi-dice-multiple', '底栏的随机点名按钮'),
  bool('display.showFullscreenButton', '是否显示全屏按钮', true, 'mdi-fullscreen', '底栏的全屏切换按钮'),
  bool('display.cardHoverEffect', '是否启用卡片悬浮效果', true, 'mdi-gesture-tap', '鼠标悬停时卡片上浮'),
  bool('display.enhancedTouchMode', '是否启用增强触摸模式', true, 'mdi-gesture-tap-button', '为触摸屏优化点击区域'),
  bool('display.showQuickTools', '是否显示快捷键键盘', true, 'mdi-keyboard-outline', '作业编辑弹窗右侧数字键盘'),
  bool('display.showPasteButtons', '是否显示粘贴按钮', true, 'mdi-content-paste', '作业编辑弹窗的粘贴按钮'),
  bool('display.showListCard', '是否显示列表卡片', true, 'mdi-list-box', '底栏的作业列表入口'),
  bool('display.showAttendance', '是否显示出勤统计', false, 'mdi-account-group', '大屏右侧（作业墙为左栏）的出勤统计卡片'),
  bool('display.showExamScheduleButton', '是否显示考试看板', true, 'mdi-calendar-check', '底栏的考试看板按钮'),
  bool('display.forceDesktopMode', '强制使用一体机UI模式', false, 'mdi-monitor-lock', '小屏也使用桌面布局'),
  bool('display.lateStudentsArePresent', '将迟到人数算入出勤人数', false, 'mdi-clock-alert-outline', '关闭后迟到不计入实到'),
  num('font.size', '字号大小', 28, 12, 72, 1, 'mdi-format-size', '看板正文字号（px）'),

  // ---- 编辑 edit.* ----
  bool('edit.autoSave', '是否启用自动保存', false, 'mdi-content-save-cog-outline', '关闭编辑弹窗时自动保存'),
  bool('edit.blockNonTodayAutoSave', '禁止自动保存非当天数据', true, 'mdi-calendar-lock-outline', '历史数据必须手动确认'),
  bool('edit.confirmNonTodaySave', '保存非当天数据需确认', true, 'mdi-alert-circle-outline', '修改历史作业时弹确认框'),
  bool('edit.refreshBeforeEdit', '编辑前是否自动刷新', true, 'mdi-refresh-auto', '防止覆盖其他设备的修改'),
  bool('edit.blockPastDataEdit', '禁止编辑过往数据', false, 'mdi-calendar-remove-outline', '只能修改当天的作业'),
  text('edit.autoSavePromptText', '自动保存模式提示文本', '内容会自动保存，关闭对话框即生效', 'mdi-message-text-outline', '显示在编辑弹窗副标题'),
  text('edit.manualSavePromptText', '手动保存模式提示文本', '修改后请点击保存', 'mdi-message-outline', '关闭自动保存时显示'),

  // ---- 一言 hitokoto.* ----
  bool('hitokoto.enabled', '启用一言', true, 'mdi-comment-quote', '显示随机语句卡片'),
  num('hitokoto.refreshInterval', '刷新时间（秒，0为不自动刷新）', 600, 0, 3600, 30, 'mdi-timer-refresh-outline', '一言轮换间隔'),
  { key: 'hitokoto.sources', title: '数据源', desc: '可多选，全部不可用时回退内置词库', icon: 'mdi-source-branch', type: 'json', default: ['hitokoto', 'jinrishici', 'zhaoyu', 'builtin'] },
  { key: 'hitokoto.categories', title: '一言分类', desc: '仅“一言 API”生效', icon: 'mdi-tag-multiple-outline', type: 'json', default: [] },
  text('hitokoto.customUrl', '自定义接口地址', '', 'mdi-link-variant', '返回 JSON 或纯文本，需对方允许跨域'),
  text('hitokoto.jinrishiciToken', '今日诗词 Token', '', 'mdi-key-outline', '留空或失效时自动向今日诗词重新申请'),
  text('hitokoto.sensitiveWords', '自定义敏感词', '', 'mdi-shield-alert-outline', '逗号分隔，命中即换源重取'),

  // ---- 通知 notification.* ----
  bool('notification.enabled', '启用通知提示音', true, 'mdi-bell-outline', '收到新通知时播放提示音'),
  num('notification.volume', '提示音音量', 70, 0, 100, 10, 'mdi-volume-high', '单位：%'),
  { key: 'notification.singleSound', title: '单次通知铃声', desc: '普通通知播放一次', icon: 'mdi-music-note', type: 'select', default: 'star',
    options: TONE_PRESETS.map((t) => ({ title: t.title, value: t.id })) },
  { key: 'notification.urgentSound', title: '紧急通知铃声', desc: '紧急通知循环播放', icon: 'mdi-music-note-plus', type: 'select', default: 'alert',
    options: TONE_PRESETS.map((t) => ({ title: t.title, value: t.id })) },

  // ---- 随机点名 randomPicker.* ----
  bool('randomPicker.enabled', '是否启用随机点名功能', true, 'mdi-account-question', '关闭后不显示入口'),
  { key: 'randomPicker.mode', title: '随机点名模式', desc: '姓名模式或学号模式', icon: 'mdi-format-list-bulleted', type: 'select', default: 'name',
    options: [{ title: '姓名模式', value: 'name' }, { title: '学号模式', value: 'number' }] },
  num('randomPicker.minNumber', '学号模式最小值', 1, 1, 99, 1, 'mdi-numeric-1-box', '抽取学号的起始值'),
  num('randomPicker.maxNumber', '学号模式最大值', 60, 1, 200, 1, 'mdi-numeric', '抽取学号的结束值'),
  num('randomPicker.defaultCount', '默认抽取人数', 1, 1, 20, 1, 'mdi-account-multiple', '打开弹窗时的初始人数'),
  bool('randomPicker.animation', '是否启用随机点名动画效果', true, 'mdi-animation-play-outline', '抽选时的滚动动画'),
  bool('randomPicker.excludeAbsent', '排除请假学生', true, 'mdi-account-off-outline', '不抽取请假学生'),
  bool('randomPicker.excludeLate', '排除迟到学生', false, 'mdi-clock-alert-outline', '不抽取迟到学生'),
  bool('randomPicker.excludeExcluded', '排除不参与学生', true, 'mdi-account-cancel-outline', '不抽取不参与学生'),

  // ---- 背景 background.* ----
  bool('background.enabled', '启用自定义背景', false, 'mdi-toggle-switch-outline', '使用图片作为大屏背景'),
  text('background.url', '背景图地址', '', 'mdi-link-variant', '必须是 https 图片地址'),
  text('background.imageData', '本地背景图', '', 'mdi-image-outline', '本地上传的图片（data URL）'),
  num('background.blur', '模糊程度', 10, 0, 40, 1, 'mdi-blur', '单位：px'),
  num('background.opacity', '遮罩不透明度', 30, 0, 90, 5, 'mdi-circle-opacity', '单位：%'),

  // ---- 作息（对象型，由专属卡片渲染）----
  { key: 'schedule.weekly', title: '每周作息', desc: '各天的上学、走读放学与住宿放学时间', icon: 'mdi-school', type: 'string', default: {
      mon: { start: '08:00', end: '17:30', endBoarding: '21:00' },
      tue: { start: '07:30', end: '17:30', endBoarding: '21:00' },
      wed: { start: '07:30', end: '17:30', endBoarding: '21:00' },
      thu: { start: '07:30', end: '17:30', endBoarding: '21:00' },
      fri: { start: '07:30', end: '17:30', endBoarding: '21:00' },
      sat: null,
      sun: null,
    } },
  { key: 'schedule.periods', title: '每天课程时间段', desc: '各天的上课节次时间；上课时段内暂停桌面端静默更新', icon: 'mdi-timetable', type: 'json', default: {} },
  num('schedule.bellOffset', '课铃偏移时间', 0, -1800, 1800, 1, 'mdi-bell-ring', '单位：秒；正数=提前响铃，负数=延后响铃（只影响放学倒计时）'),
  bool('update.pauseDuringClass', '上课时段暂停静默更新', true, 'mdi-pause-circle-outline', '上课时间不下载、不安装，下课后 5 分钟自动继续；仅桌面端生效'),

  // ---- 时间同步 timeSync.* ----
  { key: 'timeSync.source', title: '时间源', desc: '大屏时钟使用哪个时间源校准', icon: 'mdi-timer-sync-outline', type: 'select', default: 'aliyun',
    options: [
      { title: '默认（阿里云 NTP）', value: 'aliyun' },
      { title: '本地（设备时钟）', value: 'local' },
      { title: '自定义 NTP 服务器', value: 'custom' },
    ] },
  text('timeSync.customHost', '自定义 NTP 服务器', '', 'mdi-server-network', '仅“自定义”时间源生效，填写 NTP 主机名，如 time.windows.com'),
  num('timeSync.intervalMin', '自动同步间隔', 5, 1, 60, 1, 'mdi-timer-sync-outline', '单位：分钟'),

  // ---- 其他 ----
  bool('pwa.hideInstallCard', '隐藏安装提示卡片', false, 'mdi-cellphone-remove', '不再显示 PWA 安装引导'),
  { key: 'server.provider', title: '数据提供者', desc: '当前数据来源', icon: 'mdi-database', type: 'select', default: 'starflame-api',
    options: [
      { title: '星焰作业板API', value: 'starflame-api' },
      { title: '本地缓存模式（离线可用）', value: 'local-cache' },
    ] },
]

// 主题相关的参数一律本机化：不同设备屏幕/亮度/显卡不同，同一套数值同步过去只会互相覆盖
// - theme.card / liquid.*：卡片材质与液态玻璃参数
// - background.*：壁纸、模糊与遮罩（同一张壁纸同步给所有设备既占带宽也拖慢首屏，故只存本机）
for (const def of SETTING_DEFS) {
  if (def.key === 'theme.card' || def.key.startsWith('liquid.') || def.key.startsWith('background.')) {
    def.local = true
  }
}

export const SETTING_MAP: Record<string, SettingDef> = Object.fromEntries(
  SETTING_DEFS.map((item) => [item.key, item]),
)

export function getDef(key: string): SettingDef | undefined {
  return SETTING_MAP[key]
}

export function getDefault(key: string): unknown {
  return SETTING_MAP[key]?.default
}

/** 按前缀取一组设置 key，保持定义顺序 */
export function keysByPrefix(prefix: string): string[] {
  return SETTING_DEFS.filter((item) => item.key.startsWith(prefix + '.')).map((item) => item.key)
}
