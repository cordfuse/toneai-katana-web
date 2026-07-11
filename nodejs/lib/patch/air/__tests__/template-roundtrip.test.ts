// KATANA Air template round-trip: the golden template, emitted through toTsl
// with the Air envelope, reproduces the real patch's User%Patch block
// byte-for-byte. Proves the flat-image + envelope + key-prefix handling.
//
// The fixture is a gitignored third-party pack; skip cleanly when absent (CI).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { templateSections, TEMPLATE_ORDER } from '../template'
import { toTsl } from '../../tsl'
import { AIR_FX_TYPES, AIR_REVERB_TYPES, AIR_BOOSTER_TYPES } from '../enums'

const AIR_META = { formatRev: '0000', device: 'KATANA-AIR', name: '', keyPrefix: 'User%' }
const FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/katana-air-rock-legend-vol1.tsl')

test('Air template is one flat 2335-byte Patch block', () => {
  const s = templateSections()
  assert.deepEqual([...TEMPLATE_ORDER], ['Patch'])
  assert.equal(s.get('Patch')!.length, 2335)
})

test('Air envelope: device KATANA-AIR, formatRev 0000, User%Patch key', () => {
  const t = toTsl(templateSections(), { ...AIR_META, name: 'X' }) as any
  assert.equal(t.device, 'KATANA-AIR')
  assert.equal(t.formatRev, '0000')
  const ps = t.data[0][0].paramSet
  assert.deepEqual(Object.keys(ps), ['User%Patch'])
  assert.equal(ps['User%Patch'].length, 2335)
})

test('enum indices match the verified fixture decode', () => {
  assert.equal(AIR_FX_TYPES[29], 'CHORUS')
  assert.equal(AIR_FX_TYPES[21], 'TREMOLO')
  assert.equal(AIR_BOOSTER_TYPES[11], 'OVERDRIVE')
  assert.equal(AIR_REVERB_TYPES[3], 'HALL')
  assert.equal(AIR_REVERB_TYPES[4], 'PLATE')
})

test('template round-trips the real Air patch byte-for-byte', { skip: !fs.existsSync(FIXTURE) && 'fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const golden = fixture.data[0][0].paramSet['User%Patch'] as string[]
  const emitted = (toTsl(templateSections(), { ...AIR_META, name: 'X' }) as any).data[0][0].paramSet['User%Patch'] as string[]
  assert.deepEqual(emitted, golden, 'emitted User%Patch equals the golden patch bytes')
})
