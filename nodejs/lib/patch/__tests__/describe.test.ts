// describePatch — the one-line telemetry summary of what the model actually
// dialled. It is the ONLY record of the generated settings, so a silently-wrong
// description is worse than none: it would let a quality regression hide behind a
// log line that looks fine.
//
// The property that matters most: an effect that is OFF must be reported as off,
// not omitted. "The model chose not to use a drive" is a finding. An absent block
// is indistinguishable from a logging bug.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describePatch, blankPatch, type TonePatch } from '../intent'

test('describes the amp with its knob values', () => {
  const p = blankPatch('Test')
  p.ampA = { type: 'Clean Twin', gain: 38, bass: 44, middle: 60, treble: 72, presence: 65, level: 70 }
  const s = describePatch(p)
  assert.match(s, /Clean Twin g38 b44 m60 t72 p65/)
})

test('an OFF effect is reported as off, never dropped', () => {
  // blankPatch has booster/delay/reverb all off.
  const s = describePatch(blankPatch('Test'))
  assert.match(s, /OD off/, 'a disabled drive must be recorded, not omitted')
  assert.match(s, /Delay off/)
  assert.match(s, /Reverb off/)
})

test('an ON effect reports its type and key parameters', () => {
  const p = blankPatch('Test')
  p.booster = { on: true, type: 'Overdrive', drive: 52, tone: 72, level: 58 }
  p.delay = { on: true, type: 'Digital', timeMs: 391, feedback: 25, level: 35 }
  p.reverb = { on: true, type: 'Room', timeS: 1.5, level: 28 }
  const s = describePatch(p)
  assert.match(s, /OD Overdrive d52 t72/)
  assert.match(s, /Delay Digital 391ms fb25/)
  assert.match(s, /Reverb Room 1\.5s/)
})

test('includes FX slots only when the model used them', () => {
  const p = blankPatch('Test')
  assert.doesNotMatch(describePatch(p), /FX1/, 'an unset FX slot is not mentioned')

  p.fx1 = { on: true, type: 'Comp' }
  p.fx2 = { on: false, type: 'Phaser' }
  const s = describePatch(p)
  assert.match(s, /FX1 Comp/)
  assert.match(s, /FX2 off/, 'an FX slot the model explicitly disabled is still recorded')
})

test('a dual-amp patch names both amps', () => {
  const p: TonePatch = blankPatch('Test')
  p.ampB = { type: 'Lead', gain: 80, bass: 50, middle: 60, treble: 70, presence: 60, level: 65 }
  assert.match(describePatch(p), /\+amp2 Lead g80/)
})

test('stays on one line — it is a log line, not a report', () => {
  const p = blankPatch('Test')
  p.fx1 = { on: true, type: 'Comp' }
  assert.ok(!describePatch(p).includes('\n'))
})
