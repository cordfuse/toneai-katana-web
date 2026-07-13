// The gate correction for noisy pickups — enforced in CODE, not asked for in a prompt.
//
// The prompt asks the model to give a single coil 8-12 more threshold than a
// humbucker. Measured on the same prompt at the same gain, with only the pickup
// changed, it gave it TWO (48 -> 50). This is the second time on this codebase that
// a numeric instruction in a prompt has been quietly ignored; the first was the
// pre-tool narration, which we also had to fix structurally.
//
// A prompt is guidance. A function is a guarantee. These tests hold the guarantee.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calibrateGateForPickup, defaultNoiseSuppressor, blankPatch, type TonePatch } from '../intent'

const gated = (threshold: number) => ({ on: true, threshold, release: 50 })

test('a single coil gets a materially higher gate than a humbucker — the rule the model ignored', () => {
  const hb = calibrateGateForPickup(gated(48), 'humbucking')
  const sc = calibrateGateForPickup(gated(48), 'single-coil')
  assert.equal(hb.threshold, 48, 'a humbucker is left alone')
  assert.equal(sc.threshold, 58)
  assert.ok(sc.threshold - hb.threshold >= 8, 'the gap must be the 8-12 the rule asks for, not 2')
})

test("'mixed' splits the difference — auto position, both kinds of pickup fitted", () => {
  // Steve's Les Paul: P-90 neck, humbucker bridge, pill on auto. We cannot know which
  // one he'll select, so half the bump beats under-gating a P-90 into a high-gain patch.
  assert.equal(calibrateGateForPickup(gated(40), 'mixed').threshold, 45)
})

test('an OFF gate stays off — a clean is not silently gated because it has single coils', () => {
  const off = { on: false, threshold: 0, release: 50 }
  assert.deepEqual(calibrateGateForPickup(off, 'single-coil'), off)
})

test('the correction only ever RAISES — a model that already understood keeps its choice', () => {
  const already = calibrateGateForPickup(gated(55), 'single-coil')
  assert.ok(already.threshold >= 55)
})

test('capped at 60 — past that the gate eats the player\'s quiet notes', () => {
  assert.equal(calibrateGateForPickup(gated(58), 'single-coil').threshold, 60)
  assert.equal(calibrateGateForPickup(gated(60), 'single-coil').threshold, 60)
})

test('the DERIVED gate is calibrated too — a model that omits the gate still gets the pickup', () => {
  const metal: TonePatch = {
    ...blankPatch('Metal'),
    ampA: { type: 'Brown', gain: 85, bass: 60, middle: 45, treble: 70, presence: 65, level: 60 },
    booster: { on: true, type: 'Distortion', drive: 60, tone: 60, level: 55 },
  }
  const derived = defaultNoiseSuppressor(metal)
  const forP90 = calibrateGateForPickup(derived, 'single-coil')
  assert.ok(derived.on)
  assert.ok(forP90.threshold > derived.threshold, 'a P-90 must gate harder than the bare derivation')
})
