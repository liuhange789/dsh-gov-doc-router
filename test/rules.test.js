import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeDocument } from '../src/core/analyze.js'

/** 三份带预设错误的样本，覆盖 13 条文本规则里可稳定识别的项。 */
const REQUEST = `关于申请增拨办公经费的请示。
榕财[2025]08号
市财政局:
为保障日常办公需要，现申请增拨经费。
一、经费用途
（一）办公设备采购
1、打印设备更新
请予审批。
附件：经费预算表。
抄送：市政府办公室、市审计局
福州市发展和改革委员会
二〇二五年三月五日`

const NOTICE = `福州市人民政府办公厅关于开展安全生产大检查的通知。
福政发（2026）001号
各县（市）区人民政府:
为深入排查安全隐患，现将有关事项通知如下。
一、检查范围
（一）全市各类生产经营单位
1、重点行业领域
请各单位于12月10日前反馈。
附件：安全生产检查表。
抄送：市委办公室、市人大常委会办公厅
福州市人民政府办公厅
2026.11.16`

const REPORT = `关于2026年上半年工作总结的报告
闽政办〔2026〕12号
各设区市人民政府：
上半年各项工作稳步推进。
（一）经济运行情况
1.主要指标完成
附件1：工作总结
附件2：数据统计表；
抄送：省委办公厅,省人大常委会办公室
福建省人民政府办公厅
2026年7月15日`

const CLEAN = `福州市人民政府办公厅关于开展安全生产大检查的通知
福政发〔2026〕1号
各县（市）区人民政府：
　　为深入排查安全隐患，现将有关事项通知如下。
　　一、检查范围
　　（一）全市各类生产经营单位
　　1.重点行业领域
　　请各单位于12月10日前反馈。

　　附件：安全生产检查表
抄送：市委办公室，市人大常委会办公厅。
福州市人民政府办公厅
2026年11月16日`

const ids = (issues) => issues.map((issue) => issue.rule_id)

test('请示样本命中预设的 12 类问题', () => {
  const result = analyzeDocument(REQUEST, '请示')
  const found = ids(result.issues)
  for (const expected of [
    'title.punctuation',
    'docnum.brackets',
    'docnum.serial',
    'date.format',
    'recipient.colon',
    'attachment.spacing',
    'attachment.punctuation',
    'cc.format',
    'heading.numbering',
    'body.indent',
  ]) {
    assert.ok(found.includes(expected), `缺少规则 ${expected}，实际为 ${found.join(', ')}`)
  }
  assert.equal(result.docType, '请示')
})

test('通知样本命中发文字号与日期问题', () => {
  const result = analyzeDocument(NOTICE, '通知')
  const found = ids(result.issues)
  assert.ok(found.includes('docnum.brackets'))
  assert.ok(found.includes('docnum.serial'))
  assert.ok(found.includes('date.format'))
  assert.ok(found.includes('recipient.colon'))
})

test('报告样本命中附件与抄送问题', () => {
  const result = analyzeDocument(REPORT, '报告')
  const found = ids(result.issues)
  assert.ok(found.includes('attachment.punctuation'))
  assert.ok(found.includes('cc.format'))
  assert.ok(!found.includes('date.format'), '2026年7月15日 已是规范格式')
  assert.ok(!found.includes('docnum.brackets'), '〔〕 已是规范括号')
})

test('规范样本不产生误报', () => {
  const result = analyzeDocument(CLEAN, '通知')
  assert.deepEqual(result.issues, [])
})

test('缺少标题时给出 error 且不伪造标题', () => {
  const result = analyzeDocument('各县（市）区人民政府：\n请认真落实。\n某市人民政府\n2026年1月1日', '通知')
  assert.ok(ids(result.issues).includes('title.present'))
  assert.ok(!result.fixedContent.includes('关于'), '修复不应凭空生成标题')
})

test('标题不含文种时给 warning，且不修改标题', () => {
  const result = analyzeDocument('关于开展专项检查的安排\n各县（市）区人民政府：\n　　请认真落实。\n某市人民政府\n2026年1月1日', '通知')
  const issue = result.issues.find((item) => item.rule_id === 'title.doc-type')
  assert.ok(issue, '应提示标题缺少文种')
  assert.equal(issue.severity, 'warning')
  assert.ok(result.fixedContent.startsWith('关于开展专项检查的安排'), '不应硬塞文种')
})

test('没有成文日期时 signature.block 报 error', () => {
  const result = analyzeDocument('某市人民政府\n关于开展检查的通知\n各县（市）区人民政府：\n　　请认真落实。', '通知')
  assert.ok(ids(result.issues).includes('signature.block'))
})

test('问题对象字段完整且可定位', () => {
  const result = analyzeDocument(REQUEST, '请示')
  for (const issue of result.issues) {
    assert.equal(typeof issue.rule_id, 'string')
    assert.ok(['error', 'warning'].includes(issue.severity))
    assert.equal(typeof issue.description, 'string')
    assert.match(issue.location, /第 \d+ 行/)
    assert.equal(typeof issue.auto_fixed, 'boolean')
  }
})

test('非法文种回落为通知', () => {
  const result = analyzeDocument(CLEAN, '不存在的文种')
  assert.equal(result.docType, '通知')
})
