import { readFileSync } from 'node:fs'
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
describe('updater release artifacts', () => {
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
