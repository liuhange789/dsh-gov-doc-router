/**
 * .docx 导出：按 GB/T 9704 常用版式生成 A4 公文。
 *
 * 说明：字体、字号、行距、页边距、页码这些属性在纯文本里无法验证，所以统一在导出阶段
 * 落实；导出的是「版式骨架」，不替代人工排版终审。
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { cleanText, isBlank, isCcLine, isHeading1, isHeading2, isHeading3, parseDocument } from './parse.js'

const FONT_BODY = { ascii: 'Times New Roman', eastAsia: '仿宋_GB2312', hAnsi: 'Times New Roman' }
const FONT_TITLE = { ascii: 'Times New Roman', eastAsia: '小标宋体', hAnsi: 'Times New Roman' }
const FONT_HEI = { ascii: 'Times New Roman', eastAsia: '黑体', hAnsi: 'Times New Roman' }
const FONT_KAI = { ascii: 'Times New Roman', eastAsia: '楷体_GB2312', hAnsi: 'Times New Roman' }
const FONT_SONG = { ascii: 'Times New Roman', eastAsia: '宋体', hAnsi: 'Times New Roman' }

const SIZE_ER = 44 // 二号 22pt
const SIZE_SAN = 32 // 三号 16pt
const SIZE_SI = 28 // 四号 14pt

const EXACT_28 = { line: 560, lineRule: LineRuleType.EXACT, before: 0, after: 0 }
const INDENT_TWO_CHARS = 640 // 2 × 16pt × 20 twips
const INDENT_FOUR_CHARS = 1280 // 成文日期右空四字（三号 16pt × 4）
const INDENT_ONE_SI_CHAR = 280 // 四号 14pt 一字，用于版记左右各空一字

function paragraph(text, options = {}) {
  const {
    font = FONT_BODY,
    size = SIZE_SAN,
    alignment,
    firstLine = 0,
    left = 0,
    right = 0,
    bold = false,
    spacing = EXACT_28,
    border,
  } = options
  return new Paragraph({
    alignment,
    spacing,
    indent: { firstLine, left, right },
    border,
    children: [new TextRun({ text, font, size, bold })],
  })
}

function pageFooter(alignment) {
  return new Footer({
    children: [
      new Paragraph({
        alignment,
        spacing: EXACT_28,
        children: [
          new TextRun({ text: '— ', font: FONT_SONG, size: SIZE_SI }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT_SONG, size: SIZE_SI }),
          new TextRun({ text: ' —', font: FONT_SONG, size: SIZE_SI }),
        ],
      }),
    ],
  })
}

/**
 * @param {string} content 已修复的公文文本
 * @param {string} docType 文种
 * @returns {Promise<Buffer>}
 */
export async function buildDocx(content, docType) {
  const doc = parseDocument(content, docType)
  const children = []

  for (const line of doc.lines) {
    if (isBlank(line.text)) continue
    const text = cleanText(line.text).replace(/^\u3000\u3000/, '')
    const raw = line.text

    if (line.index === doc.docNumber?.index) {
      children.push(paragraph(text, { alignment: AlignmentType.CENTER, spacing: { ...EXACT_28, before: 0, after: 560 } }))
      continue
    }

    if (line.index === doc.title?.index) {
      children.push(
        paragraph(text, {
          font: FONT_TITLE,
          size: SIZE_ER,
          alignment: AlignmentType.CENTER,
          spacing: { ...EXACT_28, before: 560, after: 560 },
        }),
      )
      continue
    }

    if (line.index === doc.recipient?.index) {
      children.push(paragraph(text, { spacing: { ...EXACT_28, before: 0, after: 0 } }))
      continue
    }

    if (line.index === doc.date?.index) {
      children.push(paragraph(text, { right: INDENT_FOUR_CHARS, spacing: { ...EXACT_28, before: 0, after: 0 } }))
      continue
    }

    if (line.index === doc.signature?.index) {
      children.push(paragraph(text, { right: INDENT_FOUR_CHARS, spacing: { ...EXACT_28, before: 560, after: 0 } }))
      continue
    }

    if (isCcLine(text)) {
      children.push(
        paragraph(text, {
          size: SIZE_SI,
          left: INDENT_ONE_SI_CHAR,
          right: INDENT_ONE_SI_CHAR,
          spacing: { ...EXACT_28, before: 240, after: 240 },
          border: {
            top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          },
        }),
      )
      continue
    }

    if (line.index !== doc.title?.index && isHeading1(raw)) {
      children.push(paragraph(text, { font: FONT_HEI, firstLine: INDENT_TWO_CHARS }))
      continue
    }
    if (line.index !== doc.title?.index && isHeading2(raw)) {
      children.push(paragraph(text, { font: FONT_KAI, firstLine: INDENT_TWO_CHARS }))
      continue
    }
    if (line.index !== doc.title?.index && isHeading3(raw)) {
      children.push(paragraph(text, { bold: true, firstLine: INDENT_TWO_CHARS }))
      continue
    }

    if (/^附件\s*\d*\s*[：:]/.test(text)) {
      children.push(paragraph(text, { firstLine: INDENT_TWO_CHARS }))
      continue
    }

    children.push(paragraph(text, { firstLine: INDENT_TWO_CHARS }))
  }

  const document = new Document({
    evenAndOddHeaderAndFooters: true,
    styles: {
      default: {
        document: {
          run: { font: FONT_BODY, size: SIZE_SAN },
          paragraph: { spacing: EXACT_28 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 2098, bottom: 1984, left: 1588, right: 1474, header: 851, footer: 992, gutter: 0 },
          },
        },
        footers: {
          default: pageFooter(AlignmentType.END),
          even: pageFooter(AlignmentType.START),
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(document)
}
