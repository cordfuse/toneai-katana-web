// KATANA:GO template round-trip: the golden template, emitted through toTsl with
// the GO envelope, reproduces the real guitar-mode patch's block map
// byte-for-byte. Proves the section map + envelope + PATCH% key-prefix handling.
//
// The fixture is a gitignored third-party pack; skip cleanly when absent (CI).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { templateSections, TEMPLATE_ORDER } from '../template'
import { toTsl } from '../../tsl'
import { GO_AMP_TYPES, GO_REVERB_TYPES } from '../enums'

const GO_META = { formatRev: '0000', device: 'KATANA:GO_guitarmode', name: '', keyPrefix: 'PATCH%' }
const FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/katana-go-rock-tones.tsl')

test('GO template is a 30-block PATCH% section map', () => {
  const s = templateSections()
  assert.equal(TEMPLATE_ORDER.length, 30)
  assert.equal(TEMPLATE_ORDER[0], 'COM')
  assert.equal(s.get('AMP')!.length, 14)
  assert.equal(s.get('SW')!.length, 7)
})

test('GO envelope: device guitarmode, formatRev 0000, PATCH% keys', () => {
  const t = toTsl(templateSections(), { ...GO_META, name: 'X' }) as any
  assert.equal(t.device, 'KATANA:GO_guitarmode')
  assert.equal(t.formatRev, '0000')
  const ps = t.data[0][0].paramSet
  assert.ok(Object.keys(ps).every(k => k.startsWith('PATCH%')))
  assert.equal(ps['PATCH%COM'].length, 20)
})

test('enum orderings match the verified conversion map', () => {
  assert.deepEqual([...GO_AMP_TYPES], ['ACOUSTIC', 'CLEAN', 'CRUNCH', 'LEAD', 'BROWN'])
  assert.equal(GO_REVERB_TYPES[0], 'PLATE')   // GO puts PLATE first (unlike Gen 3)
  assert.equal(GO_REVERB_TYPES[2], 'HALL')
})

test('template round-trips the real GO patch byte-for-byte', { skip: !fs.existsSync(FIXTURE) && 'fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const golden = fixture.data[0][0].paramSet
  const emitted = (toTsl(templateSections(), { ...GO_META, name: 'X' }) as any).data[0][0].paramSet
  assert.deepEqual(Object.keys(emitted), Object.keys(golden), 'same block keys, same order')
  for (const k of Object.keys(golden)) {
    assert.deepEqual(emitted[k], golden[k], `block ${k} bytes equal`)
  }
})
