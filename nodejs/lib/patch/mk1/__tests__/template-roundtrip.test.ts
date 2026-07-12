// KATANA MkI golden-template round-trip. MkI's liveset is the "GT" format — a
// named-parameter JSON, not the byte-section .tsl the other gens use — so the
// template is a real patch's full params map. This proves the cloned template
// reproduces the real export's patch byte-for-byte (param-for-param) and that the
// envelope constants match.
//
// The fixture is a gitignored third-party pack; skip cleanly when absent (CI).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { templatePatch, MK1_DEVICE, MK1_VERSION } from '../template'

const FIXTURE = path.resolve(__dirname, '../../../../../data/fixtures/katana-mk1-blues-collection.tsl')

test('MkI envelope constants are the GT liveset (device "GT", version "1.0.0")', () => {
  assert.equal(MK1_DEVICE, 'GT')
  assert.equal(MK1_VERSION, '1.0.0')
})

test('golden template is a named-parameter patch (~1500 params), not byte sections', () => {
  const p = templatePatch()
  assert.ok(p.params && typeof p.params === 'object')
  assert.ok(Object.keys(p.params).length > 1400, 'full param map')
  // Named params, decimal values — the MkI hallmark.
  assert.equal(typeof p.params['preamp_a_gain'], 'number')
  assert.ok('od_ds_type' in p.params)
  assert.ok('delay_delay_time_h' in p.params)
})

test('template round-trips the real MkI patch param-for-param', { skip: !fs.existsSync(FIXTURE) && 'fixture absent' }, () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  assert.equal(fixture.device, 'GT')
  assert.equal(fixture.version, '1.0.0')
  const golden = fixture.patchList[0].params  // "FAT LEAD"
  const emitted = templatePatch().params
  assert.deepEqual(Object.keys(emitted), Object.keys(golden), 'same param keys, same order')
  // deepEqual, not equal — some MkI params are objects/arrays (knob-assignment
  // position lists), so identity comparison would spuriously fail.
  assert.deepEqual(emitted, golden, 'every param value equal')
})
