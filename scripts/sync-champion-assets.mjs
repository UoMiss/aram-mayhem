import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = resolve(root, 'src/assets/champions')
const catalogPath = resolve(directory, 'catalog.json')
let previous = null
try {
  previous = JSON.parse(await readFile(catalogPath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const versionIndex = process.argv.indexOf('--version')
const latest = process.argv.includes('--latest')
const refresh = process.argv.includes('--refresh')
if (latest && versionIndex !== -1) throw new Error('--latest and --version are mutually exclusive')
const versions = latest
  ? JSON.parse(
      (await download('https://ddragon.leagueoflegends.com/api/versions.json')).toString('utf8'),
    )
  : null
const version = latest
  ? versions?.[0]
  : versionIndex === -1
    ? previous?.version
    : process.argv[versionIndex + 1]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  throw new Error('Specify a Data Dragon version or use --latest')
}
const base = `https://ddragon.leagueoflegends.com/cdn/${version}`
async function download(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (attempt >= 2) throw error
    }
  }
}
const roster = JSON.parse((await download(`${base}/data/zh_CN/champion.json`)).toString('utf8'))
if (roster.version !== version || !roster.data || typeof roster.data !== 'object')
  throw new Error('Invalid champion roster')
const entries = Object.values(roster.data)
  .map((champion) => {
    const id = Number(champion.key)
    const file = champion.image?.full
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !/^[A-Za-z0-9]+\.png$/.test(file ?? '') ||
      typeof champion.name !== 'string'
    ) {
      throw new Error('Invalid champion metadata')
    }
    return {
      id,
      alias: champion.id,
      name: champion.title?.trim() || champion.name,
      title: champion.name,
      file,
    }
  })
  .sort((a, b) => a.id - b.id)
if (
  entries.length < 100 ||
  new Set(entries.map((entry) => entry.id)).size !== entries.length ||
  new Set(entries.map((entry) => entry.file)).size !== entries.length
) {
  throw new Error('Champion roster is incomplete or contains duplicates')
}
await mkdir(directory, { recursive: true })
let downloaded = 0
let next = 0
const champions = new Array(entries.length)
function validatePng(bytes, file) {
  if (
    bytes.length < 24 ||
    bytes.length > 1024 * 1024 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.readUInt32BE(16) !== bytes.readUInt32BE(20) ||
    bytes.readUInt32BE(16) < 64 ||
    bytes.readUInt32BE(16) > 512
  ) {
    throw new Error(`Invalid square champion PNG: ${file}`)
  }
}
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < entries.length) {
      const index = next++
      const entry = entries[index]
      const path = resolve(directory, entry.file)
      let bytes = null
      const recorded = previous?.champions?.find((item) => item.id === entry.id)
      if (!refresh && recorded?.imageVersion === version) {
        try {
          const existing = await readFile(path)
          validatePng(existing, entry.file)
          if (createHash('sha256').update(existing).digest('hex') === recorded.sha256)
            bytes = existing
        } catch (error) {
          if (error.code && error.code !== 'ENOENT') throw error
        }
      }
      if (!bytes) {
        bytes = await download(`${base}/img/champion/${entry.file}`)
        validatePng(bytes, entry.file)
        await writeFile(path, bytes)
        downloaded++
      }
      validatePng(bytes, entry.file)
      champions[index] = {
        ...entry,
        imageVersion: version,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    }
  }),
)
await writeFile(
  catalogPath,
  `${JSON.stringify({ version, locale: 'zh_CN', source: 'https://ddragon.leagueoflegends.com', latestVersion: latest ? version : (previous?.latestVersion ?? null), latestCheckedAt: latest ? new Date().toISOString() : (previous?.latestCheckedAt ?? null), champions }, null, 2)}\n`,
)
console.log(
  `Champion assets ready: ${champions.length}; downloaded ${downloaded}; preserved ${champions.length - downloaded}; Data Dragon ${version}`,
)
