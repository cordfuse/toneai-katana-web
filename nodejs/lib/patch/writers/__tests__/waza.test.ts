// WAZA-AIR + WAZA-AIR BASS writer checks. Both are the flat Air-family image with
// the SAME effect offsets as KATANA:AIR; these confirm the per-device envelope,
// enum mappings (guitar reuses Air voices; bass has its own), the 2-byte delay
// time, and that both round-trip their real templates.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  writeWazaAirTsl, writeWazaAirBassTsl, buildWazaAirSections, buildWazaAirBassSections,
} from '../waza'
import { toTsl } from '../../tsl'
import { templateSections as wazaTemplate } from '../../waza/template'
import { templateSections as wazaBassTemplate } from '../../waza-bass/template'
import type { TonePatch } from '../../intent'

const GUITAR_FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/waza-air-classic-rock.tsl')
const BASS_FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/waza-air-bass-rock.tsl')

const at = (tsl: any, i: number) => parseInt(tsl.data[0][0].paramSet['User%Patch'][i], 16)

// ── WAZA-AIR (guitar) ─────────────────────────────────────────────────────────

const gtr: TonePatch = {
  name: 'Waza Rock',
  ampA: { type: 'BROWN', gain: 80, bass: 55, middle: 45, treble: 60, presence: 65, level: 75 },
  booster: { on: true, type: 'OVERDRIVE', drive: 60, tone: 55, level: 70 },
  fx1: { on: true, type: 'CHORUS' },
  fx2: { on: false, type: 'PHASER' },
  delay: { on: true, type: 'ANALOG', timeMs: 390, feedback: 30, level: 45 },
  reverb: { on: true, type: 'HALL', timeS: 2.0, level: 40 },
}

test('WAZA-AIR envelope: device "WAZA-AIR", formatRev 0000, User%Patch', () => {
  const t = writeWazaAirTsl(gtr) as any
  assert.equal(t.device, 'WAZA-AIR')
  assert.equal(t.formatRev, '0000')
  assert.ok('User%Patch' in t.data[0][0].paramSet)
  assert.equal(t.data[0][0].paramSet['User%Patch'].length, 2335)
})

test('WAZA-AIR reuses KATANA:AIR effect voices at shared offsets', () => {
  const t = writeWazaAirTsl(gtr)
  assert.equal(at(t, 48), 1, 'booster on')
  assert.equal(at(t, 49), 11, 'OVERDRIVE = booster 11')
  assert.equal(at(t, 192), 1, 'fx1 on')
  assert.equal(at(t, 193), 29, 'CHORUS = fx 29')
  assert.equal(at(t, 736), 1, 'delay on')
  assert.equal(at(t, 737), 7, 'ANALOG = delay 7')
  const ms = at(t, 738) * 128 + at(t, 739)
  assert.equal(ms, 390, 'delay time round-trips')
  assert.equal(at(t, 784), 1, 'reverb on')
  assert.equal(at(t, 785), 3, 'HALL = reverb 3')
})

test('WAZA-AIR template round-trips the real export', { skip: !fs.existsSync(GUITAR_FIXTURE) && 'fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(GUITAR_FIXTURE, 'utf8'))
  const golden = fixture.data[0][0].paramSet
  const emitted = (toTsl(wazaTemplate(), { formatRev: '0000', device: 'WAZA-AIR', name: 'X', keyPrefix: 'User%' }) as any).data[0][0].paramSet
  assert.deepEqual(emitted['User%Patch'], golden['User%Patch'], 'flat image byte-identical')
})

// ── WAZA-AIR BASS ─────────────────────────────────────────────────────────────

const bass: TonePatch = {
  name: 'Waza Bass',
  ampA: { type: 'VINTAGE', gain: 45, bass: 70, middle: 50, treble: 40, presence: 35, level: 80 },
  booster: { on: true, type: 'BASS DRV', drive: 50, tone: 55, level: 65 },
  fx1: { on: true, type: 'COMPRESSOR' },
  fx2: { on: false, type: 'CHORUS' },
  delay: { on: true, type: 'ANALOG', timeMs: 300, feedback: 20, level: 30 },
  reverb: { on: true, type: 'ROOM', timeS: 1.5, level: 25 },
}

test('WAZA-AIR BASS envelope: device "WAZA-AIR BASS", formatRev 0000', () => {
  const t = writeWazaAirBassTsl(bass) as any
  assert.equal(t.device, 'WAZA-AIR BASS')
  assert.equal(t.formatRev, '0000')
  assert.equal(t.data[0][0].paramSet['User%Patch'].length, 2335)
})

test('WAZA-AIR BASS uses bass booster/FX voices, shared delay/reverb', () => {
  const t = writeWazaAirBassTsl(bass)
  assert.equal(at(t, 48), 1, 'booster on')
  assert.equal(at(t, 49), 12, 'BASS DRV = bass booster 12')
  assert.equal(at(t, 192), 1, 'fx1 on')
  assert.equal(at(t, 193), 9, 'COMPRESSOR = bass fx 9')
  assert.equal(at(t, 737), 7, 'ANALOG = delay 7 (shared with Air)')
  assert.equal(at(t, 785), 1, 'ROOM = reverb 1 (shared with Air)')
})

test('WAZA-AIR BASS template round-trips the real export', { skip: !fs.existsSync(BASS_FIXTURE) && 'fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(BASS_FIXTURE, 'utf8'))
  const golden = fixture.data[0][0].paramSet
  const emitted = (toTsl(wazaBassTemplate(), { formatRev: '0000', device: 'WAZA-AIR BASS', name: 'X', keyPrefix: 'User%' }) as any).data[0][0].paramSet
  assert.deepEqual(emitted['User%Patch'], golden['User%Patch'], 'flat image byte-identical')
})

test('an unknown bass booster leaves the slot off (no reject on effects)', () => {
  // A guitar-only booster name has no bass counterpart → slot off, not a throw.
  const s = buildWazaAirBassSections({ ...bass, booster: { ...bass.booster, type: 'MID BOOST' } })
  assert.equal(s.get('Patch')![48], 0, 'no bass equivalent → booster off')
})

test('off effects clear their switches (guitar)', () => {
  const s = buildWazaAirSections({
    ...gtr,
    booster: { ...gtr.booster, on: false },
    delay: { ...gtr.delay, on: false },
    reverb: { ...gtr.reverb, on: false },
  })
  assert.equal(s.get('Patch')![48], 0)
  assert.equal(s.get('Patch')![736], 0)
  assert.equal(s.get('Patch')![784], 0)
})
