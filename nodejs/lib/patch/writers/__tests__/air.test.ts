// KATANA Air writer overlay checks: a known tone intent lands at the verified
// byte offsets in the flat User%Patch image, enum names resolve to the right
// indices, the 2-byte delay-time encodes cleanly, chain switches match, and the
// amp is NOT written into the patch (Air amp = global panel state).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeAirTsl, buildAirSections, airAmpSettings } from '../air'
import type { TonePatch } from '../../intent'

const patch: TonePatch = {
  name: 'Air Test',
  ampA: { type: 'BROWN', gain: 90, bass: 40, middle: 55, treble: 60, presence: 70, level: 80 },
  booster: { on: true, type: 'OVERDRIVE', drive: 65, tone: 55, level: 60 },
  fx1: { on: true, type: 'CHORUS' },
  fx2: { on: false, type: 'PHASER' },
  delay: { on: true, type: 'DIGITAL', timeMs: 400, feedback: 35, level: 50 },
  reverb: { on: true, type: 'HALL', timeS: 3, level: 40 },
}

const ps = (writeAirTsl(patch) as any).data[0][0].paramSet
const p = ps['User%Patch'] as string[]
const at = (i: number) => parseInt(p[i], 16)

test('Air envelope: KATANA-AIR, formatRev 0000, single User%Patch block', () => {
  const t = writeAirTsl(patch) as any
  assert.equal(t.device, 'KATANA-AIR')
  assert.equal(t.formatRev, '0000')
  assert.deepEqual(Object.keys(ps), ['User%Patch'])
  assert.equal(p.length, 2335)
})

test('patch name at offset 0, 16 ASCII space-padded', () => {
  const name = p.slice(0, 16).map(h => String.fromCharCode(parseInt(h, 16))).join('')
  assert.equal(name, 'Air Test'.padEnd(16, ' '))
})

test('booster (ODDS): OVERDRIVE=11, switch + knobs', () => {
  assert.equal(at(48), 1, 'ODDS switch on')
  assert.equal(at(49), 11, 'OVERDRIVE = booster type 11')
  assert.equal(at(50), 65, 'drive')
  assert.equal(at(52), 55, 'tone (0..100 centered)')
  assert.equal(at(55), 60, 'effect level')
})

test('mod slots: fx1->FX1 CHORUS on, fx2->FX2 off', () => {
  assert.equal(at(192), 1, 'FX1 switch on')
  assert.equal(at(193), 29, 'CHORUS = fx type 29')
  assert.equal(at(460), 0, 'FX2 off (fx2 was off)')
})

test('delay: DIGITAL type + 2-byte 7-bit time round-trip', () => {
  assert.equal(at(736), 1, 'delay switch on')
  assert.equal(at(737), 0, 'DIGITAL = delay type 0')
  const ms = (at(738) << 7) | at(739)   // 7-bit pair, MSB-first
  assert.equal(ms, 400, 'delay time round-trips to 400ms')
  assert.equal(at(740), 35, 'feedback')
  assert.equal(at(742), 50, 'effect level')
})

test('reverb: HALL type, time, level', () => {
  assert.equal(at(784), 1, 'reverb switch on')
  assert.equal(at(785), 3, 'HALL = reverb type 3')
  assert.equal(at(786), 30, 'time = 3s * 10')
  assert.equal(at(792), 40, 'effect level')
})

test('an off effect clears its switch', () => {
  const off = buildAirSections({
    ...patch,
    booster: { ...patch.booster, on: false },
    delay: { ...patch.delay, on: false },
    reverb: { ...patch.reverb, on: false },
  }).get('Patch')!
  assert.equal(off[48], 0, 'booster off')
  assert.equal(off[736], 0, 'delay off')
  assert.equal(off[784], 0, 'reverb off')
})

test('amp is NOT written into the patch, surfaced as instructions', () => {
  // The whole point: Air stores no amp. Two patches differing only in amp voice
  // produce identical User%Patch bytes.
  const a = (writeAirTsl(patch) as any).data[0][0].paramSet['User%Patch']
  const b = (writeAirTsl({ ...patch, ampA: { ...patch.ampA, type: 'CLEAN', gain: 10 } }) as any)
    .data[0][0].paramSet['User%Patch']
  assert.deepEqual(a, b, 'amp voice/gain does not change patch bytes')

  const amp = airAmpSettings(patch)
  assert.equal(amp.type, 'BROWN')
  assert.equal(amp.gain, 90)
  assert.equal(amp.treble, 60)
})

test('an effect with no Air equivalent is dropped (switch off), not mis-encoded', () => {
  // "FLANGER 117E" exists in Air; a genuinely absent name should turn the slot off.
  const s = buildAirSections({ ...patch, fx1: { on: true, type: 'NOT A REAL EFFECT' } }).get('Patch')!
  assert.equal(s[192], 0, 'unknown fx1 → switch off')
})
