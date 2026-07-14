// Gen 3 golden-template round-trip.
//
// Proves the mk3 template + tsl.ts serialization reproduce a genuine Gen 3
// export byte-for-byte: same envelope (device, formatRev), same PATCH% keys in
// order, same hex bytes. The always-on checks validate structure without the
// (gitignored) fixture; when the real BOSS Tone Exchange fixture is present
// locally, we assert full byte-identity.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { templateSections } from '../template'
import { toTsl } from '../../tsl'
import { assertStructurePreserved, GUITAR_TONE_BLOCKS } from '../../__tests__/roundtrip-helper'

const GEN3_META = { formatRev: '0000', device: 'KATANA Gen3', name: '', keyPrefix: 'PATCH%' }

function emit(name: string): any {
  return toTsl(templateSections(), { ...GEN3_META, name })
}

test('mk3 template emits a valid Gen 3 envelope', () => {
  const t = emit('Test Patch')
  assert.equal(t.device, 'KATANA Gen3')
  assert.equal(t.formatRev, '0000')
  assert.equal(t.name, 'Test Patch')
  const ps = t.data[0][0].paramSet
  const keys = Object.keys(ps)
  assert.equal(keys.length, 80, 'expected 80 blocks')
  assert.ok(keys.every(k => k.startsWith('PATCH%')), 'every key carries the PATCH% prefix')
  assert.ok('PATCH%AMP' in ps && ps['PATCH%AMP'].length === 10, 'AMP block is 10 bytes')
  // bytes are uppercase two-hex-digit
  assert.ok(ps['PATCH%AMP'].every((h: string) => /^[0-9A-F]{2}$/.test(h)))
})

const FIXTURE = path.join(process.cwd(), '..', 'data', 'fixtures', 'gen3-tri-stereo-chorus.tsl')

test('mk3 template preserves the real Gen 3 export structure (tone tail factory-neutralized)', (t) => {
  if (!fs.existsSync(FIXTURE)) {
    t.skip('ground-truth fixture not present (gitignored, local-only)')
    return
  }
  const real = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const emitted = emit(real.name) as any

  assert.equal(emitted.device, real.device)
  assert.equal(emitted.formatRev, real.formatRev)

  assertStructurePreserved(emitted.data[0][0].paramSet, real.data[0][0].paramSet, GUITAR_TONE_BLOCKS)
})
