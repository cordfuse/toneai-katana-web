// The device × played-instrument rule (lib/storage). Emit follows the amp,
// voicing follows the instrument — and the two are NOT symmetric:
//   • guitar amps are universal (guitar / bass / no gear all allowed)
//   • bass amps are bass-or-nothing (guitar gear is blocked)
//   • a device must be chosen at all (no silent default at generate time)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deviceInstrumentIssue, deviceInstrumentIssueMessage, instrumentForDevice,
} from '../storage'

test('guitar amp is universal — guitar, bass, and no gear all allowed', () => {
  for (const dev of ['katana-mk2', 'katana-mk3', 'katana-air', 'katana-go'] as const) {
    assert.equal(instrumentForDevice(dev), 'guitar')
    assert.equal(deviceInstrumentIssue(dev, 'guitar'), null, `${dev} + guitar`)
    assert.equal(deviceInstrumentIssue(dev, 'bass'), null, `${dev} + bass (bass through a guitar amp)`)
    assert.equal(deviceInstrumentIssue(dev, undefined), null, `${dev} + no gear`)
  }
})

test('bass amp is bass-or-nothing — bass and no gear allowed, guitar blocked', () => {
  for (const dev of ['katana-bass', 'katana-go-bass'] as const) {
    assert.equal(instrumentForDevice(dev), 'bass')
    assert.equal(deviceInstrumentIssue(dev, 'bass'), null, `${dev} + bass`)
    assert.equal(deviceInstrumentIssue(dev, undefined), null, `${dev} + no gear (voices bass by fallback)`)
    const issue = deviceInstrumentIssue(dev, 'guitar')
    assert.deepEqual(issue, { code: 'guitar-on-bass-amp' }, `${dev} + guitar is blocked`)
  }
})

test('no device selected is always an error, regardless of gear', () => {
  assert.deepEqual(deviceInstrumentIssue(undefined, 'guitar'), { code: 'no-device' })
  assert.deepEqual(deviceInstrumentIssue(undefined, 'bass'), { code: 'no-device' })
  assert.deepEqual(deviceInstrumentIssue(null, undefined), { code: 'no-device' })
})

test('unsupported (roadmap) device is treated as no-device', () => {
  // katana-mk1 is listed but not supported yet.
  assert.deepEqual(deviceInstrumentIssue('katana-mk1', 'guitar'), { code: 'no-device' })
})

test('messages are actionable and distinct per issue', () => {
  const noDevice = deviceInstrumentIssueMessage({ code: 'no-device' })
  const guitarOnBass = deviceInstrumentIssueMessage({ code: 'guitar-on-bass-amp' })
  assert.match(noDevice, /select an amp/i)
  assert.match(guitarOnBass, /bass amp/i)
  assert.notEqual(noDevice, guitarOnBass)
})
