/**
 * 构建：把 host 入口与 docx 一并打包成单文件 ESM，供 DSH loader 直接加载。
 * @deepseek-ai/* 与 schemastery 保持 external，交给宿主运行时提供。
 * 产物 minify、去掉第三方 legal comments，docx/fflate 仍内联，可离线运行。
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['src/host/index.js'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  external: ['@deepseek-ai/*', '@deepseek-ai/schemastery', 'node:*'],
  logLevel: 'info',
})
