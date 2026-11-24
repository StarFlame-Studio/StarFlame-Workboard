/**
 * 本机设置（settingDefs 里标了 `local: true` 的项）。
 *
 * 卡片主题、液态玻璃参数和背景图属于「这台设备看起来怎样」，不是班级数据：
 * 不同设备的屏幕、亮度、显卡都不同，把一套参数同步到所有设备反而会互相覆盖。
 * 所以这类设置只写浏览器本地，不进云端、也不进待同步队列。
 *
 * 存储分两层：
 * - 普通设置写 localStorage（同步读，首屏就能用）；
 * - `background.imageData` 是最大 10MB 图片的 data URL（约 13.6M 字符），
 *   远超 localStorage 约 5MB 的配额，必须写 IndexedDB，否则刷新就丢。
 *   IndexedDB 是异步的，由 bootstrap 在挂载后调用 hydrateLocalSettings() 补读。
 *
 * theme.mode（明亮/暗黑）是更早就本地化的设置，由 lib/theme.ts 用 `sf.themeMode` 单独管理，
 * 这里刻意跳过它，避免两份存储互相打架。
 *
 * 另外，手机 / 平板 / 老师电脑等「非一体机」设备上的所有设置项都只存本机
 * （只有一体机参与班级设置的云端同步，见 lib/settingsScope.ts），
 * 所以这里的读取范围不能再按 settingDefs 的 local 标记死过滤。
 */
import { ref } from 'vue'
import { SETTING_DEFS } from './settingDefs'
import { settingsCloudSyncEnabled } from './settingsScope'

const PREFIX = 'sf.setting.'
/** 由 theme.ts 单独管理的本机设置，不参与这里的读写 */
const EXCLUDED = new Set(['theme.mode'])
/** 体积可能撑爆 localStorage 的键：改存 IndexedDB */
const LARGE_KEYS = new Set(['background.imageData'])

const IDB_NAME = 'sf-local-settings'
const IDB_STORE = 'values'
const IDB_VERSION = 1

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function hasIdb(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIdb()) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(IDB_NAME, IDB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return dbPromise
}

function idbGet(key: string): Promise<unknown> {
  return openDb().then(
    (db) =>
      new Promise<unknown>((resolve) => {
        if (!db) {
          resolve(undefined)
          return
        }
        try {
          const tx = db.transaction(IDB_STORE, 'readonly')
          const req = tx.objectStore(IDB_STORE).get(key)
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) {
          resolve()
          return
        }
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite')
          tx.objectStore(IDB_STORE).put(value, key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
          tx.onabort = () => resolve()
        } catch {
          resolve()
        }
      }),
  )
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) {
          resolve()
          return
        }
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite')
          tx.objectStore(IDB_STORE).delete(key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch {
          resolve()
        }
      }),
  )
}

function readLocal(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!hasStorage()) return out
  try {
    // 直接扫 localStorage 里所有 sf.setting.* 的键：
    // 一体机上只会有 def.local 的项；非一体机设备上还可能有其它设置项（只在本机生效），
    // 不能按 settingDefs 的 local 标记过滤，否则刷新后这些改动会丢。
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index)
      if (!storageKey || !storageKey.startsWith(PREFIX)) continue
      const key = storageKey.slice(PREFIX.length)
      if (EXCLUDED.has(key)) continue
      // 大图存 IndexedDB，由 hydrateLocalSettings() 异步补读
      if (LARGE_KEYS.has(key)) continue
      const raw = localStorage.getItem(storageKey)
      if (raw === null) continue
      out[key] = JSON.parse(raw) as unknown
    }
  } catch {
    // 隐私模式或脏数据：忽略，退回设置项默认值
  }
  return out
}

/** 当前本机设置（响应式）：设置页写入、看板读取，切页面不丢 */
export const localSettings = ref<Record<string, unknown>>(readLocal())

/** 这个 key 是否是本机设置（由 settingDefs 的 local 标记决定） */
export function isLocalSettingKey(key: string): boolean {
  if (EXCLUDED.has(key)) return false
  // 非一体机设备：所有设置项都只存本机，不写云端（见 lib/settingsScope.ts）
  if (!settingsCloudSyncEnabled.value) return true
  return SETTING_DEFS.some((def) => def.local && def.key === key)
}

/** 写一项本机设置：同时更新响应式值和本地存储 */
export function writeLocalSetting(key: string, value: unknown): void {
  localSettings.value = { ...localSettings.value, [key]: value }
  if (LARGE_KEYS.has(key)) {
    // 大值走 IndexedDB；顺带清掉可能残留的 localStorage 版本，腾出配额
    void idbSet(key, value)
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      // 忽略
    }
    return
  }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // 存不下就算了，本次会话内仍然生效
  }
}

/**
 * 补读 IndexedDB 里的大值（背景图）。
 * localStorage 是同步的，IndexedDB 不是，所以首屏先渲染不含背景图的一帧，读到后由响应式补上。
 */
export async function hydrateLocalSettings(): Promise<void> {
  if (!hasIdb()) return
  const patch: Record<string, unknown> = {}
  for (const key of LARGE_KEYS) {
    // 老版本把大图塞在 localStorage 里：迁移到 IndexedDB 后删除，避免配额被占满
    const legacy = (() => {
      try {
        return localStorage.getItem(PREFIX + key)
      } catch {
        return null
      }
    })()
    let value = await idbGet(key)
    if (value === undefined && legacy !== null) {
      try {
        value = JSON.parse(legacy) as unknown
        await idbSet(key, value)
        localStorage.removeItem(PREFIX + key)
      } catch {
        // 脏数据，忽略
      }
    }
    if (value !== undefined) patch[key] = value
  }
  if (Object.keys(patch).length > 0) localSettings.value = { ...localSettings.value, ...patch }
}

/** 重新从本地读取（切换账号/清缓存后用） */
export function reloadLocalSettings(): void {
  localSettings.value = readLocal()
  void hydrateLocalSettings()
}

/** 清空所有本机设置（「重置本机外观」用） */
export async function clearLocalSettings(): Promise<void> {
  localSettings.value = {}
  if (hasStorage()) {
    for (const def of SETTING_DEFS) {
      if (!def.local || EXCLUDED.has(def.key)) continue
      try {
        localStorage.removeItem(PREFIX + def.key)
      } catch {
        // 忽略
      }
    }
  }
  for (const key of LARGE_KEYS) await idbDelete(key)
}
