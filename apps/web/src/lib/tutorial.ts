/**
 * 引导式教程（基础版）的数据与本地记忆。
 *
 * 首次进入作业板时会询问是否查看教程；看完或跳过都会记下，之后不再自动弹出。
 *
 * 教程是「跟着做」型的：讲解到布置作业、调整字号、切换日期这几步时，
 * 不给「下一步」按钮，而是等用户在看板上真的完成对应操作后自动推进，
 * 这样用户是动手练过一遍，而不是只看了一遍文字。
 */

/** 基础教程的版本号：以后教程内容大改时可以 +1，让老用户再看一遍新教程 */
export const BASIC_TUTORIAL_VERSION = 1

/** 「已看过教程」的本地标记（键名带版本号，便于以后强制重看新教程） */
const SEEN_KEY = 'sf.tutorial.basic.seen.v' + BASIC_TUTORIAL_VERSION

/** 从设置页点「重新观看使用教程」时写入的一次性请求标记 */
const FORCE_KEY = 'sf.tutorial.force'

/** 点「以后再说」后的暂缓标记：过几天再问，避免每次打开都打扰 */
const SNOOZE_KEY = 'sf.tutorial.basic.snoozeUntil'
const SNOOZE_DAYS = 3

/**
 * 需要用户在页面上完成的动作。
 * 看板页在这些动作发生时把信号传给教程浮层，浮层据此推进到下一步。
 */
export type TutorialActionId =
  | 'open-homework-editor'
  | 'close-homework-editor'
  | 'font-size'
  | 'date-change'

export interface TutorialStep {
  /** 唯一标识，便于埋点与调试 */
  id: string
  title: string
  body: string
  /** 要高亮的元素选择器；为空表示居中展示（没有具体指向） */
  selector?: string
  /** 命中 selector 后向上找最近的这个选择器，把整块区域一起高亮 */
  highlightClosest?: string
  /** 目标展开后会出现的浮层选择器（例如日历弹出后改指日历本身） */
  openSelector?: string
  /** selector 找不到时的备用目标（例如编辑窗口被关掉后指回科目卡片） */
  fallbackSelector?: string
  /** 步骤图标（mdi） */
  icon: string
  /** 需要用户完成的动作；有值时这一步不显示「下一步」，由真实操作推进 */
  action?: TutorialActionId
  /** 行动提示：告诉用户现在该做什么，显示在卡片按钮位置 */
  actionHint?: string
  /** 卡片摆放方式：above = 贴着目标上方（默认），top = 屏幕顶部居中（目标下方会弹出面板时用） */
  cardPlacement?: 'above' | 'top'
  /** 这一步的目标在对话框里，遮罩调淡一些，别把编辑窗口压得看不清 */
  softMask?: boolean
}

/**
 * 基础教程步骤：欢迎 → 布置作业（点开卡片 + 保存）→ 调整字体 → 切换日期 → 结束。
 * 文案尽量口语化，一条只说一件事；有 action 的步骤必须真的做一次才会前进。
 */
export const BASIC_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    icon: 'mdi-gesture-tap',
    title: '欢迎使用星焰作业板',
    body: '这是一块每天给全班看作业的看板。这份引导不长，但需要你跟着点几下——布置作业、调整字号、切换日期，练一遍就会了。',
  },
  {
    id: 'homework',
    icon: 'mdi-book-open-page-variant',
    title: '第一步：点开一张科目卡片',
    body: '每张卡片是一个科目。点一下任意一张卡片，就能打开作业编辑窗口。',
    selector: '.sf-subject-title',
    highlightClosest: '.grid-item-inner',
    action: 'open-homework-editor',
    actionHint: '请点一下高亮的这张科目卡片',
  },
  {
    id: 'homework-save',
    icon: 'mdi-content-save',
    title: '第二步：写下作业并保存',
    body: '在输入框里写今天的作业内容（换行就是分条），写完点「保存」。保存后同班的大屏会自动同步显示。',
    selector: '[data-tutorial-anchor="hw-save"]',
    // 用户中途把编辑窗口关掉时，指回科目卡片，点一下就能重新打开
    fallbackSelector: '.sf-subject-title',
    highlightClosest: '.grid-item-inner',
    action: 'close-homework-editor',
    actionHint: '写好内容后点「保存」',
    softMask: true,
  },
  {
    id: 'font-size',
    icon: 'mdi-format-font-size-increase',
    title: '第三步：调整字体大小',
    body: '屏幕下方的工具条上，A+ 放大字号、A− 缩小字号，后排同学也能看清。字号会记在这台设备上，下次打开还是这个大小。',
    selector: '[title="放大字体"]',
    action: 'font-size',
    actionHint: '请点一下高亮的 A+ 按钮',
  },
  {
    id: 'change-date',
    icon: 'mdi-calendar',
    title: '第四步：切换日期',
    body: '点日历按钮可以看任意一天的作业，两边的箭头是「昨天」和「明天」。翻到别的日期时，还会出现「复制到今天」按钮。',
    selector: '[title="选择日期"]',
    // 点开后日历会盖在工具条上方，改指日历本身，用户才好点日期
    openSelector: '.date-picker-card',
    action: 'date-change',
    actionHint: '点开日历，随便选一天试试',
    cardPlacement: 'top',
  },
  {
    id: 'done',
    icon: 'mdi-check-circle-outline',
    title: '基础操作都学会啦',
    body: '布置作业、调整字号、切换日期，你都已经亲手练过一遍。教程结束后会自动把日期切回今天，随时可以在「设置 → 首页」里重新观看。',
  },
]

/** 是否已经看过（或主动跳过）基础教程，或者刚点过「以后再说」还在暂缓期内 */
export function isBasicTutorialSeen(): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY) === '1') return true
    const raw = Number(localStorage.getItem(SNOOZE_KEY))
    return Number.isFinite(raw) && raw > Date.now()
  } catch {
    // 隐私模式等拿不到 localStorage 时按「已看过」处理，避免每次都弹
    return true
  }
}

/** 记下已看过基础教程 */
export function markBasicTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 写入失败不影响使用 */
  }
}

/** 点「以后再说」：暂缓几天再问 */
export function snoozeBasicTutorial(days = SNOOZE_DAYS): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000))
  } catch {
    /* 写入失败时按未暂缓处理 */
  }
}

/** 设置页请求「下次进入作业板直接开始教程」（不再询问） */
export function requestBasicTutorial(): void {
  try {
    localStorage.setItem(FORCE_KEY, '1')
  } catch {
    /* 写入失败时退化为「首次进入自动询问」的默认行为 */
  }
}

/** 取走并清掉一次性请求标记 */
export function consumeTutorialRequest(): boolean {
  try {
    if (localStorage.getItem(FORCE_KEY) !== '1') return false
    localStorage.removeItem(FORCE_KEY)
    return true
  } catch {
    return false
  }
}
