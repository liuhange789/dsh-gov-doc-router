/**
 * 一站式分析：解析 → 校验 → 修复 → 复核。
 *
 * 复核结果用于标记 auto_fixed：只有修复后确实不再命中的规则，才标成已自动修复，
 * 避免把「报了但没改成」的问题说成已解决。
 */

import { fixDocument } from './fix.js'
import { parseDocument, DOC_TYPES } from './parse.js'
import { runRules } from './rules.js'

export function normalizeDocType(value) {
  return DOC_TYPES.includes(value) ? value : '通知'
}

/**
 * @param {string} content
 * @param {string} docType
 */
export function analyzeDocument(content, docType = '通知') {
  const normalizedType = normalizeDocType(docType)
  const first = parseDocument(content, normalizedType)
  const issues = runRules(first)
  const fixed = fixDocument(first)
  const second = parseDocument(fixed.content, normalizedType)
  const remaining = new Set(runRules(second).map((issue) => issue.rule_id))

  for (const issue of issues) {
    issue.auto_fixed = issue.auto_fixed && !remaining.has(issue.rule_id)
  }

  return {
    docType: normalizedType,
    issues,
    fixedContent: fixed.content,
    fixSummary: fixed.summary,
    parsed: second,
  }
}
