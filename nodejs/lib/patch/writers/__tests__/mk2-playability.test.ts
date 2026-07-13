// The bug this file exists to prevent: a patch is not just the knobs the model
// picked, it is EVERY byte the amp reads.
//
// The MkII writer clones a golden template and overlays the fields the tone intent
// controls. For the app's whole life it overlaid 13 of Patch_0's 72 bytes and 4 of
// Patch_1's 91 — and the rest came from the patch the template was cloned from: a
// community "Mayer Tone", a CLEAN patch. So every tone ToneAI ever produced carried
// that player's noise gate (OFF), his contour EQ (ON), and his solo/level bytes.
//
// On a clean tone nobody noticed. On `Hi-Gain Stack g85` the amp howled the moment
// you touched the strings, and a MkII owner reported exactly that.
//
// The round-trip test passed the whole time. It proved the template cloned
// byte-clean; it never asked whether the donor was a sane place to start. These
// tests ask the question the round-trip test couldn't.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMk2Sections } from '../mk2'
import { MK2_OFFSETS as O } from '../../mk2/sections'
import { blankPatch, defaultNoiseSuppressor, type TonePatch } from '../../intent'

const at = (patch: TonePatch, slot: { section: string; offset: number }): number => {
  const s = buildMk2Sections(patch)
  const arr = s.get(slot.section)
  assert.ok(arr, `section missing: ${slot.section}`)
  return arr![slot.offset]!
}

/** A high-gain patch — the case that was broken on real hardware. */
function metalPatch(): TonePatch {
  return {
    ...blankPatch('Metal'),
    ampA: { type: 'Brown', gain: 85, bass: 60, middle: 45, treble: 70, presence: 65, level: 60 },
    booster: { on: true, type: 'Distortion', drive: 60, tone: 60, level: 55 },
  }
}

/** A clean patch — where a gate would do more harm than good. */
function cleanPatch(): TonePatch {
  return {
    ...blankPatch('Clean'),
    ampA: { type: 'Clean', gain: 18, bass: 50, middle: 55, treble: 60, presence: 55, level: 65 },
    booster: { on: false, type: 'Overdrive', drive: 0, tone: 50, level: 50 },
  }
}

test('a high-gain patch ships with the noise gate ON — the bug that made patches unplayable', () => {
  const p = metalPatch()
  assert.equal(at(p, O.nsOn), 1, 'gain 85 with a distortion pedal MUST have the gate on')
  const thr = at(p, O.nsThreshold)
  assert.ok(thr >= 15 && thr <= 55, `threshold ${thr} outside the sane 15-55 band`)
})

test('a clean patch leaves the gate OFF — a gate would choke the note tails', () => {
  assert.equal(at(cleanPatch(), O.nsOn), 0)
})

test('the model can override the derived gate — it decides, the writer only backstops', () => {
  const p: TonePatch = { ...metalPatch(), noiseSuppressor: { on: true, threshold: 42, release: 30 } }
  assert.equal(at(p, O.nsOn), 1)
  assert.equal(at(p, O.nsThreshold), 42)
  assert.equal(at(p, O.nsRelease), 30)
})

test('the derived gate scales with the gain in front of it', () => {
  const low = defaultNoiseSuppressor({ ...cleanPatch(), ampA: { ...cleanPatch().ampA, gain: 55 } })
  const high = defaultNoiseSuppressor(metalPatch())
  assert.equal(low.on, true)
  assert.ok(high.threshold > low.threshold, 'more gain must mean a higher threshold')
})

test('no solo boost is ever left engaged — a hidden boost is just an unrequested volume jump', () => {
  const p = metalPatch()
  assert.equal(at(p, O.odSoloSw), 0)
  assert.equal(at(p, O.ampSoloSw), 0)
  assert.equal(at(p, O.prmSoloSw), 0)
})

test("the donor's contour EQ is not inherited — it made the model's EQ knobs a lie", () => {
  const p = metalPatch()
  assert.equal(at(p, O.contourSw), 0, 'contour stacks a fixed EQ curve over the amp tone stack')
  assert.equal(at(p, O.ampBright), 0)
})

test('patch level is written explicitly, defaulting to unity', () => {
  assert.equal(at(metalPatch(), O.patchLevel), 100)
  assert.equal(at({ ...metalPatch(), patchLevel: 70 }, O.patchLevel), 70)
})

// The regression guard. Any parameter we do not write is inherited from the donor
// patch — that is the disease, and it is invisible by construction. This test makes
// it visible: it enumerates the bytes the writer touches, and fails if that set ever
// silently shrinks. It does NOT demand we write every byte (many are genuinely
// don't-care: mic sim, expression pedal assignments). It demands that the set of
// bytes we OWN is a deliberate, reviewed list rather than an accident.
test('the writer owns every playability byte — silent inheritance cannot creep back', () => {
  const owned = (section: string) =>
    Object.values(O)
      .filter(s => s.section === section)
      .map(s => s.offset)
      .sort((a, b) => a - b)

  assert.deepEqual(
    owned('Patch_0'),
    [0, 1, 2, 4, 5, 6, 7, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28],
    'Patch_0 ownership changed — if you removed an offset, a donor byte is now leaking through',
  )
  assert.deepEqual(
    owned('Patch_1'),
    [0, 1, 2, 8, 38, 39, 40, 48, 84, 85, 86, 87],
    'Patch_1 ownership changed — check the noise suppressor and solo/contour bytes',
  )
})
