import assert from 'node:assert/strict'
import test from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import { analyzeDocument } from '../src/core/analyze.js'
import { buildDocx } from '../src/core/docx.js'

const SAMPLE = `福州市人民政府办公厅关于开展安全生产大检查的通知
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

function readZip(buffer) {
  const files = unzipSync(new Uint8Array(buffer))
  const read = (name) => strFromU8(files[name])
  return { files, read }
}

test('导出的 docx 是合法 zip，含 document/footer/settings', async () => {
  const fixed = analyzeDocument(SAMPLE, '通知').fixedContent
  const buffer = await buildDocx(fixed, '通知')
  assert.ok(buffer.length > 5000)
  const { files } = readZip(buffer)
  for (const name of ['word/document.xml', 'word/footer1.xml', 'word/footer2.xml', 'word/settings.xml', '[Content_Types].xml']) {
    assert.ok(files[name], `缺少 ${name}`)
  }
})

test('字体、字号与行距符合版式设置', async () => {
  const fixed = analyzeDocument(SAMPLE, '通知').fixedContent
  const buffer = await buildDocx(fixed, '通知')
  const xml = readZip(buffer).read('word/document.xml')
  assert.ok(xml.includes('仿宋_GB2312'), '正文应使用仿宋_GB2312')
  assert.ok(xml.includes('小标宋体'), '标题应使用小标宋体')
  assert.ok(xml.includes('黑体'), '一级标题应使用黑体')
  assert.ok(xml.includes('楷体_GB2312'), '二级标题应使用楷体_GB2312')
  assert.match(xml, /w:line="560"/)
  assert.match(xml, /w:lineRule="exact"/)
  assert.match(xml, /w:sz w:val="44"/)
  assert.match(xml, /w:sz w:val="32"/)
})

test('标题居中、正文首行缩进、成文日期右空四字', async () => {
  const fixed = analyzeDocument(SAMPLE, '通知').fixedContent
  const buffer = await buildDocx(fixed, '通知')
  const xml = readZip(buffer).read('word/document.xml')
  assert.match(xml, /w:jc w:val="center"/)
  assert.match(xml, /w:firstLine="640"/)
  assert.match(xml, /w:right="1280"/)
})

test('A4 版心与页边距写入 sectPr', async () => {
  const fixed = analyzeDocument(SAMPLE, '通知').fixedContent
  const buffer = await buildDocx(fixed, '通知')
  const xml = readZip(buffer).read('word/document.xml')
  assert.match(xml, /w:pgSz w:w="11906" w:h="16838"/)
  assert.match(xml, /w:top="2098"/)
  assert.match(xml, /w:bottom="1984"/)
  assert.match(xml, /w:left="1588"/)
  assert.match(xml, /w:right="1474"/)
})

test('页码域存在，单页右、双页左，并启用奇偶页', async () => {
  const fixed = analyzeDocument(SAMPLE, '通知').fixedContent
  const buffer = await buildDocx(fixed, '通知')
  const { read } = readZip(buffer)
  const odd = read('word/footer1.xml')
  const even = read('word/footer2.xml')
  const settings = read('word/settings.xml')
  assert.ok(odd.includes('PAGE'), '页码字段应存在')
  assert.ok(even.includes('PAGE'))
  assert.match(odd, /w:jc w:val="end"/)
  assert.match(even, /w:jc w:val="start"/)
  assert.ok(settings.includes('evenAndOddHeaders'), '应启用奇偶页不同页脚')
})

test('正文内容完整写入且不含 Markdown 标题符号', async () => {
  const fixed = analyzeDocument(SAMPLE, '通知').fixedContent
  const buffer = await buildDocx(fixed, '通知')
  const xml = readZip(buffer).read('word/document.xml')
  assert.ok(xml.includes('为深入排查安全隐患'))
  assert.ok(xml.includes('安全生产检查表'))
  assert.ok(!xml.includes('##'))
})
