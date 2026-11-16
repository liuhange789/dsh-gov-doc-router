/**
 * 公文档结构解析：识别标题、发文字号、主送机关、正文、附件说明、落款与版记。
 *
 * 只做纯文本/Markdown 的轻量结构识别，不做语义理解。所有规则与修复都依赖这里
 * 给出的行号与文本，行号从 1 开始，便于在问题清单里定位。
 */

export const DOC_TYPES = ['请示', '报告', '通知', '函', '纪要', '通报']

/** 全角空格，用于「左空二字」的文本表达。 */
export const INDENT = '\u3000\u3000'

const CN_DIGITS = {
  '〇': 0,
  '零': 0,
  '一': 1,
  '二': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
}

const YEAR_SRC = '(?:\\d{4}|[〇零一二三四五六七八九]{4})'
const NUM_SRC = '(?:\\d{1,2}|[一二三四五六七八九十]{1,3})'

export const DATE_FULL_RE = new RegExp(`(${YEAR_SRC})\\s*年\\s*(${NUM_SRC})\\s*月\\s*(${NUM_SRC})\\s*(?:日|号)`)
export const DATE_COMPACT_RE = new RegExp(`(${YEAR_SRC})\\s*[.\\-/．]\\s*(${NUM_SRC})\\s*[.\\-/．]\\s*(${NUM_SRC})`)
export const DOC_NUMBER_RE = /([〔\[（(])\s*(\d{4})\s*([〕\]）)])\s*(?:第\s*)?(\d+)\s*号/

/**
 * 第三层标题序数：只认行首「1、」，允许前置空白（含全角空格）。
 * 1-3 位数字且序数后不是数字，避免把「1、2项工作」「2026、2027年度预算」当标题。
 */
export const HEADING_SERIAL_RE = /^([\s\u3000]*)(\d{1,3})、(?!\d)/

export function cleanText(text) {
  return String(text ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\*\*|__/g, '')
    .trim()
}

export function isBlank(text) {
  return cleanText(text) === ''
}

/** 中文数字或阿拉伯数字转整数；用于年份、月、日。 */
export function toArabicNumber(value) {
  const text = String(value ?? '').trim()
  if (/^\d+$/.test(text)) return Number(text)
  if (/^[〇零一二三四五六七八九]{2,}$/.test(text)) {
    return Number([...text].map((char) => CN_DIGITS[char]).join(''))
  }
  if (text === '十') return 10
  const tens = text.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/)
  if (tens) {
    const high = tens[1] ? CN_DIGITS[tens[1]] : 1
    const low = tens[2] ? CN_DIGITS[tens[2]] : 0
    return high * 10 + low
  }
  if (text.length === 1 && text in CN_DIGITS) return CN_DIGITS[text]
  return Number.NaN
}

/** 在任意文本里找第一个日期，返回标准化后的年月日。 */
export function findDate(text) {
  const source = String(text ?? '')
  for (const regex of [DATE_FULL_RE, DATE_COMPACT_RE]) {
    const match = regex.exec(source)
    if (!match) continue
    const year = toArabicNumber(match[1])
    const month = toArabicNumber(match[2])
    const day = toArabicNumber(match[3])
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return { raw: match[0], year, month, day, index: match.index }
  }
  return null
}

export function formatDate(parts) {
  return `${parts.year}年${parts.month}月${parts.day}日`
}

export function isDateLine(text) {
  const clean = cleanText(text)
  const date = findDate(clean)
  return Boolean(date) && clean === date.raw
}

export function isHeading1(text) {
  return /^[一二三四五六七八九十]+、/.test(cleanText(text))
}

export function isHeading2(text) {
  return /^（[一二三四五六七八九十]+）/.test(cleanText(text))
}

export function isHeading3(text) {
  return /^\d+\./.test(cleanText(text))
}

export function isAttachmentLine(text) {
  return /^附件\s*\d*\s*[：:]/.test(cleanText(text))
}

export function isCcLine(text) {
  return /^抄送\s*[：:]/.test(cleanText(text))
}

export function isRecipientLine(text) {
  const clean = cleanText(text)
  return /[：:]$/.test(clean) && !isCcLine(clean) && !isAttachmentLine(clean)
}

const TITLE_MAX_CHARS = 40

/** 没有发文字号和主送机关时，用于判断首行是否真的像标题。 */
function isPlausibleTitle(text) {
  const clean = cleanText(text)
  if (!clean) return false
  if (clean.length > TITLE_MAX_CHARS) return false
  return !/[。！？]$/.test(clean)
}

/**
 * @param {string} content
 * @param {string} docType
 */
export function parseDocument(content, docType) {
  const lines = String(content ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((text, index) => ({ text, index, lineNumber: index + 1 }))

  const filled = lines.filter((line) => !isBlank(line.text))

  const docNumberLine = filled.find((line) => DOC_NUMBER_RE.test(cleanText(line.text)) && !isDateLine(line.text)) ?? null

  const isTitleCandidate = (line) =>
    line !== docNumberLine &&
    !isDateLine(line.text) &&
    !isRecipientLine(line.text) &&
    !isAttachmentLine(line.text) &&
    !isCcLine(line.text)

  // 有主送机关时，标题应当紧邻主送机关上方（中间可夹发文字号）；没有主送机关时取第一行。
  // 既无发文字号也无主送机关时，第一行若像长句（超长或带句号），不把它当标题，交由规则报缺失。
  const recipientProbe = filled.find((line) => isRecipientLine(line.text)) ?? null
  let titleLine = null
  if (recipientProbe) {
    titleLine = [...filled].reverse().find((line) => line.index < recipientProbe.index && isTitleCandidate(line)) ?? null
  } else {
    const firstCandidate = filled.find(isTitleCandidate) ?? null
    titleLine = firstCandidate && (docNumberLine || isPlausibleTitle(firstCandidate.text)) ? firstCandidate : null
  }

  const afterTitle = titleLine ? filled.filter((line) => line.index > titleLine.index) : filled
  const recipientLine = afterTitle.find((line) => isRecipientLine(line.text)) ?? null
  const attachmentLines = filled.filter((line) => isAttachmentLine(line.text))
  const ccLine = filled.find((line) => isCcLine(line.text)) ?? null

  const dateLine = [...filled].reverse().find((line) => isDateLine(line.text)) ?? null
  const signatureLine = dateLine
    ? [...filled].reverse().find((line) => line.index < dateLine.index && !isAttachmentLine(line.text) && !isCcLine(line.text)) ?? null
    : null

  const bodyStart = recipientLine ? recipientLine.index + 1 : titleLine ? titleLine.index + 1 : 0
  const bodyEnd = Math.min(
    attachmentLines.length ? attachmentLines[0].index : Number.POSITIVE_INFINITY,
    dateLine ? dateLine.index : Number.POSITIVE_INFINITY,
    ccLine ? ccLine.index : Number.POSITIVE_INFINITY,
    signatureLine ? signatureLine.index : Number.POSITIVE_INFINITY,
  )
  const bodyLines = filled.filter((line) => line.index >= bodyStart && line.index < bodyEnd)

  return {
    docType,
    lines,
    filled,
    title: titleLine,
    docNumber: docNumberLine,
    recipient: recipientLine,
    attachments: attachmentLines,
    cc: ccLine,
    date: dateLine,
    signature: signatureLine,
    bodyLines,
  }
}

/** 把行号包成统一的中文定位串。 */
export function locate(line, label = '') {
  if (!line) return label || '文档'
  return label ? `第 ${line.lineNumber} 行（${label}）` : `第 ${line.lineNumber} 行`
}
