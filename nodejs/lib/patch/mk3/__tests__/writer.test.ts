// Gen 3 writer overlay checks: a known tone intent lands at the verified byte
// offsets, enum names resolve to the right indices, the 4-nibble delay-time
// encodes/decodes cleanly, and chain switches match.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeMk3Tsl } from '../../writers/mk3'
import type { TonePatch } from '../../intent'

const patch: TonePatch = {
  name: 'Gen3 Test',
  ampA: { type: 'BROWN', gain: 90, bass: 40, middle: 55, treble: 60, presence: 70, level: 80 },
  booster: { on: true, type: 'T-SCREAM', drive: 65, tone: 50, level: 60 },
  fx1: { on: true, type: 'CHORUS' },
  fx2: { on: false, type: 'PHASER' },
  delay: { on: true, type: 'SDE-3000', timeMs: 409, feedback: 35, level: 50 },
  reverb: { on: true, type: 'HALL', timeS: 3, level: 40 },
}

const ps = (writeMk3Tsl(patch) as any).data[0][0].paramSet
const b = (block: string, i: number) => parseInt(ps[`PATCH%${block}`][i], 16)

test('Gen 3 envelope', () => {
  const t = writeMk3Tsl(patch) as any
  assert.equal(t.device, 'KATANA Gen3')
  assert.equal(t.formatRev, '0000')
  assert.ok(Object.keys(ps).every(k => k.startsWith('PATCH%')))
})

test('amp overlays at verified offsets, BROWN=5', () => {
  assert.equal(b('AMP', 7), 5, 'BROWN amp = byte 5')
  assert.equal(b('AMP', 0), 90, 'gain')
  assert.equal(b('AMP', 1), 80, 'level/volume')
  assert.equal(b('AMP', 2), 40, 'bass')
  assert.equal(b('AMP', 4), 60, 'treble')
})

test('booster type + chain switch', () => {
  assert.equal(b('SW', 0), 1, 'booster on')
  assert.equal(b('BOOSTER(1)', 0), 11, 'T-SCREAM = booster type 11')
  assert.equal(b('BOOSTER(1)', 1), 65, 'drive')
})

test('mod slots: fx1->MOD on, fx2->FX off', () => {
  assert.equal(b('SW', 1), 1, 'MOD on (fx1)')
  assert.equal(b('FX(1)', 0), 23, 'CHORUS = fx type 23')
  assert.equal(b('SW', 2), 0, 'FX off (fx2 was off)')
})

test('delay: SDE-3000 type + 4-nibble time round-trip', () => {
  assert.equal(b('SW', 3), 1, 'delay on')
  assert.equal(b('DELAY(1)', 0), 7, 'SDE-3000 = delay type 7')
  // 409ms -> nibbles [0,1,9,9]; decode back
  const nib = [b('DELAY(1)', 1), b('DELAY(1)', 2), b('DELAY(1)', 3), b('DELAY(1)', 4)]
  const ms = (nib[0] << 12) | (nib[1] << 8) | (nib[2] << 4) | nib[3]
  assert.equal(ms, 409, 'delay time round-trips to 409ms')
  assert.equal(b('DELAY(1)', 5), 35, 'feedback')
})

test('reverb: HALL type, time, level', () => {
  assert.equal(b('SW', 5), 1, 'reverb on')
  assert.equal(b('REVERB(1)', 0), 2, 'HALL = reverb type 2')
  assert.equal(b('REVERB(1)', 2), 30, 'time = 3s * 10')
  assert.equal(b('REVERB(1)', 10), 40, 'level')
})

test('unknown amp name is rejected', () => {
  assert.throws(() => writeMk3Tsl({ ...patch, ampA: { ...patch.ampA, type: 'Twin Reverb' } }), /unknown Gen 3 amp type/)
})
