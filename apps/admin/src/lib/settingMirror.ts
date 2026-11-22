/**
 * 后台「设置」镜像定义：与 apps/web/src/lib/settingDefs.ts 保持一致的 key、标题与默认值。
 * 前端新增/调整设置项时，必须在这里同步，否则后台「设置」分组表单看不到该键。
 */
export type MirrorType = 'bool' | 'number' | 'text' | 'json' | 'select'

export interface MirrorOption {
  title: string
  value: string
}

export interface MirrorField {
  key: string
  title: string
  hint?: string
  type: MirrorType
  default: unknown
  min?: number
  max?: number
  step?: number
  options?: MirrorOption[]
}

export interface MirrorGroup {
  key: string
  title: string
  icon: string
  fields: MirrorField[]
}

const bool = (key: string, title: string, def: boolean, hint = ''): MirrorField => ({ key, title, hint, type: 'bool', default: def })
const num = (key: string, title: string, def: number, min: number, max: number, step = 1, hint = ''): MirrorField => ({ key, title, hint, type: 'number', default: def, min, max, step })
const text = (key: string, title: string, def = '', hint = ''): MirrorField => ({ key, title, hint, type: 'text', default: def })
const json = (key: string, title: string, def: unknown, hint = ''): MirrorField => ({ key, title, hint, type: 'json', default: def })
const select = (key: string, title: string, def: string, options: MirrorOption[], hint = ''): MirrorField => ({ key, title, hint, type: 'select', default: def, options })

/** 与前端 apps/web/src/lib/soundPresets.ts 的 TONE_PRESETS 一致 */
const TONE_OPTIONS: MirrorOption[] = [{ title: '叮铃', value: 'ding' }, { title: '双响', value: 'double-ding' }, { title: '气泡', value: 'bubble' }, { title: '波普', value: 'pop' }, { title: '和弦铃', value: 'chime' }, { title: '木琴', value: 'marimba' }, { title: '警报', value: 'alert' }, { title: '长鸣', value: 'siren' }, { title: '滴水', value: 'droplet' }, { title: '摇摆', value: 'swing' }, { title: '脉冲', value: 'pulse' }, { title: '星火', value: 'star' }]

export const SETTING_GROUPS: MirrorGroup[] = [
  {
    key: 'display',
    title: '显示与主题',
    icon: 'mdi-monitor-dashboard',
    fields: [
      select('theme.mode', '主题模式', 'dark', [{ title: '明亮', value: 'light' }, { title: '暗黑', value: 'dark' }], '本机设置，不同步云端'),
      bool('timeCard.enabled', '启用时间卡片', true, '大号时钟与日期'),
      select('display.emptySubjectDisplay', '空科目的显示方式', 'button', [{ title: '卡片', value: 'card' }, { title: '按钮', value: 'button' }], '当日无作业的科目如何展示'),
      bool('display.dynamicSort', '是否启用动态排序', true, '按内容高度自动调整卡片顺序'),
      bool('display.showRandomButton', '是否显示随机点人按钮', true, '底栏的随机点名按钮'),
      bool('display.showFullscreenButton', '是否显示全屏按钮', true, '底栏的全屏切换按钮'),
      bool('display.cardHoverEffect', '是否启用卡片悬浮效果', true, '鼠标悬停时卡片上浮'),
      bool('display.enhancedTouchMode', '是否启用增强触摸模式', true, '为触摸屏优化点击区域'),
      bool('display.showQuickTools', '是否显示快捷键键盘', true, '作业编辑弹窗右侧数字键盘'),
      bool('display.showPasteButtons', '是否显示粘贴按钮', true, '作业编辑弹窗的粘贴按钮'),
      bool('display.showListCard', '是否显示列表卡片', true, '底栏的作业列表入口'),
      bool('display.showAttendance', '是否显示出勤统计', false, '大屏右侧（作业墙为左栏）的出勤统计卡片'),
      bool('display.showExamScheduleButton', '是否显示考试看板', true, '底栏的考试看板按钮'),
      bool('display.forceDesktopMode', '强制使用一体机UI模式', false, '小屏也使用桌面布局'),
      bool('display.lateStudentsArePresent', '将迟到人数算入出勤人数', false, '关闭后迟到不计入实到'),
      num('font.size', '字号大小', 28, 12, 72, 1, '看板正文字号（px）'),
    ],
  },
  {
    key: 'edit',
    title: '作业编辑',
    icon: 'mdi-pencil-outline',
    fields: [
      bool('edit.autoSave', '是否启用自动保存', false, '关闭编辑弹窗时自动保存'),
      bool('edit.blockNonTodayAutoSave', '禁止自动保存非当天数据', true, '历史数据必须手动确认'),
      bool('edit.confirmNonTodaySave', '保存非当天数据需确认', true, '修改历史作业时弹确认框'),
      bool('edit.refreshBeforeEdit', '编辑前是否自动刷新', true, '防止覆盖其他设备的修改'),
      bool('edit.blockPastDataEdit', '禁止编辑过往数据', false, '只能修改当天的作业'),
      text('edit.autoSavePromptText', '自动保存模式提示文本', '内容会自动保存，关闭对话框即生效', '显示在编辑弹窗副标题'),
      text('edit.manualSavePromptText', '手动保存模式提示文本', '修改后请点击保存', '关闭自动保存时显示'),
    ],
  },
  {
    key: 'hitokoto',
    title: '一言',
    icon: 'mdi-comment-quote-outline',
    fields: [
      bool('hitokoto.enabled', '启用一言', true, '显示随机语句卡片'),
      num('hitokoto.refreshInterval', '刷新时间（秒，0为不自动刷新）', 600, 0, 3600, 30, '一言轮换间隔'),
      json('hitokoto.sources', '数据源', ['hitokoto', 'jinrishici', 'zhaoyu', 'builtin'], '可多选：builtin / hitokoto / zhaoyu / jinrishici / custom；全部不可用时回退内置词库'),
      json('hitokoto.categories', '一言分类', [], '如 ["d","i"]，仅“一言 API”生效'),
      text('hitokoto.customUrl', '自定义接口地址', '', '返回 JSON 或纯文本，需对方允许跨域'),
      text('hitokoto.jinrishiciToken', '今日诗词 Token', '', '留空或失效时自动向今日诗词重新申请'),
      text('hitokoto.sensitiveWords', '自定义敏感词', '', '逗号分隔，命中即换源重取'),
    ],
  },
  {
    key: 'notification',
    title: '通知',
    icon: 'mdi-bell-outline',
    fields: [
      bool('notification.enabled', '启用通知提示音', true, '收到新通知时播放提示音'),
      num('notification.volume', '提示音音量', 70, 0, 100, 10, '单位：%'),
      select('notification.singleSound', '单次通知铃声', 'star', TONE_OPTIONS, '普通通知播放一次'),
      select('notification.urgentSound', '紧急通知铃声', 'alert', TONE_OPTIONS, '紧急通知循环播放'),
    ],
  },
  {
    key: 'randomPicker',
    title: '随机点名',
    icon: 'mdi-account-question-outline',
    fields: [
      bool('randomPicker.enabled', '是否启用随机点名功能', true, '关闭后不显示入口'),
      select('randomPicker.mode', '随机点名模式', 'name', [{ title: '姓名模式', value: 'name' }, { title: '学号模式', value: 'number' }], '姓名模式或学号模式'),
      num('randomPicker.minNumber', '学号模式最小值', 1, 1, 99, 1, '抽取学号的起始值'),
      num('randomPicker.maxNumber', '学号模式最大值', 60, 1, 200, 1, '抽取学号的结束值'),
      num('randomPicker.defaultCount', '默认抽取人数', 1, 1, 20, 1, '打开弹窗时的初始人数'),
      bool('randomPicker.animation', '是否启用随机点名动画效果', true, '抽选时的滚动动画'),
      bool('randomPicker.excludeAbsent', '排除请假学生', true, '不抽取请假学生'),
      bool('randomPicker.excludeLate', '排除迟到学生', false, '不抽取迟到学生'),
      bool('randomPicker.excludeExcluded', '排除不参与学生', true, '不抽取不参与学生'),
    ],
  },
  {
    key: 'background',
    title: '主题',
    icon: 'mdi-image-outline',
    fields: [
      select('theme.card', '卡片主题', 'default', [{ title: '默认', value: 'default' }, { title: '玻璃', value: 'glass' }], '学科卡片与底栏按钮的外观风格'),
      bool('background.enabled', '启用自定义背景', false, '使用图片作为大屏背景'),
      text('background.url', '背景图地址', '', '必须是 https 图片地址'),
      text('background.imageData', '本地背景图', '', '本地上传的图片（data URL），一般在大屏设置里上传'),
      num('background.blur', '模糊程度', 10, 0, 40, 1, '单位：px'),
      num('background.opacity', '遮罩不透明度', 30, 0, 90, 5, '单位：%'),
    ],
  },
  {
    key: 'timeSync',
    title: '时间同步',
    icon: 'mdi-timer-sync-outline',
    fields: [
      select('timeSync.source', '时间源', 'aliyun', [
        { title: '默认（阿里云 NTP）', value: 'aliyun' },
        { title: '本地（设备时钟）', value: 'local' },
        { title: '自定义 NTP 服务器', value: 'custom' },
      ], '大屏时钟使用哪个时间源校准'),
      text('timeSync.customHost', '自定义 NTP 服务器', '', '仅“自定义”时间源生效，如 time.windows.com'),
      num('timeSync.intervalMin', '自动同步间隔', 5, 1, 60, 1, '单位：分钟'),
    ],
  },
  {
    key: 'other',
    title: '其他',
    icon: 'mdi-cog-outline',
    fields: [
      json('schedule.weekly', '每周作息', {
        mon: { start: '08:00', end: '21:00' },
        tue: { start: '07:30', end: '21:00' },
        wed: { start: '07:30', end: '21:00' },
        thu: { start: '07:30', end: '21:00' },
        fri: { start: '07:30', end: '21:00' },
        sat: null,
        sun: null,
      }, '各天的上学与放学时间'),
      json('schedule.periods', '每天课程时间段', {}, '各天的上课节次：{ mon: [{ name: "第1节", start: "08:00", end: "08:45" }] }；上课时段内暂停桌面端静默更新'),
      bool('update.pauseDuringClass', '上课时段暂停静默更新', true, '上课时间不下载、不安装，下课后 5 分钟自动继续；仅桌面端生效'),
      bool('pwa.hideInstallCard', '隐藏安装提示卡片', false, '不再显示 PWA 安装引导'),
      select('server.provider', '数据提供者', 'starflame-api', [
        { title: '星焰作业板API', value: 'starflame-api' },
        { title: '本地缓存模式（离线可用）', value: 'local-cache' },
      ], '当前数据来源'),
    ],
  },
]

export const MIRROR_FIELDS: MirrorField[] = SETTING_GROUPS.flatMap((group) => group.fields)
