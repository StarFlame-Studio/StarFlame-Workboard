#!/usr/bin/env node
/**
 * 校验 MDI 图标子集是否齐全：设置项新增图标后如果忘记重新生成子集，界面上会显示成空白方块。
 * 失败时按提示运行生成脚本：
 *   python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli
 *   /tmp/ft/bin/python apps/web/scripts/build-mdi-subset.py
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(here, '..')
const workspace = path.resolve(appDir, '..', '..')
const cssPath = path.join(appDir, 'src/styles/mdi-subset.css')

const css = fs.readFileSync(cssPath, 'utf8')
const available = new Set([...css.matchAll(/\.(mdi-[a-z0-9-]+)::before/g)].map((m) => m[1]))

/** 生成脚本统计的来源目录：web src + shared src */
const roots = [path.join(appDir, 'src'), path.join(workspace, 'packages/shared/src')]
const extensions = new Set(['.ts', '.vue', '.js', '.json', '.scss', '.css'])
const used = new Set()

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
    } else if (extensions.has(path.extname(entry.name))) {
      if (entry.name === 'mdi-subset.css') continue
      const text = fs.readFileSync(full, 'utf8')
      for (const match of text.matchAll(/mdi-[a-z0-9-]+/g)) used.add(match[0])
    }
  }
}

for (const root of roots) walk(root)
used.delete('mdi-subset')

const missing = [...used].filter((name) => !available.has(name)).sort()
if (missing.length) {
  console.error('[check-mdi-subset] 以下图标不在字体子集里，界面会显示空白：')
  for (const name of missing) console.error('  ' + name)
  console.error('[check-mdi-subset] 重新生成：/tmp/ft/bin/python apps/web/scripts/build-mdi-subset.py')
  process.exit(1)
}
console.log('[check-mdi-subset] 图标子集齐全（' + available.size + ' 个）')