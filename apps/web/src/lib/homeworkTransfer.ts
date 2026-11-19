/**
 * 作业导入导出（UAF / 图片 / JSON）
 *
 * UAF（Universal Assignment File）是作业交换文件：一个单页 PDF，
 * 页面内容是当日作业的渲染图，同时内嵌 `uaf_payload.csv` 结构化数据，
 * 便于在其它设备或原版作业板上还原作业内容。
 *
 * 本项目实现的 UAF v1 结构：
 * - 页面：A4 竖版（595×842pt），整页渲染图（JPEG / DCTDecode）
 * - 内嵌附件：`uaf_payload.csv`（PDF /Names /EmbeddedFiles 名称树）
 * - 兼容尾部：文件末尾追加 `%UAF-PAYLOAD-BEGIN … %UAF-PAYLOAD-END` 纯文本块，
 *   即使 PDF 附件被某些工具剥离也能读回数据
 * - CSV 列：`date,subject,content`，首行 `#uaf 1`
 */

export interface HomeworkSheetRow {
  date: string
  subject: string
  content: string
  color?: string
}

export interface SheetMeta {
  className: string
  date: string
}

export const UAF_CSV_NAME = 'uaf_payload.csv'
const UAF_MARK_BEGIN = '%UAF-PAYLOAD-BEGIN'
const UAF_MARK_END = '%UAF-PAYLOAD-END'
const UAF_CSV_HEADER = '#uaf 1'

/** 渲染画布宽度（px） */
const SHEET_WIDTH = 1240
/** 位图倍率 */
const SHEET_SCALE = 2
const SHEET_FONT = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif"

/* ------------------------------------------------------------------ */
/* 日期工具                                                            */
/* ------------------------------------------------------------------ */

export function todayString(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function normalizeDate(value: string): string {
  const text = String(value ?? '').trim()
  if (/^\d{8}$/.test(text)) return text.slice(0, 4) + '-' + text.slice(4, 6) + '-' + text.slice(6, 8)
  const match = /^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/.exec(text)
  if (match) {
    const [, y, m, d] = match
    return y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0')
  }
  return text
}

export function displayDate(date: string): string {
  const iso = normalizeDate(date)
  const today = todayString()
  if (iso === today) return iso + '（今天）'
  const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10)
  if (iso === yesterday) return iso + '（昨天）'
  return iso
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

function csvCell(value: string): string {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

export function buildUafCsv(rows: HomeworkSheetRow[]): string {
  const lines = [UAF_CSV_HEADER, 'date,subject,content']
  for (const row of rows) {
    lines.push([csvCell(normalizeDate(row.date)), csvCell(row.subject), csvCell(row.content)].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/** 解析 CSV（支持引号包裹、双引号转义、单元格内换行） */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export interface ParsedUaf {
  rows: HomeworkSheetRow[]
  skipped: number
}

/** 把 UAF 的 CSV 文本转成作业行 */
export function rowsFromUafCsv(csv: string): ParsedUaf {
  const table = parseCsv(csv)
  const rows: HomeworkSheetRow[] = []
  let skipped = 0
  let columns: string[] | null = null
  for (const cells of table) {
    if (cells.length === 1 && cells[0].startsWith('#')) continue
    if (!cells.some((cell) => cell.trim().length > 0)) continue
    if (!columns) {
      columns = cells.map((cell) => cell.trim().toLowerCase())
      continue
    }
    const get = (name: string, fallbackIndex: number): string => {
      const index = columns!.indexOf(name)
      return cells[(index >= 0 ? index : fallbackIndex) ?? 0] ?? ''
    }
    const date = normalizeDate(get('date', 0))
    const subject = get('subject', 1).trim()
    const content = get('content', 2)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !subject || !content.trim()) {
      skipped += 1
      continue
    }
    rows.push({ date, subject, content })
  }
  return { rows, skipped }
}

/* ------------------------------------------------------------------ */
/* 图片渲染（DOM → SVG foreignObject → canvas）                         */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FALLBACK_COLORS = ['#f4511e', '#ff8a1f', '#2e9e63', '#2f7fd1', '#8e5cf7', '#e5484d', '#0ea5a5', '#c29a19']

function sheetBodyHtml(rows: HomeworkSheetRow[], meta: SheetMeta): string {
  const cards = rows
    .map((row, index) => {
      const color = row.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
      const lines = row.content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      const body = lines.length
        ? lines
            .map(
              (line) =>
                '<div style="margin:0 0 6px 0;font-size:26px;line-height:1.55;color:#E8DED4;word-break:break-word;">' +
                escapeHtml(line) +
                '</div>',
            )
            .join('')
        : '<div style="font-size:24px;line-height:1.5;color:#9A8E84;">暂无作业</div>'
      return (
        '<div style="box-sizing:border-box;width:100%;border:1px solid #3A2C22;border-radius:20px;padding:22px 26px;margin:0 0 20px 0;background:#221B17;">' +
        '<div style="display:flex;align-items:center;margin:0 0 12px 0;">' +
        '<span style="display:inline-block;width:14px;height:14px;border-radius:7px;background:' +
        color +
        ';margin-right:12px;"></span>' +
        '<span style="font-size:32px;font-weight:700;color:#F5EDE4;letter-spacing:0.5px;">' +
        escapeHtml(row.subject) +
        '</span>' +
        '</div>' +
        body +
        '</div>'
      )
    })
    .join('')

  return (
    '<div style="box-sizing:border-box;width:' +
    SHEET_WIDTH +
    'px;min-height:1754px;padding:56px 60px 48px 60px;background:#16130F;font-family:' +
    SHEET_FONT +
    ';">'
    + '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin:0 0 8px 0;">'
    + '<div>'
    + '<div style="font-size:46px;font-weight:800;color:#F5EDE4;letter-spacing:1px;">今日作业</div>'
    + '<div style="margin-top:10px;font-size:26px;color:#B9AEA4;">'
    + escapeHtml(meta.className || '班级') +
    ' · ' +
    escapeHtml(normalizeDate(meta.date)) +
    '</div>'
    + '</div>'
    + '<div style="font-size:24px;font-weight:700;color:#FF7A3C;letter-spacing:2px;">星焰作业板</div>'
    + '</div>'
    + '<div style="height:4px;width:120px;border-radius:2px;background:#FF7A3C;margin:0 0 30px 0;"></div>'
    + (cards || '<div style="font-size:28px;color:#9A8E84;">这一天没有作业</div>')
    + '<div style="margin-top:26px;padding-top:18px;border-top:1px solid #3A2C22;font-size:20px;color:#9A8E84;display:flex;justify-content:space-between;">'
    + '<span>导出时间：' + escapeHtml(new Date().toLocaleString('zh-CN')) + '</span>'
    + '<span>共 ' + rows.length + ' 项作业</span>'
    + '</div>'
    + '</div>'
  )
}

export interface SheetImage {
  /** PNG 图片（用于下载） */
  png: Blob
  /** JPEG dataURL（用于嵌入 PDF） */
  jpegDataUrl: string
  width: number
  height: number
}

/** 把作业渲染成 A4 比例图片（离屏 DOM → SVG → canvas） */
export async function renderHomeworkSheet(rows: HomeworkSheetRow[], meta: SheetMeta): Promise<SheetImage> {
  const html = sheetBodyHtml(rows, meta)
  const holder = document.createElement('div')
  holder.style.position = 'fixed'
  holder.style.left = '-10000px'
  holder.style.top = '0'
  holder.style.width = SHEET_WIDTH + 'px'
  holder.style.pointerEvents = 'none'
  holder.innerHTML = html
  document.body.appendChild(holder)
  const height = Math.max(1754, Math.ceil(holder.scrollHeight || holder.getBoundingClientRect().height))
  holder.remove()

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    SHEET_WIDTH +
    '" height="' +
    height +
    '" viewBox="0 0 ' +
    SHEET_WIDTH +
    ' ' +
    height +
    '">' +
    '<foreignObject x="0" y="0" width="100%" height="100%">' +
    '<div xmlns="http://www.w3.org/1999/xhtml">' +
    html +
    '</div></foreignObject></svg>'
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)

  const image = new Image()
  image.width = SHEET_WIDTH
  image.height = height
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('渲染作业图片失败'))
    image.src = svgUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(SHEET_WIDTH * SHEET_SCALE)
  canvas.height = Math.round(height * SHEET_SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持画布渲染')
  ctx.fillStyle = '#16130F'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('生成图片失败'))), 'image/png')
  })
  return {
    png,
    jpegDataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height,
  }
}

/* ------------------------------------------------------------------ */
/* PDF（UAF）                                                          */
/* ------------------------------------------------------------------ */

function latin1Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff
  return out
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

const A4_WIDTH = 595
const A4_HEIGHT = 842

/** 生成 UAF PDF（单页图片 + 内嵌 uaf_payload.csv） */
export function buildUafPdf(image: SheetImage, csv: string): Blob {
  const jpeg = base64ToBytes(image.jpegDataUrl.split(',')[1] ?? '')
  const csvBytes = new TextEncoder().encode('\uFEFF' + csv)
  const scale = Math.min(A4_WIDTH / image.width, A4_HEIGHT / image.height)
  const drawWidth = (image.width * scale).toFixed(2)
  const drawHeight = (image.height * scale).toFixed(2)
  const offsetX = ((A4_WIDTH - Number(drawWidth)) / 2).toFixed(2)
  const offsetY = ((A4_HEIGHT - Number(drawHeight)) / 2).toFixed(2)
  const content = 'q ' + drawWidth + ' 0 0 ' + drawHeight + ' ' + offsetX + ' ' + offsetY + ' cm /Im0 Do Q\n'

  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let cursor = 0
  const push = (chunk: Uint8Array | string): void => {
    const bytes = typeof chunk === 'string' ? latin1Bytes(chunk) : chunk
    parts.push(bytes)
    cursor += bytes.length
  }

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(' + UAF_CSV_NAME + ') 6 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4_WIDTH + ' ' + A4_HEIGHT + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /XObject /Subtype /Image /Width ' + image.width + ' /Height ' + image.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>',
    '<< /Length ' + content.length + ' >>',
    '<< /Type /EmbeddedFile /Subtype /text#2Fcsv /F (' + UAF_CSV_NAME + ') /UF (' + UAF_CSV_NAME + ') /Params << /Size ' + csvBytes.length + ' >> /Length ' + csvBytes.length + ' >>',
  ]

  objects.forEach((dict, index) => {
    offsets[index] = cursor
    push(index + 1 + ' 0 obj\n' + dict + '\n')
    if (index === 3) {
      push('stream\n')
      push(jpeg)
      push('\nendstream\nendobj\n')
    } else if (index === 4) {
      push('stream\n' + content + 'endstream\nendobj\n')
    } else if (index === 5) {
      push('stream\n')
      push(csvBytes)
      push('\nendstream\nendobj\n')
    } else {
      push('endobj\n')
    }
  })

  const xrefOffset = cursor
  const xref =
    'xref\n0 ' +
    (objects.length + 1) +
    '\n0000000000 65535 f \n' +
    offsets.map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' +
    (objects.length + 1) +
    ' /Root 1 0 R >>\nstartxref\n' +
    xrefOffset +
    '\n%%EOF\n'
  push(xref)
  // 尾部纯文本兜底：附件被剥离时仍可读回数据
  push(UAF_MARK_BEGIN + '\n' + csv + UAF_MARK_END + '\n')

  return new Blob(parts as unknown as BlobPart[], { type: 'application/pdf' })
}

/* ------------------------------------------------------------------ */
/* 读取 UAF                                                            */
/* ------------------------------------------------------------------ */

async function inflate(bytes: Uint8Array): Promise<string | null> {
  try {
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
    return await new Response(stream).text()
  } catch {
    return null
  }
}

/** 从 UAF PDF 里取出 uaf_payload.csv 文本 */
export async function extractUafCsv(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  let text = ''
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i])

  // ① 本项目尾部纯文本块
  const begin = text.indexOf(UAF_MARK_BEGIN)
  if (begin >= 0) {
    const start = begin + UAF_MARK_BEGIN.length
    const end = text.indexOf(UAF_MARK_END, start)
    if (end > start) {
      const raw = bytes.subarray(start, end)
      const decoded = new TextDecoder('utf-8').decode(raw).trim()
      if (decoded) return decoded
    }
  }

  // ② PDF 名称树里的内嵌附件
  const nameIndex = text.indexOf(UAF_CSV_NAME)
  if (nameIndex >= 0) {
    const streamIndex = text.indexOf('stream', nameIndex)
    if (streamIndex >= 0) {
      const dictStart = text.lastIndexOf('<<', streamIndex)
      const dict = dictStart >= 0 ? text.slice(dictStart, streamIndex) : ''
      const lengthMatch = /\/Length\s+(\d+)/.exec(dict)
      let dataStart = streamIndex + 'stream'.length
      if (text[dataStart] === '\r') dataStart += 1
      if (text[dataStart] === '\n') dataStart += 1
      const length = lengthMatch ? Number(lengthMatch[1]) : 0
      const raw = length > 0 ? bytes.subarray(dataStart, dataStart + length) : bytes.subarray(dataStart, text.indexOf('endstream', dataStart))
      const candidates: Uint8Array[] = [raw]
      if (/\/FlateDecode/.test(dict)) {
        const inflated = await inflate(raw)
        if (inflated && inflated.includes(',')) return inflated.replace(/^\uFEFF/, '')
      }
      for (const candidate of candidates) {
        const decoded = new TextDecoder('utf-8').decode(candidate).replace(/^\uFEFF/, '')
        if (decoded.includes(',') && /\d{4}/.test(decoded)) return decoded.trim()
      }
    }
  }

  throw new Error('未能从该文件中读取 UAF 作业数据（也许它不是 UAF 文件，或附件已被剥离）')
}

/* ------------------------------------------------------------------ */
/* 下载                                                               */
/* ------------------------------------------------------------------ */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function safeName(value: string): string {
  return String(value ?? '').replace(/[\\/:*?"<>|\s]+/g, '') || 'class'
}
