// KATANA:GO writer overlay checks: a known tone intent lands at the verified
// byte offsets, enum names resolve to the right indices (proven via the app's
// Gen 3 → GO map), the 4-nibble delay time round-trips, the name sits at COM
// offset 4, and chain switches match.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeGoTsl, buildGoSections } from '../go'
import type { TonePatch } from '../../intent'

const patch: TonePatch = {
  name: 'GO Rock Lead',
  ampA: { type: 'BROWN', gain: 90, bass: 40, middle: 55, treble: 60, presence: 70, level: 80 },
  booster: { on: true, type: 'T-SCREAM', drive: 65, tone: 50, level: 60 },
  fx1: { on: true, type: 'CHORUS' },
  fx2: { on: false, type: 'PHASER' },
  delay: { on: true, type: 'ANALOG', timeMs: 409, feedback: 35, level: 50 },
  reverb: { on: true, type: 'HALL', timeS: 3, level: 40 },
}

const ps = (writeGoTsl(patch) as any).data[0][0].paramSet
const at = (block: string, i: number) => parseInt(ps[`PATCH%${block}`][i], 16)

test('GO envelope: guitarmode, formatRev 0000, PATCH% keys', () => {
  const t = writeGoTsl(patch) as any
  assert.equal(t.device, 'KATANA:GO_guitarmode')
  assert.equal(t.formatRev, '0000')
  assert.ok(Object.keys(ps).every(k => k.startsWith('PATCH%')))
})

test('name at COM offset 4, space-padded', () => {
  const com = ps['PATCH%COM']
  const name = com.slice(4, 20).map((h: string) => String.fromCharCode(parseInt(h, 16))).join('')
  assert.equal(name, 'GO Rock Lead'.padEnd(16, ' '))
})

test('amp overlays at GO offsets, BROWN=4', () => {
  assert.equal(at('AMP', 12), 4, 'BROWN amp = type byte 4')
  assert.equal(at('AMP', 0), 90, 'gain')
  assert.equal(at('AMP', 1), 80, 'volume/level')
  assert.equal(at('AMP', 3), 40, 'bass')
  assert.equal(at('AMP', 5), 60, 'treble')
  assert.equal(at('AMP', 10), 70, 'presence')
})

test('booster: T-SCREAM=9, chain switch, knobs', () => {
  assert.equal(at('SW', 0), 1, 'booster on')
  assert.equal(at('BOOSTER', 0), 9, 'T-SCREAM = booster type 9')
  assert.equal(at('BOOSTER', 1), 65, 'drive')
  assert.equal(at('BOOSTER', 6), 60, 'effect level')
})

test('mod slots: fx1->FX(1)/MOD on CHORUS=0, fx2->FX(2)/FX off', () => {
  assert.equal(at('SW', 1), 1, 'MOD on (fx1)')
  assert.equal(at('FX(1)', 0), 0, 'CHORUS = fx type 0')
  assert.equal(at('SW', 2), 0, 'FX off (fx2 was off)')
})

test('delay: ANALOG=3 + 4-nibble time round-trip', () => {
  assert.equal(at('SW', 3), 1, 'delay on')
  assert.equal(at('DELAY(1)', 0), 3, 'ANALOG = delay type 3')
  const nib = [at('DELAY(1)', 1), at('DELAY(1)', 2), at('DELAY(1)', 3), at('DELAY(1)', 4)]
  const ms = (nib[0] << 12) | (nib[1] << 8) | (nib[2] << 4) | nib[3]
  assert.equal(ms, 409, 'delay time round-trips to 409ms')
  assert.equal(at('DELAY(1)', 5), 35, 'feedback')
})

test('reverb: HALL=2, time with -1 offset, level', () => {
  assert.equal(at('SW', 5), 1, 'reverb on')
  assert.equal(at('REVERB', 0), 2, 'HALL = reverb type 2')
  assert.equal(at('REVERB', 2), 29, 'time = 3s*10 - 1 offset')
  assert.equal(at('REVERB', 10), 40, 'effect level')
})

test('unknown amp name is rejected', () => {
  assert.throws(() => writeGoTsl({ ...patch, ampA: { ...patch.ampA, type: 'Twin Reverb' } }), /unknown KATANA:GO amp type/)
})

test('an off effect clears its chain switch', () => {
  const s = buildGoSections({
    ...patch,
    booster: { ...patch.booster, on: false },
    delay: { ...patch.delay, on: false },
    reverb: { ...patch.reverb, on: false },
  })
  assert.equal(s.get('SW')![0], 0, 'booster off')
  assert.equal(s.get('SW')![3], 0, 'delay off')
  assert.equal(s.get('SW')![5], 0, 'reverb off')
})
