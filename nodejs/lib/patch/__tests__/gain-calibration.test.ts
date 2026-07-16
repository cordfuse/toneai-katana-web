// Gain calibration — the model's gain is real-amp INTENT; the writer maps it
// onto the KATANA sim's usable range. Constants are provisional (hardware
// listening pending) but the SHAPE is contractual: identity below the knee,
// compression above it, hard cap, level ceiling on dirt, cleans untouched.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calibrateGainForDevice, gainFamilyForAmp } from '../gain-calibration'
import type { TonePatch } from '../intent'

function patchWith(type: string, gain: number, level = 65): TonePatch {
  return {
    name: 'Cal Test',
    ampA: { type, gain, bass: 50, middle: 50, treble: 50, presence: 50, level },
  } as TonePatch
}

test('family classification covers the complaint territory', () => {
  assert.equal(gainFamilyForAmp('Lead'), 'high-gain')
  assert.equal(gainFamilyForAmp('Brown'), 'high-gain')
  assert.equal(gainFamilyForAmp('MS1959 I+II'), 'high-gain')
  assert.equal(gainFamilyForAmp('R-Fire Modern'), 'high-gain')
  assert.equal(gainFamilyForAmp('LEAD'), 'high-gain') // Gen3 spelling
  assert.equal(gainFamilyForAmp('Brown (Variation)'), 'high-gain')
  assert.equal(gainFamilyForAmp('Crunch'), 'crunch')
  assert.equal(gainFamilyForAmp('VO Drive'), 'crunch')
  assert.equal(gainFamilyForAmp('Clean'), 'clean')
  assert.equal(gainFamilyForAmp('Clean Twin'), 'clean')
  assert.equal(gainFamilyForAmp('Acoustic'), 'clean')
})

test('high-gain voices compress above the knee and never exceed the cap', () => {
  assert.equal(calibrateGainForDevice(patchWith('Lead', 40)).ampA.gain, 40) // below knee: identity
  assert.equal(calibrateGainForDevice(patchWith('Lead', 55)).ampA.gain, 51)
  assert.equal(calibrateGainForDevice(patchWith('Lead', 70)).ampA.gain, 59)
  assert.equal(calibrateGainForDevice(patchWith('Lead', 100)).ampA.gain, 70) // cap
})

test('crunch voices compress later and gentler', () => {
  assert.equal(calibrateGainForDevice(patchWith('Crunch', 50)).ampA.gain, 50)
  assert.equal(calibrateGainForDevice(patchWith('Crunch', 70)).ampA.gain, 64)
})

test('clean voices are untouched — over-gating a clean is the worse failure', () => {
  const p = calibrateGainForDevice(patchWith('Clean Twin', 80, 70))
  assert.equal(p.ampA.gain, 80)
  assert.equal(p.ampA.level, 70)
})

test('channel level is capped on dirt voices', () => {
  assert.equal(calibrateGainForDevice(patchWith('Lead', 55, 75)).ampA.level, 60)
  assert.equal(calibrateGainForDevice(patchWith('Lead', 55, 50)).ampA.level, 50)
})

test('ampB gets the same treatment when present', () => {
  const p = { ...patchWith('Clean', 20), ampB: patchWith('Brown', 70, 80).ampA } as TonePatch
  const out = calibrateGainForDevice(p)
  assert.equal(out.ampB!.gain, 59)
  assert.equal(out.ampB!.level, 60)
})
