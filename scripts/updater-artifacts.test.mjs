import { readFileSync } from 'node:fs'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { createManifest, verifyUpdaterArtifact } from './updater-artifacts.mjs'
const fixture = JSON.parse(
  readFileSync(new URL('../tests/fixtures/updater-signature.json', import.meta.url), 'utf8'),
)
const options = {
  version: fixture.version,
  signature: fixture.signature,
  pubkey: fixture.publicKey,
  bytes: Buffer.from(fixture.payload),
}
// Ephemeral test-only key; exercise signed RC metadata without using release secrets.
function signedRc() {
  const version = '0.1.3-rc.1'
  const bytes = Buffer.from('test RC installer')
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const keyId = Buffer.alloc(8, 1)
  const rawKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
  const signature = sign(null, createHash('blake2b512').update(bytes).digest(), privateKey)
  const comment = `timestamp:1\tversion:${version}`
  const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey)
  return {
    version,
    bytes,
    pubkey: Buffer.from(
      `untrusted comment: test key\n${Buffer.concat([Buffer.from('Ed'), keyId, rawKey]).toString('base64')}\n`,
    ).toString('base64'),
    signature: Buffer.from(
      `untrusted comment: test signature\n${Buffer.concat([Buffer.from('ED'), keyId, signature]).toString('base64')}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`,
    ).toString('base64'),
  }
}
describe('updater release artifacts', () => {
  it('requires an explicit opt-in for an RC and verifies its signed version', () => {
    const rc = signedRc()
    expect(() => createManifest(rc)).toThrow(/explicitly enabled/)
    const manifest = createManifest({ ...rc, allowPrerelease: true })
    expect(manifest.version).toBe('0.1.3-rc.1')
    expect(manifest.platforms['windows-x86_64'].url).toContain('/v0.1.3-rc.1/')
    expect(() => createManifest({ ...rc, allowPrerelease: true, version: '0.1.3-rc.2' })).toThrow(
      /Signed version/,
    )
    expect(() =>
      createManifest({ ...rc, allowPrerelease: true, bytes: Buffer.from('modified') }),
    ).toThrow(/verification/)
  })
  it.each(['0.1.3-rc.01', '0.1.3-rc.0', '0.1.3-beta', 'v0.1.3-rc.1', '0.1.3-rc.1/evil'])(
    'rejects unsupported or malformed RC version %s',
    (version) => {
      expect(() => createManifest({ ...options, allowPrerelease: true, version })).toThrow(
        /Only stable/,
      )
    },
  )
  it('verifies an actual Tauri CLI signature and generates the Windows update endpoint', () => {
    const manifest = createManifest(options)
    expect(manifest.platforms['windows-x86_64'].url).toBe(
      'https://github.com/UoMiss/aram-mayhem/releases/download/v2.0.0/aram-mayhem-windows-x64-setup.exe',
    )
    expect(manifest.platforms['windows-x86_64'].signature).toBe(fixture.signature)
  })
  it('rejects modified bytes, signed metadata tampering and a relabeled version', () => {
    expect(() => createManifest({ ...options, bytes: Buffer.from('corrupt') })).toThrow(
      /verification/,
    )
    expect(() => createManifest({ ...options, version: '3.0.0' })).toThrow(/version/)
    expect(() => createManifest({ ...options, version: '2.0.0-beta' })).toThrow(/stable/)
    const signature = Buffer.from(
      Buffer.from(fixture.signature, 'base64').toString().replace('version:2.0.0', 'version:3.0.0'),
    ).toString('base64')
    expect(() =>
      verifyUpdaterArtifact(options.bytes, signature, fixture.publicKey, '3.0.0'),
    ).toThrow(/verification/)
  })
})
