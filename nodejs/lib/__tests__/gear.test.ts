// describeRig is the ONLY thing the player's gear contributes to the prompt. If it
// omits a fact, the model does not have that fact — there is no other channel.
//
// It used to omit almost everything on the DEFAULT setting. The pickup-position pill
// starts on 'auto', which passes no position, and describeRig with no position said
// nothing about pickups at all. So a Les Paul with a P-90 in the neck and a humbucker
// in the bridge reached the model as, in full, "Les Paul".
//
// That silently disabled every pickup-dependent decision — most importantly the noise
// gate, since a single coil hums and a humbucker doesn't, and the model could not tell
// which it was voicing for.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeRig } from '../gear'
import type { Instrument } from '../gear'

/** Steve's actual guitar: P-90 in the neck, humbucker in the bridge. */
const donner: Instrument = {
  id: 'test-donner',
  name: 'Donner DLP-124',
  kind: 'guitar',
  archetype: 'Les Paul',
  pickups: ['p90', 'vintage-bucker'],   // neck -> bridge — Steve's actual DLP-124
}

test('a chosen position names the pickup actually being played', () => {
  assert.match(describeRig(donner, 'bridge'), /bridge/i)
  assert.match(describeRig(donner, 'neck'), /neck/i)
  assert.match(describeRig(donner, 'neck'), /P-90/i)
})

test('AUTO lists what is fitted instead of hiding it — the default must not be blind', () => {
  const d = describeRig(donner, undefined)
  // The bug: this used to be exactly "Les Paul" and nothing else.
  assert.match(d, /P-90/i, 'auto must disclose the neck single coil — it decides the gate')
  assert.match(d, /bucker/i, 'auto must disclose the bridge humbucker')
  assert.match(d, /neck/i)
  assert.match(d, /bridge/i)
})

test('auto invites the model to choose, rather than asserting a position it was not given', () => {
  assert.match(describeRig(donner, undefined), /pick whichever position suits/i)
})

test('an instrument with no pickups fitted still says so — never invent one', () => {
  const bare: Instrument = { ...donner, pickups: ['none', 'none'] }
  assert.match(describeRig(bare, undefined), /no pickups fitted/i)
})
