/**
 * 导出路径解析：展开 ~、相对路径落到 CWD、同名文件自动追加序号不覆盖。
 *
 * 默认文件名用系统本地时间（含毫秒），避免同一秒内多次导出撞名。
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

function pad(value, width = 2) {
  return String(value).padStart(width, '0')
}

/** 本地时间 YYYYMMDDHHmmssSSS。 */
export function localFileStamp(now = new Date()) {
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    pad(now.getMilliseconds(), 3),
  ].join('')
}

/** 只展开以 ~/、~\ 或单独的 ~ 开头的路径；返回绝对路径。 */
export function expandHome(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!(trimmed === '~' || /^~[\\/]/.test(trimmed))) return trimmed
  const rest = trimmed.replace(/^~[\\/]?/, '')
  return path.resolve(homedir(), rest)
}

/** 已存在时追加 (1)、(2)……，绝不静默覆盖。 */
export function uniqueFilePath(target) {
  if (!existsSync(target)) return target
  const ext = path.extname(target)
  const base = ext ? target.slice(0, -ext.length) : target
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base}(${i})${ext}`
    if (!existsSync(candidate)) return candidate
  }
  throw new Error(`同名文件过多，无法为 ${target} 生成新的文件名。`)
}

/**
 * @param {string} requestedPath 用户传入的 output_path
 * @param {string} configuredDir 插件配置的 outputDir
 * @param {string} docType 文种
 * @param {Date} now 用于生成默认文件名的时间
 * @returns {string} 绝对路径
 */
export function resolveTargetFile(requestedPath, configuredDir, docType, now = new Date()) {
  const filename = `公文-${docType}-${localFileStamp(now)}.docx`
  const requested = expandHome(requestedPath)
  const baseDir = expandHome(configuredDir) || process.cwd()

  let target
  if (requested) {
    target = requested.toLowerCase().endsWith('.docx')
      ? path.resolve(requested)
      : path.resolve(requested, filename)
  } else {
    target = path.resolve(baseDir, filename)
  }
  return uniqueFilePath(target)
}
