import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/source-manifest.json'), 'utf8'))
const source = readFileSync(resolve(root, manifest.source))
const sha = createHash('sha256').update(source).digest('hex')
if (sha !== manifest.sha256 || source.length !== manifest.bytes) {
  console.error('❌ 原始 HTML 基线被改动。请还原 references/deepseek.original.html。')
  process.exit(1)
}
console.log('✅ 原始 HTML 基线完整，SHA-256：' + sha)
