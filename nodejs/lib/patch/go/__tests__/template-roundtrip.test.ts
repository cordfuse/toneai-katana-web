// KATANA:GO template round-trip: the golden template, emitted through toTsl with
// the GO envelope, reproduces the real guitar-mode patch's block map
// byte-for-byte. Proves the section map + envelope + PATCH% key-prefix handling.
//
// The fixture is a gitignored third-party pack; skip cleanly when absent (CI).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { templateSections, bassTemplateSections, TEMPLATE_ORDER } from '../template'
import { toTsl } from '../../tsl'
import { GO_AMP_TYPES, GO_REVERB_TYPES } from '../enums'
import { assertStructurePreserved, GUITAR_TONE_BLOCKS } from '../../__tests__/roundtrip-helper'

const GO_META = { formatRev: '0000', device: 'KATANA:GO_guitarmode', name: '', keyPrefix: 'PATCH%' }
const BASS_META = { formatRev: '0000', device: 'KATANA:GO_bassmode', name: '', keyPrefix: 'PATCH%' }
const FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/katana-go-rock-tones.tsl')
const BASS_FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/katana-go-bass-tones.tsl')

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

test('template preserves the real GO patch structure (tone tail factory-neutralized)', { skip: !fs.existsSync(FIXTURE) && 'fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const golden = fixture.data[0][0].paramSet
  const emitted = (toTsl(templateSections(), { ...GO_META, name: 'X' }) as any).data[0][0].paramSet
  assertStructurePreserved(emitted, golden, GUITAR_TONE_BLOCKS)
})

test('bass template preserves the real GO bass patch structure (tone tail factory-neutralized)', { skip: !fs.existsSync(BASS_FIXTURE) && 'bass fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(BASS_FIXTURE, 'utf8'))
  const golden = fixture.data[0][0].paramSet  // "MONO SLOW PAD"
  const emitted = (toTsl(bassTemplateSections(), { ...BASS_META, name: 'X' }) as any).data[0][0].paramSet
  assertStructurePreserved(emitted, golden, GUITAR_TONE_BLOCKS)
})

test('bass amp voices decode at bytes 5-7 across the real bank', { skip: !fs.existsSync(BASS_FIXTURE) && 'bass fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(BASS_FIXTURE, 'utf8'))
  for (const p of fixture.data[0]) {
    const ampType = parseInt(p.paramSet['PATCH%AMP'][12], 16)
    assert.ok(ampType >= 5 && ampType <= 7, `bass amp type ${ampType} in 5..7`)
  }
})
