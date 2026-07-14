// KATANA BASS template round-trip: the golden template, emitted through toTsl
// with the KATANA BASS envelope, reproduces the real patch's block map
// byte-for-byte. Proves the 34-block section map + envelope + UserPatch% prefix.
//
// The fixture is a gitignored third-party pack; skip cleanly when absent (CI).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { templateSections, TEMPLATE_ORDER } from '../template'
import { toTsl } from '../../tsl'
import { BASS_AMP_TYPES, BASS_DELAY_TYPES, BASS_REVERB_TYPES } from '../enums'
import { assertStructurePreserved, BASS_TONE_BLOCKS } from '../../__tests__/roundtrip-helper'

const BASS_META = { formatRev: '0000', device: 'KATANA BASS', name: '', keyPrefix: 'UserPatch%' }
const FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/katana-bass-alex-hutchings.tsl')

test('KATANA BASS template is a 34-block UserPatch% section map', () => {
  const s = templateSections()
  assert.equal(TEMPLATE_ORDER.length, 34)
  assert.equal(TEMPLATE_ORDER[0], 'PatchName')
  assert.equal(TEMPLATE_ORDER[1], 'Knob')
  assert.equal(TEMPLATE_ORDER[2], 'SelColorSw')
  assert.ok(s.has('Fx2(1)'))
  assert.ok(s.has('DelayDetail'))
  assert.ok(s.has('ReverbDetail'))
})

test('KATANA BASS envelope: device "KATANA BASS", formatRev 0000, UserPatch% keys', () => {
  const t = toTsl(templateSections(), { ...BASS_META, name: 'X' }) as any
  assert.equal(t.device, 'KATANA BASS')
  assert.equal(t.formatRev, '0000')
  const ps = t.data[0][0].paramSet
  assert.ok(Object.keys(ps).every(k => k.startsWith('UserPatch%')))
})

test('enum orderings match the extracted tables', () => {
  assert.deepEqual([...BASS_AMP_TYPES], ['VINTAGE', 'MODERN'])
  assert.equal(BASS_DELAY_TYPES[0], 'DIGITAL')
  assert.equal(BASS_DELAY_TYPES[1], 'ANALOG')
  assert.equal(BASS_REVERB_TYPES[0], 'PLATE')
  assert.equal(BASS_REVERB_TYPES[2], 'HALL')
})

test('template preserves the real KATANA BASS patch structure (tone tail factory-neutralized)', { skip: !fs.existsSync(FIXTURE) && 'fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const golden = fixture.data[0][0].paramSet  // "Classic Bass"
  const emitted = (toTsl(templateSections(), { ...BASS_META, name: 'X' }) as any).data[0][0].paramSet
  assertStructurePreserved(emitted, golden, BASS_TONE_BLOCKS)
})
