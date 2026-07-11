// Cross-device conversion: names translate to valid target vocabulary, numerics
// survive untouched, effects with no counterpart drop cleanly, and the rendered
// .tsl is a structurally valid liveset for the target generation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convertIntent, convertTone, canConvert } from '../convert'
import { vocabForDevice } from '../vocab'
import type { TonePatch } from '../intent'

const mk2Patch: TonePatch = {
  name: 'Brown Test',
  ampA: { type: 'Bogner Uber', gain: 80, bass: 50, middle: 60, treble: 65, presence: 55, level: 75 },
  booster: { on: true, type: 'T-Scream', drive: 60, tone: 50, level: 55 },
  fx1: { on: true, type: 'Phaser', rate: 40, depth: 55, reso: 30, level: 50 },
  fx2: { on: true, type: 'Tera Echo', level: 40 }, // MkII-only — no Gen 3 equivalent
  delay: { on: true, type: 'Analog', timeMs: 380, feedback: 30, level: 35 },
  reverb: { on: true, type: 'Plate', timeS: 1.8, level: 25 },
}

test('canConvert only across proven, distinct generations', () => {
  assert.equal(canConvert('katana-mk2', 'katana-mk3'), true)
  assert.equal(canConvert('katana-mk3', 'katana-mk2'), true)
  assert.equal(canConvert('katana-mk2', 'katana-mk2'), false, 'same device')
  assert.equal(canConvert('katana-mk2', 'katana-go'), false, 'GO has no writer')
})

test('MkII -> Gen 3: names land in the Gen 3 vocabulary', () => {
  const v3 = vocabForDevice('katana-mk3')
  const { patch, notes } = convertIntent(mk2Patch, 'katana-mk2', 'katana-mk3')

  assert.equal(patch.ampA.type, 'BROWN', 'Bogner Uber -> BROWN character')
  assert.ok(v3.amps.includes(patch.ampA.type))
  assert.equal(patch.booster.type, 'T-SCREAM', 'booster matched by normalized name')
  assert.ok(v3.boosters.includes(patch.booster.type))
  assert.equal(patch.fx1!.type, 'PHASER')
  assert.ok(v3.fx.includes(patch.fx1!.type))
  // Tera Echo has no Gen 3 counterpart -> slot off, note recorded.
  assert.equal(patch.fx2!.on, false, 'Tera Echo dropped')
  assert.ok(notes.some(n => n.field === 'FX 2' && n.to === null))
  assert.ok(v3.delays.includes(patch.delay.type), 'Analog -> ANALOG')
  assert.ok(v3.reverbs.includes(patch.reverb.type), 'Plate -> PLATE')
})

test('numerics are carried across unchanged', () => {
  const { patch } = convertIntent(mk2Patch, 'katana-mk2', 'katana-mk3')
  assert.equal(patch.ampA.gain, 80)
  assert.equal(patch.ampA.middle, 60)
  assert.equal(patch.ampA.level, 75)
  assert.equal(patch.booster.drive, 60)
  assert.equal(patch.delay.timeMs, 380)
  assert.equal(patch.reverb.timeS, 1.8)
})

test('conversion does not mutate the source intent', () => {
  const before = structuredClone(mk2Patch)
  convertIntent(mk2Patch, 'katana-mk2', 'katana-mk3')
  assert.deepEqual(mk2Patch, before, 'source patch untouched')
})

test('convertTone renders a valid Gen 3 liveset', () => {
  const { tsl, filename } = convertTone(mk2Patch, 'katana-mk2', 'katana-mk3')
  const j = JSON.parse(tsl)
  assert.equal(j.device, 'KATANA Gen3')
  assert.equal(j.formatRev, '0000')
  const ps = j.data[0][0].paramSet
  const keys = Object.keys(ps)
  assert.equal(keys.length, 80)
  assert.ok(keys.every(k => k.startsWith('PATCH%')))
  assert.equal(parseInt(ps['PATCH%AMP'][7], 16), 5, 'BROWN=5 written')
  assert.ok(filename.endsWith('.tsl'))
})

test('Gen 3 -> MkII round-trips a shared character back to itself', () => {
  // BROWN -> (canon brown) -> MkII 'Brown' -> (canon brown) -> Gen 3 BROWN
  const mk3Patch: TonePatch = { ...structuredClone(mk2Patch), ampA: { ...mk2Patch.ampA, type: 'BROWN' } }
  const down = convertIntent(mk3Patch, 'katana-mk3', 'katana-mk2')
  assert.equal(down.patch.ampA.type, 'Brown')
  const up = convertIntent(down.patch, 'katana-mk2', 'katana-mk3')
  assert.equal(up.patch.ampA.type, 'BROWN', 'character survives the round trip')
})
