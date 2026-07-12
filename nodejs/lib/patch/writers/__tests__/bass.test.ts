// KATANA BASS writer overlay checks: a known tone intent lands at the verified
// byte offsets (Knob = preamp, Drive = booster, colour-variation-1 blocks), enum
// names resolve to the right indices, the 2-byte 7-bit delay time round-trips,
// the combined Fx2 slot fills by priority (delay > reverb > fx2), and the name
// sits in the PatchName block.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeBassTsl, buildBassSections } from '../bass'
import type { TonePatch } from '../../intent'

const patch: TonePatch = {
  name: 'Bass Grind',
  ampA: { type: 'MODERN', gain: 60, bass: 70, middle: 45, treble: 55, presence: 40, level: 80 },
  booster: { on: true, type: 'BASS OD', drive: 55, tone: 50, level: 65 },
  fx1: { on: true, type: 'CHORUS' },
  fx2: { on: false, type: 'FLANGER' },
  delay: { on: true, type: 'ANALOG', timeMs: 390, feedback: 30, level: 40 },
  reverb: { on: true, type: 'HALL', timeS: 2.5, level: 35 },
}

const ps = (writeBassTsl(patch) as any).data[0][0].paramSet
const at = (block: string, i: number) => parseInt(ps[`UserPatch%${block}`][i], 16)

test('envelope: device "KATANA BASS", formatRev 0000, UserPatch% keys', () => {
  const t = writeBassTsl(patch) as any
  assert.equal(t.device, 'KATANA BASS')
  assert.equal(t.formatRev, '0000')
  assert.ok(Object.keys(ps).every(k => k.startsWith('UserPatch%')))
})

test('name written into PatchName block, space-padded to 16', () => {
  const name = ps['UserPatch%PatchName'].slice(0, 16).map((h: string) => String.fromCharCode(parseInt(h, 16))).join('')
  assert.equal(name, 'Bass Grind'.padEnd(16, ' '))
})

test('amp = Knob panel: MODERN=2, gain/volume/4-band EQ at their offsets', () => {
  assert.equal(at('Knob', 2), 2, 'MODERN = preamp type 2')
  assert.equal(at('Knob', 3), 60, 'gain')
  assert.equal(at('Knob', 4), 80, 'volume/level')
  assert.equal(at('Knob', 6), 70, 'bass')
  assert.equal(at('Knob', 7), 45, 'low-mid (from middle)')
  assert.equal(at('Knob', 8), 40, 'high-mid (from presence)')
  assert.equal(at('Knob', 9), 55, 'treble')
})

test('booster -> Drive(1) + SelColorSw: BASS OD=6, colour 0', () => {
  assert.equal(at('SelColorSw', 2), 1, 'drive on')
  assert.equal(at('SelColorSw', 3), 0, 'drive colour 0')
  assert.equal(at('Drive(1)', 0), 6, 'BASS OD = drive type 6')
  assert.equal(at('Drive(1)', 1), 55, 'drive')
  assert.equal(at('Drive(1)', 4), 65, 'level')
})

test('mod slot 1 -> Fx1(1): CHORUS=0, colour 0', () => {
  assert.equal(at('SelColorSw', 12), 1, 'fx1 on')
  assert.equal(at('Fx1(1)', 0), 0, 'CHORUS = fx type 0')
})

test('combined Fx2 slot: delay wins over reverb, ANALOG=1, 2-byte time round-trip', () => {
  assert.equal(at('SelColorSw', 14), 1, 'fx2 slot on')
  assert.equal(at('Fx2(1)', 0), 1, 'Fx2 sel = 1 (delay)')
  assert.equal(at('Fx2(1)', 2), 1, 'ANALOG = delay type 1')
  const ms = at('DelayDetail', 0) * 128 + at('DelayDetail', 1)
  assert.equal(ms, 390, 'delay time round-trips to 390ms')
  assert.equal(at('DelayDetail', 2), 30, 'feedback')
  assert.equal(at('DelayDetail', 4), 40, 'level')
})

test('reverb fills the Fx2 slot when there is no delay', () => {
  const s = buildBassSections({ ...patch, delay: { ...patch.delay, on: false } })
  assert.equal(s.get('SelColorSw')![14], 1, 'fx2 slot on for reverb')
  assert.equal(s.get('Fx2(1)')![0], 2, 'Fx2 sel = 2 (reverb)')
  assert.equal(s.get('Fx2(1)')![3], 2, 'HALL = reverb type 2')
})

test('an off drive/fx clears its SelColorSw switch', () => {
  const s = buildBassSections({
    ...patch,
    booster: { ...patch.booster, on: false },
    fx1: { ...patch.fx1!, on: false },
    delay: { ...patch.delay, on: false },
    reverb: { ...patch.reverb, on: false },
  })
  assert.equal(s.get('SelColorSw')![2], 0, 'drive off')
  assert.equal(s.get('SelColorSw')![12], 0, 'fx1 off')
  assert.equal(s.get('SelColorSw')![14], 0, 'fx2 slot off')
})

test('unknown preamp voice is rejected', () => {
  assert.throws(() => writeBassTsl({ ...patch, ampA: { ...patch.ampA, type: 'BROWN' } }), /unknown KATANA BASS amp type/)
})
