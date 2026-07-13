// Voicing follows the played instrument, not the amp. The system prompt must:
//   • voice for bass when a bass is in hand — even on a guitar amp
//   • add the cross-use caveat for bass-through-a-guitar-amp
//   • label the rig line by the played instrument
//   • fall back to the amp's class when no gear is set
//   • keep device FORMAT facts (Air amp-not-stored, KATANA BASS combined slot)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { katanaSystemPrompt } from '../tone'

const base = { deviceLabel: 'KATANA MkII', rig: undefined as string | undefined }

test('bass in hand on a GUITAR amp voices for bass + adds cross-use caveat', () => {
  const p = katanaSystemPrompt({ device: 'katana-mk2', deviceLabel: 'KATANA MkII', instrument: 'bass' })
  assert.match(p, /playing a BASS/i)
  assert.match(p, /guitar amp/i)            // cross-use caveat present
  assert.match(p, /conservative|flubby/i)   // gain guidance
})

test('guitar in hand voices for guitar, no bass caveat', () => {
  const p = katanaSystemPrompt({ device: 'katana-mk2', deviceLabel: 'KATANA MkII', instrument: 'guitar' })
  assert.match(p, /electric guitar/i)
  assert.doesNotMatch(p, /playing a BASS/i)
})

test('no gear falls back to the amp class (guitar amp → guitar)', () => {
  const p = katanaSystemPrompt({ device: 'katana-mk2', deviceLabel: 'KATANA MkII' })
  assert.match(p, /electric guitar/i)
})

test('no gear on a bass amp falls back to bass voicing', () => {
  const p = katanaSystemPrompt({ device: 'katana-bass', deviceLabel: 'KATANA Bass' })
  assert.match(p, /playing a BASS/i)
  assert.doesNotMatch(p, /through a GUITAR amp/i)  // not cross-use; it's a bass amp
})

test('rig line is labelled by the played instrument', () => {
  const bass = katanaSystemPrompt({ device: 'katana-mk2', deviceLabel: 'KATANA MkII', instrument: 'bass', rig: 'Jazz Bass, both pickups' })
  assert.match(bass, /Their bass: Jazz Bass/i)
  const gtr = katanaSystemPrompt({ device: 'katana-mk2', deviceLabel: 'KATANA MkII', instrument: 'guitar', rig: 'Strat, neck' })
  assert.match(gtr, /Their guitar: Strat/i)
})

test('device FORMAT facts survive independent of instrument', () => {
  const air = katanaSystemPrompt({ device: 'katana-air', deviceLabel: 'KATANA:AIR', instrument: 'bass' })
  assert.match(air, /stores ONLY the effects chain/i)
  const bass = katanaSystemPrompt({ device: 'katana-bass', deviceLabel: 'KATANA Bass' })
  assert.match(bass, /ONE combined time slot/i)
})

void base

// The pickup decides how much noise there is to GATE, not just the tone. Given a
// P-90 neck and a humbucker bridge, the model dialled the identical gate for both,
// because nothing told it the pickup changes the noise. Guard the rule's presence.
test('the prompt tells the model a single coil needs more gate than a humbucker', () => {
  const p = katanaSystemPrompt({
    device: 'katana-mk2',
    deviceLabel: 'KATANA MkII',
    rig: 'Les Paul, neck P-90 style',
  })
  assert.match(p, /single coil/i)
  assert.match(p, /noise-suppressor threshold/i)
  assert.match(p, /never leave a hot single coil ungated/i)
})

test('with no rig, the pickup rule is not emitted — there is nothing to say it about', () => {
  const p = katanaSystemPrompt({ device: 'katana-mk2', deviceLabel: 'KATANA MkII' })
  assert.doesNotMatch(p, /single coil/i)
})
