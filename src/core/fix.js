/**
 * 自动修复：把能确定的格式问题就地改写，并给出逐条修改说明。
 *
 * 修复原则是「只改格式，不改内容」：不补写标题、不生成发文机关、不编造日期。
 * 无法确定的内容问题只在校验里报出，不在这里臆造。
 */

import {
  DOC_NUMBER_RE,
  HEADING_SERIAL_RE,
  INDENT,
  cleanText,
  findDate,
  formatDate,
  isAttachmentLine,
  isBlank,
  isCcLine,
} from './parse.js'

const TRAILING_PUNCTUATION = /[。，；、,;]$/
const HEADING_ASCII_PARENS = /^([\s\u3000]*)\(\s*([一二三四五六七八九十]+)\s*\)/

function normalizeDocNumber(text) {
  const match = DOC_NUMBER_RE.exec(text)
  if (!match) return { text, note: null }
  const year = match[2]
  const serial = Number(match[4])
  const canonical = `〔${year}〕${serial}号`
  if (match[0] === canonical) return { text, note: null }
  return {
    text: text.replace(match[0], canonical),
    note: `发文字号「${match[0]}」改为「${canonical}」`,
  }
}

function normalizeDateLine(text) {
  const parts = findDate(text)
  if (!parts) return { text, note: null }
  const canonical = formatDate(parts)
  if (parts.raw === canonical) return { text, note: null }
  return {
    text: text.replace(parts.raw, canonical),
    note: `成文日期「${parts.raw}」改为「${canonical}」`,
  }
}

function normalizeCc(text) {
  const prefixMatch = text.match(/^(\s*抄送\s*)([：:])([\s\S]*)$/)
  if (!prefixMatch) return { text, note: null }
  const head = `${prefixMatch[1]}：`
  const originalBody = prefixMatch[3].trim()
  let body = originalBody
  body = body.replace(/、/g, '，').replace(/,/g, '，').replace(/；+/g, '，')
  body = body.replace(/，+$/g, '').replace(TRAILING_PUNCTUATION, '')
  if (!body.endsWith('。')) body += '。'
  const canonical = `${head}${body}`
  if (canonical === text) return { text, note: null }
  const notes = []
  if (prefixMatch[2] !== '：') notes.push('抄送标签冒号改为全角「：」')
  if (body !== originalBody) notes.push(`抄送机关格式改为「${body}」`)
  if (!notes.length) notes.push('抄送机关行已规范化')
  return { text: canonical, note: notes.join('；') }
}

function normalizeHeading(text) {
  const parenMatch = HEADING_ASCII_PARENS.exec(text)
  const serialMatch = HEADING_SERIAL_RE.exec(text)
  if (!parenMatch && !serialMatch) return { text, note: null }
  let next = text
  const notes = []
  if (parenMatch) {
    next = next.replace(HEADING_ASCII_PARENS, (_, lead, numeral) => `${lead}（${numeral}）`)
    notes.push('二级标题半角括号改为全角括号')
  }
  if (serialMatch) {
    next = next.replace(HEADING_SERIAL_RE, (_, lead, numeral) => `${lead}${numeral}.`)
    notes.push('三级标题「、」改为「.」')
  }
  if (next === text) return { text, note: null }
  return { text: next, note: `标题层次序数「${cleanText(text)}」改为「${cleanText(next)}」` }
}

/**
 * @param {ReturnType<import('./parse.js').parseDocument>} doc
 */
export function fixDocument(doc) {
  const summary = []
  const bodyIndices = new Set(doc.bodyLines.map((line) => line.index))
  const docNumberIndex = doc.docNumber?.index
  const titleIndex = doc.title?.index
  const recipientIndex = doc.recipient?.index
  const ccIndex = doc.cc?.index
  const dateIndex = doc.date?.index
  const signatureIndex = doc.signature?.index

  const output = []

  for (const line of doc.lines) {
    let text = line.text
    let note = null

    if (line.index === docNumberIndex) {
      const result = normalizeDocNumber(text)
      text = result.text
      note = result.note
    } else if (line.index === dateIndex) {
      const result = normalizeDateLine(text)
      text = result.text
      note = result.note
    } else if (line.index === titleIndex && TRAILING_PUNCTUATION.test(cleanText(text))) {
      const fixed = text.replace(TRAILING_PUNCTUATION, '')
      note = `标题末尾标点「${text.trim().slice(-1)}」已删除`
      text = fixed
    } else if (line.index === recipientIndex) {
      const clean = cleanText(text)
      if (clean.endsWith(':')) {
        text = text.replace(/:\s*$/, '：')
        note = '主送机关冒号改为全角「：」'
      }
    } else if (isAttachmentLine(text)) {
      let next = text
      const notes = []
      if (/^\s*附件\s*\d*\s*:/.test(next)) {
        next = next.replace(/^(\s*附件\s*\d*\s*):/, '$1：')
        notes.push('附件说明标签冒号改为全角「：」')
      }
      if (TRAILING_PUNCTUATION.test(cleanText(next))) {
        next = next.replace(TRAILING_PUNCTUATION, '')
        notes.push('附件名称末尾标点已删除')
      }
      if (!next.startsWith(INDENT)) {
        next = `${INDENT}${cleanText(next)}`
        notes.push('附件说明左空二字')
      }
      text = next
      if (notes.length) note = notes.join('；')
    } else if (line.index === ccIndex) {
      const result = normalizeCc(text)
      text = result.text
      note = result.note
    } else if (line.index !== titleIndex && line.index !== signatureIndex) {
      const result = normalizeHeading(text)
      text = result.text
      note = result.note
    }

    if (note) summary.push(`第 ${line.lineNumber} 行：${note}`)

    if (isAttachmentLine(text) && output.length && !isBlank(output[output.length - 1]) && !isAttachmentLine(output[output.length - 1])) {
      output.push('')
      summary.push(`第 ${line.lineNumber} 行：附件说明前补空行`)
    }

    if (
      bodyIndices.has(line.index) &&
      line.index !== signatureIndex &&
      line.index !== dateIndex &&
      cleanText(text).length > 0 &&
      !/^[\s\u3000]{2,}/.test(text)
    ) {
      text = `${INDENT}${cleanText(text)}`
      summary.push(`第 ${line.lineNumber} 行：正文段落左空二字`)
    }

    output.push(text)
  }

  const fixedContent = output.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')

  return { content: fixedContent, summary }
}
