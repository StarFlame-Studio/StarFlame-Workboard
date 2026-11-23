/**
 * 版本更新日志：网页端 / 桌面端「版本号徽标」弹窗与「已更新到 vX.Y.Z」提示的唯一数据源。
 *
 * 发布新版本时：
 *   1. packages/shared/src/constants.ts 的 APP_VERSION / APP_VERSION_CODE
 *   2. apps/desktop/package.json 的 version
 *   3. 本文件顶部追加一条新记录（保持数组从新到旧）
 *
 * 展示格式固定为两个板块，每个板块下再分「新增 / 优化 / 修复」三类：
 *   作业看板（网页端 + 桌面端客户端）
 *   后台管理面板
 * 某个板块或某个分类没有条目时不会出现对应的标题。
 *
 * 条目默认按「重要程度」自动排序（重要的排前面）：可以写成纯字符串，由
 * autoImportance() 按关键词与信息量估算权重；也可以写成 { text, weight } 显式指定，
 * weight 越大越靠前（同权重时保持书写顺序）。
 */
export type ChangelogCategory = 'added' | 'improved' | 'fixed'
export type ChangelogAreaKey = 'board' | 'admin'

/** 一条更新内容：纯文本，或带显式重要程度权重（越大越靠前）的对象 */
export type ChangelogItem = string | { text: string; weight?: number }

/** 单个板块下的条目，按 新增 / 优化 / 修复 归类 */
export interface ChangelogArea {
  added?: ChangelogItem[]
  improved?: ChangelogItem[]
  fixed?: ChangelogItem[]
}

export interface ChangelogEntry {
  /** 版本号，例如 '1.0.1' */
  version: string
  /** 发布日期（YYYY-MM-DD） */
  date: string
  /** 一句话概述，展示在当前版本信息里 */
  summary: string
  /** 作业看板（网页端与桌面端客户端） */
  board?: ChangelogArea
  /** 后台管理面板 */
  admin?: ChangelogArea
  /** 是否已提供桌面端安装包（false 时禁止回退到该版本） */
  desktop?: boolean
}

/** 板块标题与展示顺序 */
const AREA_TITLE: Record<ChangelogAreaKey, string> = {
  board: '作业看板',
  admin: '后台管理面板',
}
const AREA_ORDER: ChangelogAreaKey[] = ['board', 'admin']

/** 分类标题与展示顺序 */
const CATEGORY_TITLE: Record<ChangelogCategory, string> = {
  added: '新增',
  improved: '优化',
  fixed: '修复',
}
const CATEGORY_ORDER: ChangelogCategory[] = ['added', 'improved', 'fixed']

/**
 * 自动估算重要程度用的关键词规则：命中即累加权重，可命中多条。
 * 正向：影响面大、用户能直接感知的改动；负向：文案、措辞之类的细枝末节。
 */
const IMPORTANCE_HINTS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /(新增|全新|首次支持|重构|重写|重做|大改版)/, weight: 40 },
  { pattern: /(支持|可以|能够|自动|一键|默认)/, weight: 18 },
  { pattern: /(大幅|明显|显著|更快|更省|更稳|不再|彻底|修复|解决)/, weight: 14 },
  { pattern: /(优化|改进|提升|精简|简化|加速|减少)/, weight: 8 },
  { pattern: /(移除|删除|下线|停止)/, weight: 4 },
  { pattern: /(文案|文字|措辞|注释|命名|提示语|微调)/, weight: -30 },
]

/** 估算一条更新内容的重要程度（数值越大越重要） */
export function autoImportance(text: string): number {
  let score = 0
  for (const hint of IMPORTANCE_HINTS) {
    if (hint.pattern.test(text)) score += hint.weight
  }
  // 信息量越大的条目通常也越重要（长文本封顶 8 分，避免长文案压倒真正的重点）
  score += Math.min(text.length / 40, 8)
  return score
}

/** 把字符串 / 带权重的对象统一成 { text, weight } */
function normalizeItem(item: ChangelogItem): { text: string; weight: number } {
  if (typeof item === 'string') return { text: item, weight: autoImportance(item) }
  const text = typeof item?.text === 'string' ? item.text : ''
  return { text, weight: typeof item?.weight === 'number' ? item.weight : autoImportance(text) }
}

/** 渲染用的一个分类（已过滤空分类） */
export interface ChangelogGroupView {
  key: ChangelogCategory
  title: string
  items: string[]
}

/** 渲染用的一个板块（已过滤空板块） */
export interface ChangelogAreaView {
  key: ChangelogAreaKey
  title: string
  groups: ChangelogGroupView[]
}

/**
 * 尚未发布的版本条目：真正打包发布时，把条目从这里移到 CHANGELOG 顶部。
 * 目的：网页端不要在桌面端安装包上传完成前就提前展示新版本号与更新内容。
 * 下次发版时在这里加新条目，打包上传安装包后再整体移到 CHANGELOG 顶部。
 */
export const PENDING_CHANGELOG: ChangelogEntry[] = []

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.0',
    date: '2026-11-24',
    summary: '新增进阶教程、卡片主题默认改为毛玻璃，背景图支持更大的图片，液态玻璃更省性能',
    desktop: true,
    board: {
      added: [
        '新增「毛玻璃」「液态玻璃」两种卡片主题（设置 → 外观）：毛玻璃是半透明磨砂质感，液态玻璃会在卡片边缘把背景折射出弯曲的光边；其他浏览器不支持贴边折射时会自动退回毛玻璃质感',
        '新增引导式使用教程：首次进入作业板时可选择「开始引导」，跟着高亮提示亲手完成点开科目（卡片或按钮，取决于设置里的显示方式）、写作业并保存（输入框和下面的粘贴、常用短语按钮会一起框出来）、放大字号、切换日期，做完一步自动进入下一步；设置页「使用教程」里可以随时重看',
        '新增进阶教程（考试看板 / 随机点名 / 发送通知）：基础教程结束后会询问是否继续，也可以在设置页单独打开；每段都是独立的一小段引导，考试看板会临时生成一场模拟考试、随机点名在没有花名册时会临时建一份演示名单，教程结束自动清理，不留痕迹',
        '新增「毛玻璃」为默认卡片主题：新装或未改过主题的设备打开看板就是半透明磨砂质感，仍可在「设置 → 主题」里切回默认或液态玻璃',
        '首页新增使用教程卡片：作业板下方直接给出「基础教程」「进阶教程」入口，还能一键查看「教师端登录」；卡片可以关闭，关闭后可在设置页重新打开',
        '首页新增「卡片主题」介绍卡片：功能按钮下方就能看到默认、毛玻璃、液态玻璃三种材质的预览和当前使用中的一种，点任意材质或「去设置里换主题」直接跳到设置页的主题分页；首页卡片顺序固定为卡片主题 → 使用教程 → 安装应用与授权（网页端）',
        '新增教师端登录引导：在一体机上点「教师端登录」，自动显示本班的班级码和教师授权码（没有教师授权码会自动创建一条），并给出可直接打开的预配链接和图文说明，老师用手机或办公室电脑就能登录布置作业',
      ],
      improved: [
        '移除设置页的「开发者选项」：设置页只保留日常会用到的功能，界面更清爽',
        '首页不再显示「屏幕保护技术已启用」卡片，相关设置项一并移除，界面更简洁',
        '教程在小屏幕上更好用：提示卡片自动缩小并主动避开要点的按钮和「保存」，笔记本、平板、手机上都不会挡住操作',
        '液态玻璃明显更省性能：折射层的滤镜链从 8 个节点精简到 2 个，胶囊按钮改用普通毛玻璃，屏幕外的卡片不再提前渲染折射层，滚动时临时停用折射、停下立即恢复 —— 大屏看板滚动时不再一顿一顿',
        '卡片主题与液态玻璃参数改为本机设置：每台设备各自保留自己的外观，切换设备不会被别的设备覆盖，也不再随班级设置同步到云端',
        '上传背景图的上限从 3MB 提升到 5MB（超过 2MB 时会提示大图可能让大屏加载变慢，仍可继续上传）',
        '背景图也改为本机设置：壁纸、模糊与遮罩只在当前设备生效，不再同步到其他大屏；本地上传的大图改存到浏览器 IndexedDB，5MB 的壁纸刷新后也不会丢',
        '预配链接大幅缩短并固定自动登录：链接形如 /bind?c=班级码&k=授权码，不再携带冗长的设置快照，好记也好转发；旧链接仍然可用',
        '移除设置页的「作业导入导出」分类：作业导入导出仍可从首页「导入导出」按钮直接打开，设置页更精简',
        '设置页的「首页」与「关于」页尾新增「系统状态」入口：一键查看服务可用性、接口与更新服务的实时状态',
        '通知、考试安排、教程与「安装应用与授权」卡片也支持玻璃和液态玻璃：这四类卡片会跟随卡片主题换成半透明磨砂或液态玻璃质感，通知卡还保留普通 / 加急的底色区分',
        '液态玻璃再省一截性能：卡片边缘的折射滤镜改为全屏共用一份（尺寸和参数相同的卡片共享同一个滤镜定义，不再每张卡片各建一份），滚动与缩放时的尺寸、可见性观察也合并成共享观察器 —— 外观与之前完全一致，一屏卡片很多的看板占用更低',
      ],
    },
  },
  {
    version: '1.1.6',
    date: '2026-11-20',
    summary: '预配链接支持打开即自动登录并直达作业看板；新增课铃偏移时间调整，放学倒计时与铃声对齐',
    desktop: true,
    board: {
      added: [
        '打开预配链接后自动完成设备登录并进入作业看板，无需再手动输入班级码与授权码',
        '预配链接未填授权码时自动以游客身份只读进入（需班级已开启游客登录）',
        '预配链接可携带设备名称，生成的链接默认开启自动登录',
        '预配链接里的班级设置快照会在登录成功且设备有写权限时自动写回班级设置',
        '设置页首页「开源说明」与「关于」页新增 GitHub / Gitee 仓库地址与历史版本安装包入口',
        '新增课铃偏移时间调整功能，可让放学倒计时与铃声对齐',
        '发送通知时新增「弹窗提醒」开关：关闭后该通知不再在大屏强制弹窗，只保留在通知列表与首页通知区；弹窗提醒与置顶至少需要开启一项',
      ],
      improved: [
        '自动登录失败时退回手动登录并显示具体原因',
        '随机点名的学号模式在未录入学生名单时也可以使用：没有名单时自动切换到学号模式并按设置的学号范围抽取',
      ],
      fixed: [
        '修复设置页大量开关不生效的问题：显示、编辑、随机点名、背景、一言、时间卡片等设置现在会真正作用于作业看板',
        '修复部分情况下无法切换作业日期的问题：离线/本地模式下日期切换现在会真正生效，并处理了连点切换时的请求乱序',
        '修复桌面端生成的预配链接域名错误的问题：链接现在指向真正的网页地址，可以直接分享给其它设备打开',
      ],
    },
    admin: {
      added: [
        '后台新增通知管理：可跨班级查看全部通知，支持一次向多个班级群发同一条通知，也可在批量页为每个班级分别编写内容',
        '后台设备管理新增「卸载」按钮：可远程静默卸载在线设备上的桌面版作业板',
      ],
      improved: [
        '网页端与管理后台的页面地址去掉 .html 后缀，旧链接会自动跳转到新地址',
        '通知管理页与班级通知页新增「弹窗提醒」开关与列表标识，群发通知可统一设置，批量发送可为每条通知单独设置',
      ],
      fixed: [
        '修复后台设备在线状态显示不准的问题：设备现在会在全站维持心跳，休眠唤醒、切换网络或服务端重启后不会再被误判为离线',
      ],
    },
  },
  {
    version: '1.1.5',
    date: '2026-11-19',
    summary: '修复网页端与桌面端的图标全部不显示的问题',
    desktop: true,
    board: {
      improved: ['图标字体重新按实际用到的图标生成，安装包体积不变、图标显示恢复正常'],
      fixed: ['修复 1.1.4 中网页端、后台管理面板与桌面端的图标全部显示为空白的问题'],
    },
  },
  {
    version: '1.1.4',
    date: '2026-11-19',
    summary: '安装器可选装到 C 盘或其它磁盘，更新时弹窗提示「正在下载新版本」，作息时间支持设置课程时间段并可在上课时段暂停静默更新',
    desktop: true,
    board: {
      added: [
        '安装器新增「安装位置」页：默认装在 X:\\StarFlame\\StarFlameWorkboard，可直接选择 C 盘或其它本地磁盘，并显示目标目录与各盘剩余空间',
        '启动后自动检查更新，发现新版本立即在应用内弹窗告知，并显示下载进度',
        '作息时间设置新增「每天课程时间段」：按节次填写起止时间，可套用常用课表、复制前一天、增删节次',
        '新增「上课时段暂停静默更新」（默认开启）：上课时间内不下载、不安装，下课后 5 分钟自动继续；未配置节次时按上学 → 走读放学整段计算',
        '设置页「首页」与「服务器」新增「重置设备绑定信息」：一键退出绑定并回到欢迎页重新输入班级码，换教室/换授权码不用再清浏览器数据',
        '登录页新增「设备名称（可选）」：不填时自动用授权码的设备类型命名（一体机 / 老师 / 学生 / 家长，未填授权码为「游客」），填过的名称下次自动带出',
      ],
      improved: [
        '安装器提示：若一体机开启了「冰点还原」，推荐装在 C 盘以外的磁盘，重启后不会丢失',
        '安装过程不需要管理员权限，后续静默更新也不会弹权限框；换盘重装时已绑定的班级与本地缓存保留',
        '下载完成 → 自动重启安装的全过程实时显示状态，不需要任何点击',
        '更新弹窗可点「后台继续」收起，下载与安装不中断；真正重启前会再次提示',
        '左下角版本号只在首页显示，移动端版本号改为贴在左下角，不再压住内容',
      ],
      fixed: ['修复更新提示等弹窗打开时四周出现一圈橙色焦点描边的问题'],
    },
    admin: {
      added: ['后台设备管理支持查看在线状态、在线/离线筛选，并可勾选多台设备批量吊销（在线设备会立即断开）'],
    },
  },
  {
    version: '1.1.3',
    date: '2026-11-18',
    summary: '静默更新后自动重启会弹出「已更新到 vX.Y.Z」并列出该版本更新内容',
    desktop: true,
    board: {
      added: ['重启后自动弹出「已更新到 vX.Y.Z」，列出本次更新内容，点「知道了」关闭'],
      improved: [
        '自动更新全程静默：检测、下载、安装、重启都不需要点击（沿用 1.1.1 起的机制）',
        '提示只在真正发生更新的那次启动出现，日常启动不再打扰；网页端不会出现该提示',
      ],
    },
  },
  {
    version: '1.1.2',
    date: '2026-11-18',
    summary: '本地模式免登录可用、欢迎页窄屏可滚动、设置页底部不再被裁，安装器换成「星焰」暗色视觉',
    desktop: true,
    board: {
      added: [
        '本地模式（免登录）：从未登录、本机也没有缓存时，点欢迎页「本地模式」即可直接用，空白班级会自动建好，之后登录会自动接上云端',
      ],
      improved: [
        '桌面安装器与安装引导换成全新「星焰」暗色视觉：暗底浅字、品牌橙标题与强调线、整窗式欢迎 / 完成页',
        '安装器与安装引导声明 PerMonitorV2 DPI 感知，2K / 4K 与 125%–300% 缩放下不再被系统位图拉伸糊掉',
        '安装选项页与下载页统一使用微软雅黑，并按已安装状态回显开机自启 / 开始菜单 / 任务栏选项',
      ],
      fixed: [
        '本地模式不再被 401 踢回欢迎页，离线读写都留在本机',
        '修复网页端欢迎页在窄屏（手机、小窗口）上无法上下滚动的问题',
        '修复桌面端设置页最底部显示不全：页面改为弹性布局，最后一张卡片与左下角版本徽标不再被裁切',
      ],
    },
  },
  {
    version: '1.1.1',
    date: '2026-11-18',
    summary: '桌面端全静默自动更新：自动检查、自动下载、自动安装并自动重启，全程无需点击',
    desktop: true,
    board: {
      added: ['新增更新日志文件（用户目录 update.log），静默更新出问题时可直接排查'],
      improved: [
        '桌面端自动更新升级为全静默：检测到新版本后自动下载、自动安装、自动重启，中间不需要任何点击',
        '更新检查间隔从 10 分钟缩短到 5 分钟，电脑唤醒后会立即补查一次',
        '下载进度卡住会自动取消并重新下载，检查失败 1 分钟后自动重试，安装失败时退出应用也会补装',
        '静默更新沿用之前的安装选项，不会把用户手动关掉的「开机自启」重新打开',
      ],
    },
  },
  {
    version: '1.1.0',
    date: '2026-11-18',
    summary: '游客只读登录上线，登录页移除设备名称，网页端欢迎页新增桌面端下载入口',
    desktop: false,
    board: {
      added: [
        '新增游客登录：只填班级码、不填授权码也能进入看板，只能浏览不能修改',
        '网页端欢迎页新增「下载 Windows 桌面端」卡片，未安装客户端时引导到下载页',
      ],
      improved: [
        '登录页移除「设备名称」填写，设备身份按授权码类型自动识别，未填授权码即为游客',
        '设备列表与设置页展示身份标签，游客设备带「游客只读」标识',
      ],
    },
    admin: {
      added: ['后台「设备授权码」页新增「允许游客登录」开关（默认开启），关闭后必须输入授权码'],
      improved: ['新建班级默认生成的一体机授权码，读写权限与身份说明更清晰'],
    },
  },
  {
    version: '1.0.1',
    date: '2026-11-17',
    summary: '作息时间支持走读 / 住宿双阶段，首屏与离线判定的稳定性修复',
    desktop: false,
    board: {
      added: [
        '作息时间支持「走读放学」与「住宿放学」两阶段，时间卡片分段展示各自倒计时',
        '设置页作息卡每天可分别填写上学、走读放学、住宿放学三个时间，留空即回到单阶段',
        '左下角常驻版本号：点击查看当前版本、更新日志与历史版本，桌面端还可检查更新与回退版本',
        '桌面端：首次启动进入欢迎页，关闭窗口收进托盘，自动更新状态实时可见',
        '桌面端：安装器可自定义安装位置，新增开机自启动与托盘菜单开关',
      ],
      fixed: [
        '修复部分设备首屏骨架屏长时间卡住：初始化超时放宽到 12 秒，失败后自动重试 3 次',
        '修复网络抖动被误判为离线：探测超时放宽到 8 秒，60 秒宽限期内不切换离线缓存',
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-11-16',
    summary: '首个正式版本，网页端与 Windows 桌面端同步发布',
    desktop: false,
    board: {
      added: [
        '多页面架构：看板、欢迎、绑定、设置、列表、考试、模板相互独立，地址可直接分享',
        '班级码 + 授权码的设备登录体系，支持只读 / 读写权限、授权码有效期与停用',
        '本地缓存离线模式：断网自动切到本机快照，联网后按队列补传改动',
        'Socket.IO 实时同步、通知置顶与已读回执、考试看板',
        '亮 / 暗主题、一言多源、阿里云 NTP 时间校准、作业导入导出（UAF 格式）',
        'Windows 桌面端三通道安装包：Win7 / 8 通用版、Win10+ 32 位版、Win10+ 64 位版',
      ],
    },
  },
]

/** 把一条记录展开成渲染用的板块列表（自动过滤空板块与空分类） */
export function changelogAreas(entry: ChangelogEntry | null | undefined): ChangelogAreaView[] {
  if (!entry) return []
  const view: ChangelogAreaView[] = []
  for (const areaKey of AREA_ORDER) {
    const area = entry[areaKey]
    if (!area) continue
    const groups: ChangelogGroupView[] = []
    for (const category of CATEGORY_ORDER) {
      // 先按重要程度降序，同权重保持书写顺序（index 兜底，保证渲染稳定）
      const items = (area[category] ?? [])
        .map((item, index) => ({ ...normalizeItem(item), index }))
        .filter((row) => Boolean(row.text && row.text.trim()))
        .sort((a, b) => b.weight - a.weight || a.index - b.index)
        .map((row) => row.text)
      if (items.length === 0) continue
      groups.push({ key: category, title: CATEGORY_TITLE[category], items })
    }
    if (groups.length === 0) continue
    view.push({ key: areaKey, title: AREA_TITLE[areaKey], groups })
  }
  return view
}

/** 一条记录的条目总数（用于空状态判断） */
export function changelogItemCount(entry: ChangelogEntry | null | undefined): number {
  return changelogAreas(entry).reduce(
    (sum, area) => sum + area.groups.reduce((count, group) => count + group.items.length, 0),
    0,
  )
}

/** 按版本号查更新日志（找不到返回 undefined） */
export function findChangelog(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((entry) => entry.version === version)
}

/** 语义化版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0 */
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}