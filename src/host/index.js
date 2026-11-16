/**
 * Host 侧入口：注册 gov_doc_check 工具。
 *
 * 只做格式预检与导出，不生成正文、不伪造发文机关或日期、不调用任何外部 API。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { analyzeDocument } from '../core/analyze.js'
import { buildDocx } from '../core/docx.js'
import { DOC_TYPES } from '../core/parse.js'
import { EXPORT_RULES, EXPORT_SPEC } from '../core/rules.js'

export const name = 'gov-doc-router'
export const inject = ['tools']

export const Config = z.object({
  /** .docx 输出目录；留空表示当前工作目录。 */
  outputDir: z.string().default(''),
})

function normalizeOutputDir(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('~')) return path.join(homedir(), trimmed.slice(1) || '')
  return trimmed
}

function resolveTargetFile(requestedPath, configuredDir, docType) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const filename = `公文-${docType}-${stamp}.docx`
  const baseDir = normalizeOutputDir(configuredDir) || process.cwd()
  if (typeof requestedPath === 'string' && requestedPath.trim()) {
    const candidate = requestedPath.trim()
    if (candidate.toLowerCase().endsWith('.docx')) {
      return path.resolve(candidate)
    }
    return path.resolve(candidate, filename)
  }
  return path.resolve(baseDir, filename)
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    doc_type: { type: 'string', enum: DOC_TYPES },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rule_id: { type: 'string' },
          severity: { type: 'string', enum: ['error', 'warning'] },
          description: { type: 'string' },
          location: { type: 'string' },
          auto_fixed: { type: 'boolean' },
        },
      },
    },
    fixed_content: { type: 'string' },
    fix_summary: { type: 'array', items: { type: 'string' } },
    download_url: { type: 'string' },
    applied_export_rules: { type: 'array', items: { type: 'string' } },
    stats: {
      type: 'object',
      additionalProperties: false,
      properties: {
        characters: { type: 'number' },
        lines: { type: 'number' },
        issues: { type: 'number' },
        auto_fixed: { type: 'number' },
      },
    },
  },
}

function renderResult(args, value) {
  const lines = [
    `公文格式预检（${value.doc_type}）：${value.issues.length} 个问题，已自动修复 ${value.stats.auto_fixed} 个。`,
    `导出文件：${value.download_url}`,
  ]
  for (const issue of value.issues) {
    lines.push(`- [${issue.severity}] ${issue.rule_id} @ ${issue.location}：${issue.description}${issue.auto_fixed ? '（已自动修复）' : ''}`)
  }
  if (value.fix_summary.length) {
    lines.push('修改清单：')
    for (const item of value.fix_summary) lines.push(`- ${item}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

export function apply(ctx, config) {
  let current = config && typeof config === 'object' ? config : {}

  ctx.tools.register(
    defineTool({
      name: 'gov_doc_check',
      description:
        'Check a Chinese government document draft against high-frequency GB/T 9704 formatting rules, auto-fix what can be fixed without inventing content, and export a .docx with the official layout. Covers title, document number, recipient, body indentation, attachment notes, signature/date, CC line, heading numbering, plus title/body/heading fonts, fixed 28pt line spacing and odd/even page numbers at export. Never generates document content or fabricates organization names or dates.',
      parameters: {
        content: {
          type: 'string',
          required: true,
          description: '公文草稿正文，接受纯文本或 Markdown。标题、发文字号、主送机关、正文、附件说明、落款、抄送按行识别。',
        },
        doc_type: {
          type: 'string',
          required: true,
          enum: DOC_TYPES,
          description: '文种：请示 / 报告 / 通知 / 函 / 纪要 / 通报。用于校验标题是否含文种，并写入导出文件名。',
        },
        output_path: {
          type: 'string',
          description: '可选。以 .docx 结尾视为完整文件路径，否则视为输出目录；留空则使用插件配置 outputDir（默认当前工作目录）。',
        },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: renderResult,
      },
      async execute(args) {
        if (!args.content || !args.content.trim()) {
          throw new Error('content 为空：请传入公文草稿正文。')
        }
        const analysis = analyzeDocument(args.content, args.doc_type)
        const target = resolveTargetFile(args.output_path, current.outputDir, analysis.docType)
        try {
          await mkdir(path.dirname(target), { recursive: true })
          const buffer = await buildDocx(analysis.fixedContent, analysis.docType)
          await writeFile(target, buffer)
        } catch (error) {
          throw new Error(`导出 .docx 失败：${error instanceof Error ? error.message : String(error)}（目标路径：${target}）`)
        }

        return {
          doc_type: analysis.docType,
          issues: analysis.issues,
          fixed_content: analysis.fixedContent,
          fix_summary: analysis.fixSummary,
          download_url: target.replace(/\\/g, '/'),
          applied_export_rules: EXPORT_RULES.map((rule) => rule.id),
          stats: {
            characters: Array.from(args.content).length,
            lines: args.content.split(/\r?\n/).length,
            issues: analysis.issues.length,
            auto_fixed: analysis.issues.filter((issue) => issue.auto_fixed).length,
          },
        }
      },
    }),
  )
}

export { EXPORT_SPEC }
