// KATANA MkI liveset writer overlay checks: a known tone intent lands on the
// correct NAMED params with MkI enum indices, the 2-byte delay time round-trips,
// the name fills both name fields, and the envelope is the GT liveset.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeMk1Tsl, buildMk1Patch } from '../mk1-liveset'
import { AMP_NAMES, OD_DS_NAMES, FX_NAMES, REVERB_NAMES } from '../../enums'
import type { TonePatch } from '../../intent'

const patch: TonePatch = {
  name: 'MkI Test',
  ampA: { type: 'Crunch', gain: 60, bass: 55, middle: 40, treble: 65, presence: 50, level: 70 },
  booster: { on: true, type: 'Clean Boost', drive: 45, tone: 50, level: 80 },
  fx1: { on: true, type: 'Chorus' },
  fx2: { on: false, type: 'Phaser' },
  delay: { on: true, type: 'Analog', timeMs: 390, feedback: 35, level: 50 },
  reverb: { on: true, type: 'Spring', timeS: 2.4, level: 40 },
}

const liveset = writeMk1Tsl(patch) as any
const P = liveset.patchList[0].params

test('envelope is the GT liveset (device "GT", version "1.0.0", patchList)', () => {
  assert.equal(liveset.device, 'GT')
  assert.equal(liveset.version, '1.0.0')
  assert.equal(liveset.patchList.length, 1)
  assert.ok(liveset.liveSetData)
})

test('name fills name + logPatchName (KATANA: prefix)', () => {
  assert.equal(liveset.patchList[0].name, 'MkI Test')
  assert.equal(liveset.patchList[0].logPatchName, 'KATANA:MkI Test')
  assert.equal(liveset.liveSetData.name, 'MkI Test')
})

test('preamp A overlays by MkI amp index + knobs', () => {
  assert.equal(P['preamp_a_type'], AMP_NAMES.indexOf('Crunch'))
  assert.equal(P['preamp_a_gain'], 60)
  assert.equal(P['preamp_a_bass'], 55)
  assert.equal(P['preamp_a_middle'], 40)
  assert.equal(P['preamp_a_treble'], 65)
  assert.equal(P['preamp_a_presence'], 50)
  assert.equal(P['preamp_a_level'], 70)
})

test('OD/DS booster: on, MkI index, drive/tone/level', () => {
  assert.equal(P['od_ds_on_off'], 1)
  assert.equal(P['od_ds_type'], OD_DS_NAMES.indexOf('Clean Boost'))
  assert.equal(P['od_ds_drive'], 45)
  assert.equal(P['od_ds_tone'], 50)
  assert.equal(P['od_ds_effect_level'], 80)
})

test('FX slots: fx1 on with index, fx2 off', () => {
  assert.equal(P['fx1_on_off'], 1)
  assert.equal(P['fx1_fx_type'], FX_NAMES.indexOf('Chorus'))
  assert.equal(P['fx2_on_off'], 0)
})

test('delay: 2-byte (hi/lo 7-bit) time round-trips to 390ms', () => {
  assert.equal(P['delay_on_off'], 1)
  const ms = P['delay_delay_time_h'] * 128 + P['delay_delay_time_l']
  assert.equal(ms, 390)
  assert.equal(P['delay_f_back'], 35)
  assert.equal(P['delay_effect_level'], 50)
})

test('reverb: Spring index, time, level', () => {
  assert.equal(P['reverb_on_off'], 1)
  assert.equal(P['reverb_type'], REVERB_NAMES.indexOf('Spring'))
  assert.equal(P['reverb_time'], 24)  // 2.4s * 10
  assert.equal(P['reverb_effect_level'], 40)
})

test('an off booster/fx/delay/reverb clears its on_off', () => {
  const p = buildMk1Patch({
    ...patch,
    booster: { ...patch.booster, on: false },
    fx1: { ...patch.fx1!, on: false },
    delay: { ...patch.delay, on: false },
    reverb: { ...patch.reverb, on: false },
  })
  assert.equal(p.params['od_ds_on_off'], 0)
  assert.equal(p.params['fx1_on_off'], 0)
  assert.equal(p.params['delay_on_off'], 0)
  assert.equal(p.params['reverb_on_off'], 0)
})

test('unknown amp name is rejected', () => {
  assert.throws(() => writeMk1Tsl({ ...patch, ampA: { ...patch.ampA, type: 'BROWN' } }), /unknown KATANA MkI amp type/)
})
