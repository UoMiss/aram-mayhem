import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const installerName = 'aram-mayhem-windows-x64-setup.exe'

// Tauri wraps Minisign text in base64. Verify both the artifact and the trusted
// comment (which binds its version), using Node's built-in Ed25519 implementation.
export function verifyUpdaterArtifact(bytes, signature, pubkey, version) {
  const keyLines = Buffer.from(pubkey.trim(), 'base64').toString('utf8').trim().split(/\r?\n/)
  const lines = Buffer.from(signature.trim(), 'base64').toString('utf8').trim().split(/\r?\n/)
  if (keyLines.length !== 2 || lines.length !== 4 || !lines[2].startsWith('trusted comment: '))
    throw Error('Invalid updater signature format')
  const key = Buffer.from(keyLines[1], 'base64')
  const signed = Buffer.from(lines[1], 'base64')
  const global = Buffer.from(lines[3], 'base64')
  if (
    key.length !== 42 ||
    signed.length !== 74 ||
    global.length !== 64 ||
    key.subarray(0, 2).toString() !== 'Ed' ||
    signed.subarray(0, 2).toString() !== 'ED' ||
    !key.subarray(2, 10).equals(signed.subarray(2, 10))
  )
    throw Error('Updater signing key or algorithm mismatch')
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]),
    format: 'der',
    type: 'spki',
  })
  const comment = lines[2].slice('trusted comment: '.length)
  if (
    !verify(
      null,
      createHash('blake2b512').update(bytes).digest(),
      publicKey,
      signed.subarray(10),
    ) ||
    !verify(null, Buffer.concat([signed.subarray(10), Buffer.from(comment)]), publicKey, global)
  )
    throw Error('Updater signature verification failed')
  const signedVersions = comment.split('\t').filter((field) => field.startsWith('version:'))
  if (signedVersions.length !== 1 || signedVersions[0] !== `version:${version}`)
    throw Error('Signed version does not match the release')
}

export function createManifest({
  version,
  signature,
  bytes,
  pubkey,
  notes = '',
  date = new Date().toISOString(),
}) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw Error('Only stable SemVer releases are supported')
  verifyUpdaterArtifact(bytes, signature, pubkey, version)
  return {
    version,
    notes,
    pub_date: date,
    platforms: {
      'windows-x86_64': {
        signature: signature.trim(),
        url: `https://github.com/UoMiss/aram-mayhem/releases/download/v${version}/${installerName}`,
      },
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const folder = resolve(process.argv[2] ?? '.')
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1]
  if (pkg.version !== config.version || cargo !== config.version)
    throw Error('Application versions must match before publishing')
  const manifest = createManifest({
    version: config.version,
    signature: readFileSync(resolve(folder, `${installerName}.sig`), 'utf8'),
    bytes: readFileSync(resolve(folder, installerName)),
    pubkey: config.plugins.updater.pubkey,
    notes: `ARAM Mayhem ${config.version}`,
  })
  writeFileSync(resolve(folder, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Verified signed Windows update and generated latest.json for ${config.version}`)
}
