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
  // ---------- 进阶教程（考试看板 / 随机点名 / 发送通知） ----------
  | 'open-exam-picker'
  | 'toggle-exam-card'
  | 'open-random-picker'
  | 'random-picked'
  | 'open-notice-dialog'
  | 'notice-filled'
  | 'notice-sent'

/**
 * 一个候选高亮目标。
 * 同一件事在不同设置/屏幕下的入口不同（有作业的科目卡、空科目按钮、空科目卡片、手机端按钮），
 * 按顺序尝试，命中第一个就用它。
 */
export interface TutorialTarget {
  selector: string
  /** 命中后向上找最近的这个选择器，把整块区域一起高亮 */
  closest?: string
}

export interface TutorialStep {
  /** 唯一标识，便于埋点与调试 */
  id: string
  title: string
  body: string
  /** 候选高亮目标，按顺序取第一个存在的 */
  targets?: TutorialTarget[]
  /** 要高亮的元素选择器；为空表示居中展示（没有具体指向） */
  selector?: string
  /** 命中 selector 后向上找最近的这个选择器，把整块区域一起高亮 */
  highlightClosest?: string
  /** 目标展开后会出现的浮层选择器（例如日历弹出后改指日历本身） */
  openSelector?: string
  /** selector 找不到时的备用目标（例如编辑窗口被关掉后指回科目卡片） */
  fallbackSelector?: string
  /** 必须让人看见的区域（如编辑窗口的「保存」按钮）：小屏幕上卡片会主动避开它，避免挡住操作 */
  avoidSelector?: string
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
    title: '第一步：点开一个科目',
    body: '卡片和按钮都是一个科目，点一下任意一个就能打开作业编辑窗口。已经布置过作业的科目显示成带内容的卡片；当天还没有作业的科目，按「设置」里的显示方式排成按钮或空卡片，两种都能点。',
    // 同一个入口在不同设置下形态不同：有作业的卡片 / 空科目按钮 / 空科目卡片 / 手机端按钮
    targets: [
      { selector: '.grid-item-inner .sf-subject-title', closest: '.grid-item-inner' },
      { selector: '.empty-buttons .empty-btn' },
      { selector: '.empty-subjects-grid .empty-subject-card' },
      { selector: '.empty-subjects .v-chip' },
    ],
    action: 'open-homework-editor',
    actionHint: '请点一下高亮的科目卡片或按钮',
  },
  {
    id: 'homework-save',
    icon: 'mdi-content-save',
    title: '第二步：写下作业并保存',
    body: '在输入框里写今天的作业内容，换行就是分条。输入框下面那排按钮是快捷入口：「粘贴」「粘贴并完成」直接把复制好的作业贴进来；再往下的「书/复习/预习」等按钮点一下就能插入对应的常用短语，写完点「保存」，同班的大屏会自动同步。',
    selector: '[data-tutorial-anchor="hw-area"]',
    // 用户中途把编辑窗口关掉时，指回科目卡片，点一下就能重新打开
    fallbackSelector: '.grid-item-inner .sf-subject-title',
    // 小屏幕下卡片别压住「保存」，否则这一步没法完成
    avoidSelector: '[data-tutorial-anchor="hw-save"]',
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

// ---------- 进阶教程（考试看板 / 随机点名 / 发送通知） ----------

/** 进阶教程的三种主题，每种是一套独立的小教程 */
export type AdvancedTutorialId = 'exam' | 'random' | 'notice'

export interface AdvancedTutorialInfo {
  id: AdvancedTutorialId
  icon: string
  title: string
  /** 选择弹窗里的一句话说明 */
  description: string
  /** 只有教师端能用（发送通知） */
  teacherOnly?: boolean
}

export const ADVANCED_TUTORIALS: AdvancedTutorialInfo[] = [
  {
    id: 'exam',
    icon: 'mdi-calendar-check',
    title: '考试看板',
    description: '把考试安排放到看板上。教程会临时生成一场模拟考试，练完自动删除。',
  },
  {
    id: 'random',
    icon: 'mdi-account-question',
    title: '随机点名',
    description: '课堂上随机抽人回答问题。没有学生名单时会自动建一份演示名单，练完自动删除。',
  },
  {
    id: 'notice',
    icon: 'mdi-bullhorn-outline',
    title: '发送通知',
    description: '把临时通知推送到所有大屏。教师端专属功能。',
    teacherOnly: true,
  },
]

/** 进阶教程步骤：每套都是「介绍 → 找到入口 → 真的点一下 → 看结果 → 结束」 */
export const ADVANCED_TUTORIAL_STEPS: Record<AdvancedTutorialId, TutorialStep[]> = {
  exam: [
    {
      id: 'exam-intro',
      icon: 'mdi-calendar-check',
      title: '进阶教程 · 考试看板',
      body: '考试看板会把最近几场考试排在看板上，学生抬头就能看到「哪天考什么」。为了让后面的步骤有东西可点，我已经临时生成了一场模拟考试，教程结束时会自动删掉，不会留在你的数据里。',
    },
    {
      id: 'exam-open',
      icon: 'mdi-calendar-check',
      title: '第一步：打开考试看板',
      body: '底部这排功能按钮里，「考试看板」负责挑选哪些考试显示在看板上。点一下它。',
      selector: '[data-tutorial-anchor="exam-btn"]',
      fallbackSelector: '.act-exam',
      action: 'open-exam-picker',
      actionHint: '请点一下高亮的「考试看板」按钮',
    },
    {
      id: 'exam-toggle',
      icon: 'mdi-check-circle-outline',
      title: '第二步：勾选一场考试',
      body: '列表里带「教程演示」字样的那一场就是临时生成的模拟考试。点一下它，右侧会出现勾选标记——勾上的考试才会显示在看板上，再点一下就能取消。',
      selector: '[data-tutorial-anchor="exam-demo-item"]',
      fallbackSelector: '[data-tutorial-anchor="exam-item"]',
      action: 'toggle-exam-card',
      actionHint: '请点一下带「教程演示」的那场考试',
      softMask: true,
    },
    {
      id: 'exam-card',
      icon: 'mdi-calendar-check',
      title: '第三步：看板上的考试卡',
      body: '关掉弹窗回到看板，考试卡已经出现在左侧（宽屏布局）或科目网格里。卡片上按时间列出各科考试，点卡片还能看详情。真实使用时，考试内容在「考试看板」页面里新建。',
      selector: '[data-tutorial-anchor="exam-card"]',
      fallbackSelector: '.concise-exam-card',
    },
    {
      id: 'exam-done',
      icon: 'mdi-check-circle-outline',
      title: '考试看板学会啦',
      body: '选考试、看考试卡都会了。教程结束后那场模拟考试会自动删除，看板恢复原样。',
    },
  ],
  random: [
    {
      id: 'random-intro',
      icon: 'mdi-account-question',
      title: '进阶教程 · 随机点名',
      body: '课堂上想随机抽人回答问题时，用这个功能最省事：选人数、点一下，大屏就会滚出名字。如果你还没有录入学生名单，我会临时建一份演示名单，教程结束时自动删除。',
    },
    {
      id: 'random-open',
      icon: 'mdi-account-question',
      title: '第一步：打开随机点名',
      body: '底部功能按钮里的「随机点名」就是入口，点一下它。',
      selector: '[data-tutorial-anchor="random-btn"]',
      fallbackSelector: '.act-random',
      action: 'open-random-picker',
      actionHint: '请点一下高亮的「随机点名」按钮',
    },
    {
      id: 'random-spin',
      icon: 'mdi-dice-multiple',
      title: '第二步：开始抽取',
      body: '弹窗里可以先用 −/+ 调人数（现在默认抽 1 人）。下面的「姓名模式 / 学号模式」切换抽的是名字还是学号；再往下几个开关可以排除请假、迟到或不参与的学生。准备好了就点「开始抽取」。',
      selector: '[data-tutorial-anchor="random-spin"]',
      action: 'random-picked',
      actionHint: '请点一下「开始抽取」',
      softMask: true,
    },
    {
      id: 'random-result',
      icon: 'mdi-check-circle-outline',
      title: '第三步：抽中的人',
      body: '大屏会滚动几秒再停下来，抽中的人显示在中间。「再抽一次」直接换一批人，「返回设置」回到人数选择。抽过的人在同一轮里不会重复出现。',
      selector: '[data-tutorial-anchor="random-result"]',
      softMask: true,
    },
    {
      id: 'random-done',
      icon: 'mdi-check-circle-outline',
      title: '随机点名学会啦',
      body: '抽人、再抽一次都会了。教程结束后，演示名单会自动删除，不会出现在你的花名册里。',
    },
  ],
  notice: [
    {
      id: 'notice-intro',
      icon: 'mdi-bullhorn-outline',
      title: '进阶教程 · 发送通知',
      body: '临时通知（临时调课、提前放学、带什么材料）可以从这里直接推到所有大屏上，比挨个班级喊话快得多。这个功能只有教师端能用。',
    },
    {
      id: 'notice-open',
      icon: 'mdi-bullhorn-outline',
      title: '第一步：打开发送通知',
      body: '看板右上角的「发送通知」按钮就是入口。屏幕窄的时候它会收进右侧的菜单里。点一下它。',
      selector: '[data-tutorial-anchor="notice-entry"]',
      fallbackSelector: '.act-notify',
      action: 'open-notice-dialog',
      actionHint: '请点一下高亮的「发送通知」',
    },
    {
      id: 'notice-content',
      icon: 'mdi-pencil',
      title: '第二步：写通知内容',
      body: '在「内容」框里随便写一句试试，比如「明天带跳绳」。标题可以留空；下面的「弹窗提醒」和「置顶」默认都开着，这样大屏会立刻弹出这条通知。',
      selector: '[data-tutorial-anchor="notice-content"]',
      action: 'notice-filled',
      actionHint: '请在内容框里输入任意文字',
      softMask: true,
    },
    {
      id: 'notice-send',
      icon: 'mdi-arrow-right',
      title: '第三步：发送',
      body: '内容填好后「发送」按钮就可以点了。发出去的通知会出现在所有绑定班级的大屏上，右下角「通知」抽屉里也能回看、编辑或删除。',
      selector: '[data-tutorial-anchor="notice-send"]',
      action: 'notice-sent',
      actionHint: '请点一下「发送」',
      softMask: true,
    },
    {
      id: 'notice-done',
      icon: 'mdi-check-circle-outline',
      title: '发送通知学会啦',
      body: '这条测试通知会正常发出去，如果不想留在看板上，可以在通知抽屉里把它删掉。',
    },
  ],
}

/** 基础教程结束后是否已经问过「要不要看进阶教程」 */
const ADVANCED_PROMPT_KEY = 'sf.tutorial.advanced.prompted'

/** 从设置页点「进阶教程」时写入的一次性请求标记：回到看板直接弹出选择弹窗 */
const ADVANCED_FORCE_KEY = 'sf.tutorial.advanced.force'

/** 基础教程结束后是否需要再问一次进阶教程 */
export function shouldAskAdvancedTutorial(): boolean {
  try {
    return localStorage.getItem(ADVANCED_PROMPT_KEY) !== '1'
  } catch {
    return false
  }
}

/** 记下已经问过进阶教程（无论是否开始） */
export function markAdvancedTutorialAsked(): void {
  try {
    localStorage.setItem(ADVANCED_PROMPT_KEY, '1')
  } catch {
    /* 写入失败不影响使用 */
  }
}

/** 设置页请求「回到看板时直接打开进阶教程选择弹窗」 */
export function requestAdvancedTutorialMenu(): void {
  try {
    localStorage.setItem(ADVANCED_FORCE_KEY, '1')
  } catch {
    /* 写入失败时退化为不自动弹出 */
  }
}

/** 取走并清掉进阶教程选择弹窗的一次性请求标记 */
export function consumeAdvancedTutorialMenu(): boolean {
  try {
    if (localStorage.getItem(ADVANCED_FORCE_KEY) !== '1') return false
    localStorage.removeItem(ADVANCED_FORCE_KEY)
    return true
  } catch {
    return false
  }
}

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
