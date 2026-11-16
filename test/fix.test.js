import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeDocument } from '../src/core/analyze.js'
import { fixDocument } from '../src/core/fix.js'
import { parseDocument } from '../src/core/parse.js'

const DIRTY = `福州市人民政府办公厅关于开展安全生产大检查的通知。
福政发[2026]001号
各县（市）区人民政府:
为深入排查安全隐患，现将有关事项通知如下。
一、检查范围
1、重点行业领域
请各单位于12月10日前反馈。
附件：安全生产检查表。
抄送：市委办公室、市人大常委会办公厅
福州市人民政府办公厅
二〇二六年十一月十六日`

test('发文字号、日期、冒号、附件、抄送、标题层次均被修复', () => {
  const fixed = fixDocument(parseDocument(DIRTY, '通知'))
  assert.match(fixed.content, /福政发〔2026〕1号/)
  assert.match(fixed.content, /2026年11月16日/)
  assert.match(fixed.content, /各县（市）区人民政府：/)
  assert.match(fixed.content, /1\.重点行业领域/)
  assert.match(fixed.content, /抄送：市委办公室，市人大常委会办公厅。/)
  assert.match(fixed.content, /附件：安全生产检查表$/m)
  assert.ok(!fixed.content.includes('[2026]'))
  assert.ok(!fixed.content.includes('001号'))
})

test('修复后复核为零问题', () => {
  const result = analyzeDocument(DIRTY, '通知')
  const recheck = analyzeDocument(result.fixedContent, '通知')
  assert.deepEqual(recheck.issues, [])
})

test('修复是幂等的：再修一次不再产生修改清单', () => {
  const once = analyzeDocument(DIRTY, '通知')
  const twice = analyzeDocument(once.fixedContent, '通知')
  assert.equal(twice.fixSummary.length, 0)
  assert.equal(twice.fixedContent, once.fixedContent.replace(/\n{3,}/g, '\n\n'))
})

test('附件说明前补空行且左空二字', () => {
  const fixed = fixDocument(parseDocument(DIRTY, '通知')).content
  const lines = fixed.split('\n')
  const attachmentIndex = lines.findIndex((line) => line.includes('附件：安全生产检查表'))
  assert.ok(attachmentIndex > 0)
  assert.equal(lines[attachmentIndex - 1], '', '附件说明前应有一行空行')
  assert.ok(lines[attachmentIndex].startsWith('\u3000\u3000'), '附件说明应左空二字')
})

test('修改清单逐条可读且带行号', () => {
  const result = analyzeDocument(DIRTY, '通知')
  assert.ok(result.fixSummary.length >= 6)
  for (const item of result.fixSummary) {
    assert.match(item, /^第 \d+ 行：/)
  }
})

test('无法确定的内容问题不会被伪造修复', () => {
  const noDate = '某市人民政府\n关于开展检查的通知\n各县（市）区人民政府：\n　　请认真落实。'
  const result = analyzeDocument(noDate, '通知')
  const issue = result.issues.find((item) => item.rule_id === 'signature.block')
  assert.ok(issue)
  assert.equal(issue.auto_fixed, false)
  assert.ok(!/\d{4}年\d{1,2}月\d{1,2}日/.test(result.fixedContent), '不应编造成文日期')
})

test('附件与抄送标签的半角冒号被报出并修复为全角', () => {
  const halfWidth = '某市人民政府\n关于开展专项检查的通知\n各县（市）区人民政府：\n　　请认真落实。\n附件:任务分解表\n抄送:市政府办公室\n某市人民政府\n2026年1月1日'
  const result = analyzeDocument(halfWidth, '通知')
  const found = result.issues.map((issue) => issue.rule_id)
  assert.ok(found.includes('attachment.colon'), '应报出附件标签半角冒号')
  assert.ok(found.includes('cc.colon'), '应报出抄送标签半角冒号')
  assert.match(result.fixedContent, /附件：任务分解表/)
  assert.match(result.fixedContent, /抄送：市政府办公室。/)
  const recheck = analyzeDocument(result.fixedContent, '通知')
  assert.ok(!recheck.issues.some((issue) => issue.rule_id.endsWith('.colon')))
})

test('半角括号且紧跟文字的二级标题被修复且幂等', () => {
  const content = '关于开展专项检查的通知\n各县（市）区人民政府：\n(一)工作目标\n请认真落实。\n某市人民政府\n2026年11月16日'
  const once = analyzeDocument(content, '通知')
  assert.ok(once.issues.some((issue) => issue.rule_id === 'heading.numbering' && issue.auto_fixed))
  assert.ok(once.fixedContent.includes('（一）工作目标'), '(一) 应改为 （一）')
  const twice = analyzeDocument(once.fixedContent, '通知')
  assert.ok(!twice.issues.some((issue) => issue.rule_id === 'heading.numbering'), '二次不应再报层次序数')
  assert.equal(twice.fixedContent, once.fixedContent, '修复应幂等')
})

test('附件说明块只在整体前补一次空行', () => {
  const content = '关于开展专项检查的通知\n各县（市）区人民政府：\n请认真落实。\n附件：目录\n附件1：任务清单\n附件2：统计表\n某市人民政府\n2026年11月16日'
  const fixed = fixDocument(parseDocument(content, '通知')).content
  const lines = fixed.split('\n')
  const first = lines.findIndex((line) => line.includes('附件：目录'))
  assert.ok(first > 0)
  assert.equal(lines[first - 1], '', '附件块整体前应空一行')
  assert.ok(lines[first + 1].includes('附件1：任务清单'))
  assert.ok(lines[first + 2].includes('附件2：统计表'))
  assert.ok(!fixed.includes('附件：目录\n\n附件1'), '附件1 前不应再插空行')
  assert.ok(!fixed.includes('附件1：任务清单\n\n附件2'), '附件2 前不应再插空行')
})
