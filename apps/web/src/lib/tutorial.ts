/**
 * 引导式教程（基础版）的数据与本地记忆。
 *
 * 首次进入作业板时会询问是否查看教程；看完或跳过都会记下，之后不再自动弹出。
 * 教程只依赖看板页真实存在的 DOM 元素（科目卡片、底部工具栏按钮），
 * 因此本地模式与在线模式走的是同一套逻辑，不需要区分数据源。
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

export interface TutorialStep {
  /** 唯一标识，便于埋点与调试 */
  id: string
  title: string
  body: string
  /** 要高亮的元素选择器；为空表示居中展示（没有具体指向） */
  selector?: string
  /** 命中 selector 后向上找最近的这个选择器，把整块区域一起高亮 */
  highlightClosest?: string
  /** 步骤图标（mdi） */
  icon: string
}

/**
 * 基础教程步骤：欢迎 → 布置作业 → 调整字体 → 切换日期 → 结束。
 * 文案尽量口语化，一条只说一件事。
 */
export const BASIC_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    icon: 'mdi-gesture-tap',
    title: '欢迎使用星焰作业板',
    body: '这是一块每天给全班看作业的看板。花一分钟看完这份引导，你就会布置作业、调整字号和切换日期了。',
  },
  {
    id: 'homework',
    icon: 'mdi-book-open-page-variant',
    title: '怎么布置作业',
    body: '点击任意一张科目卡片，就能打开作业编辑窗口；写好内容点「保存」即可，同班的大屏会自动同步显示。还没作业的科目，点页面下方带「+」的科目名就能添加。',
    selector: '.sf-subject-title',
    highlightClosest: '.grid-item-inner',
  },
  {
    id: 'font-size',
    icon: 'mdi-format-font-size-increase',
    title: '怎么调整字体大小',
    body: '点底部工具条上的 A+ 放大字号、A− 缩小字号，后排同学也能看清。字号会记在这台设备上，下次打开还是这个大小。',
    selector: '[title="放大字体"]',
  },
  {
    id: 'change-date',
    icon: 'mdi-calendar',
    title: '怎么切换日期',
    body: '点中间的日历按钮可以看任意一天的作业；两边的箭头是「昨天」和「明天」。翻到别的日期时，还能一键把当天的作业复制到今天。',
    selector: '[title="选择日期"]',
  },
  {
    id: 'done',
    icon: 'mdi-check-circle-outline',
    title: '基础操作都学会啦',
    body: '教程到这里结束，随时可以在「设置 → 首页」里重新观看。现在开始布置今天的作业吧。',
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
