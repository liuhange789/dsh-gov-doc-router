/**
 * GB/T 9704 高频格式规则。每条规则一个独立函数，返回 { passed, description, location }。
 *
 * kind = 'text' 的规则可以在纯文本里检查；kind = 'export' 的规则只在 .docx 导出阶段落实，
 * 因为字体、页码、行距、页边距无法从纯文本中可靠读出，所以不伪装成文本检查结果。
 */

import {
  DATE_COMPACT_RE,
  DATE_FULL_RE,
  DOC_NUMBER_RE,
  HEADING_SERIAL_RE,
  INDENT,
  cleanText,
  findDate,
  formatDate,
  isAttachmentLine,
  isBlank,
  isCcLine,
  locate,
} from './parse.js'

const TRAILING_PUNCTUATION = /[。，；、,;]$/
const HEADING_ASCII_PARENS = /^\s*\(\s*[一二三四五六七八九十]+\s*\)/

/** 导出阶段的固定版式，供 README 与 fix_summary 使用。 */
export const EXPORT_SPEC = {
  pageSize: 'A4（11906×16838 twips）',
  margins: '上 3.7cm、下 3.5cm、左 2.8cm、右 2.6cm',
  titleFont: '二号小标宋体，居中',
  bodyFont: '三号仿宋_GB2312，行距固定值 28 磅',
  heading1Font: '一级标题黑体三号',
  heading2Font: '二级标题楷体_GB2312 三号',
  pageNumber: '四号半角宋体，单页码居右、双页码居左，数字两侧加一字线',
}

function fail(rule, description, location) {
  return { passed: false, description, location }
}

const pass = { passed: true }

export const RULES = [
  {
    id: 'title.present',
    title: '标题存在',
    severity: 'error',
    kind: 'text',
    fixable: false,
    check(doc) {
      if (!doc.title) {
        return fail(this, '未识别到公文标题。标题应位于发文字号下方、主送机关上方。', '文档开头')
      }
      return pass
    },
  },
  {
    id: 'title.doc-type',
    title: '标题包含文种',
    severity: 'warning',
    kind: 'text',
    fixable: false,
    check(doc) {
      if (!doc.title || !doc.docType) return pass
      const text = cleanText(doc.title.text)
      if (!text.includes(doc.docType)) {
        return fail(this, `标题「${text}」未包含文种「${doc.docType}」。`, locate(doc.title, '标题'))
      }
      return pass
    },
  },
  {
    id: 'title.punctuation',
    title: '标题不加标点',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.title) return pass
      const text = cleanText(doc.title.text)
      if (TRAILING_PUNCTUATION.test(text)) {
        return fail(this, '公文标题末尾不加句号、逗号、分号等标点。', locate(doc.title, '标题'))
      }
      return pass
    },
  },
  {
    id: 'docnum.brackets',
    title: '发文字号年份用六角括号',
    severity: 'error',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.docNumber) return pass
      const match = DOC_NUMBER_RE.exec(cleanText(doc.docNumber.text))
      if (!match) return pass
      if (match[1] !== '〔' || match[3] !== '〕') {
        return fail(
          this,
          `发文字号年份应使用六角括号〔〕，当前为「${match[1]}${match[2]}${match[3]}」。`,
          locate(doc.docNumber, '发文字号'),
        )
      }
      return pass
    },
  },
  {
    id: 'docnum.serial',
    title: '发文字号序号不编虚位',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.docNumber) return pass
      const match = DOC_NUMBER_RE.exec(cleanText(doc.docNumber.text))
      if (!match) return pass
      if (/^0+[1-9]/.test(match[4]) || /^0\d+/.test(match[4])) {
        return fail(this, `发文顺序号「${match[4]}」编了虚位，应写作「${Number(match[4])}」。`, locate(doc.docNumber, '发文字号'))
      }
      return pass
    },
  },
  {
    id: 'date.format',
    title: '成文日期规范',
    severity: 'error',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.date) return pass
      const text = cleanText(doc.date.text)
      const parts = findDate(text)
      if (!parts) return pass
      const expected = formatDate(parts)
      if (text !== expected) {
        return fail(
          this,
          `成文日期应写作「${expected}」：阿拉伯数字、年/月/日标全、月日不补零，不使用汉字数字或点号分隔。`,
          locate(doc.date, '成文日期'),
        )
      }
      if (DATE_FULL_RE.test(text) === false && DATE_COMPACT_RE.test(text)) {
        return fail(this, `成文日期应写作「${expected}」。`, locate(doc.date, '成文日期'))
      }
      return pass
    },
  },
  {
    id: 'recipient.colon',
    title: '主送机关用全角冒号',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.recipient) return pass
      const text = cleanText(doc.recipient.text)
      if (text.endsWith(':')) {
        return fail(this, '主送机关末尾应使用全角冒号「：」。', locate(doc.recipient, '主送机关'))
      }
      return pass
    },
  },
  {
    id: 'attachment.spacing',
    title: '附件说明左空二字并前空一行',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.attachments.length) return pass
      const first = doc.attachments[0]
      const text = cleanText(first.text)
      const previous = doc.lines[first.index - 1]
      const wrongIndent = !doc.lines[first.index].text.startsWith(INDENT)
      const missingBlank = previous ? !isBlank(previous.text) : true
      if (wrongIndent || missingBlank) {
        return fail(
          this,
          `附件说明应位于正文下空一行、左空二字；当前${missingBlank ? '缺少空行' : ''}${missingBlank && wrongIndent ? '，' : ''}${wrongIndent ? '未左空二字' : ''}。`,
          locate(first, '附件说明'),
        )
      }
      return pass
    },
  },
  {
    id: 'attachment.colon',
    title: '附件说明标签用全角冒号',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      const bad = doc.attachments.find((line) => /^附件\s*\d*\s*:/.test(cleanText(line.text)))
      if (bad) {
        return fail(this, '附件说明标签后应使用全角冒号「：」，不使用半角冒号。', locate(bad, '附件说明'))
      }
      return pass
    },
  },
  {
    id: 'cc.colon',
    title: '抄送标签用全角冒号',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.cc) return pass
      if (/^抄送\s*:/.test(cleanText(doc.cc.text))) {
        return fail(this, '「抄送」后应使用全角冒号「：」，不使用半角冒号。', locate(doc.cc, '版记·抄送'))
      }
      return pass
    },
  },
  {
    id: 'attachment.punctuation',
    title: '附件名称不加标点',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      const bad = doc.attachments.find((line) => TRAILING_PUNCTUATION.test(cleanText(line.text)))
      if (bad) {
        return fail(this, '附件名称后不加标点符号。', locate(bad, '附件说明'))
      }
      return pass
    },
  },
  {
    id: 'cc.format',
    title: '抄送机关用逗号分隔并以句号结尾',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      if (!doc.cc) return pass
      const text = cleanText(doc.cc.text)
      const body = text.replace(/^抄送\s*[：:]\s*/, '')
      const hasChineseComma = /，/.test(body)
      const hasWrongSeparator = /、/.test(body) || /,/.test(body)
      const endsWithPeriod = body.endsWith('。')
      if (!hasChineseComma && hasWrongSeparator) {
        return fail(this, '抄送机关之间应使用逗号「，」分隔。', locate(doc.cc, '版记·抄送'))
      }
      if (!endsWithPeriod) {
        return fail(this, '最后一个抄送机关名称后应标句号。', locate(doc.cc, '版记·抄送'))
      }
      return pass
    },
  },
  {
    id: 'heading.numbering',
    title: '结构层次序数规范',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      const badParens = doc.filled.find((line) => HEADING_ASCII_PARENS.test(cleanText(line.text)))
      if (badParens) {
        return fail(this, '二级标题应使用全角括号「（一）」，不使用半角括号。', locate(badParens, '标题层次'))
      }
      const badSerial = doc.filled.find((line) => HEADING_SERIAL_RE.test(cleanText(line.text)))
      if (badSerial) {
        return fail(this, '第三层标题序数应写作「1.」，不使用「1、」。', locate(badSerial, '标题层次'))
      }
      return pass
    },
  },
  {
    id: 'signature.block',
    title: '落款含署名与成文日期',
    severity: 'error',
    kind: 'text',
    fixable: false,
    check(doc) {
      if (!doc.date) {
        return fail(this, '未识别到成文日期。落款应包含发文机关署名和成文日期。', '文档末尾')
      }
      if (!doc.signature) {
        return fail(this, '未识别到发文机关署名。成文日期上方应编排发文机关署名。', locate(doc.date, '成文日期'))
      }
      return pass
    },
  },
  {
    id: 'body.indent',
    title: '正文每段左空二字',
    severity: 'warning',
    kind: 'text',
    fixable: true,
    check(doc) {
      const paragraphs = doc.bodyLines.filter((line) => cleanText(line.text).length > 0)
      const bad = paragraphs.find((line) => !/^[\s\u3000]{2,}/.test(doc.lines[line.index].text))
      if (bad) {
        return fail(
          this,
          `正文各自然段应左空二字；共 ${paragraphs.filter((line) => !/^[\s\u3000]{2,}/.test(doc.lines[line.index].text)).length} 段未缩进。`,
          locate(bad, '正文'),
        )
      }
      return pass
    },
  },
]

export const TEXT_RULES = RULES.filter((rule) => rule.kind === 'text')
export const EXPORT_RULES = [
  { id: 'title.font', title: '标题二号小标宋体居中' },
  { id: 'body.font', title: '正文三号仿宋_GB2312' },
  { id: 'heading.font', title: '一级标题黑体三号、二级标题楷体_GB2312 三号' },
  { id: 'page.number', title: '页码单页右下、双页左下' },
  { id: 'page.line-spacing', title: '行距固定值 28 磅' },
]

/** 只返回未通过的规则结果，供 analyze 组装 issues。 */
export function runRules(doc) {
  const issues = []
  for (const rule of TEXT_RULES) {
    const result = rule.check(doc)
    if (!result.passed) {
      issues.push({
        rule_id: rule.id,
        severity: rule.severity,
        description: result.description,
        location: result.location,
        auto_fixed: Boolean(rule.fixable),
      })
    }
  }
  return issues
}
