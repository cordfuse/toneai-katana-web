// Quota contract: a per-device allowance sitting under a shared global pool.
//
// Each test is net-zero against the REAL counters (every increment is paired with
// a refund) so running the suite never inflates or drains the live pool. Device
// ids are unique per test so tests can't interfere with each other.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readQuota, checkAndIncrementQuota, refundQuota, FREE_DEVICE_DAILY_LIMIT,
} from '../quota'

let n = 0
const freshDevice = () => `test-device-${process.pid}-${Date.now()}-${n++}`

test('a consumed slot comes off BOTH the device allowance and the shared pool', () => {
  const dev = freshDevice()
  const before = readQuota(dev)

  const r = checkAndIncrementQuota(dev)
  assert.equal(r.allowed, true)

  const after = readQuota(dev)
  assert.equal(after.device.remaining, before.device.remaining! - 1, 'device allowance spent')
  assert.equal(after.global.remaining, before.global.remaining! - 1, 'shared pool spent')

  refundQuota(dev)
  const back = readQuota(dev)
  assert.equal(back.device.remaining, before.device.remaining, 'device slot returned')
  assert.equal(back.global.remaining, before.global.remaining, 'pool slot returned')
})

test('refund + re-consume nets to zero (idempotent slot accounting)', () => {
  const dev = freshDevice()
  const before = readQuota(dev)
  checkAndIncrementQuota(dev); refundQuota(dev)
  checkAndIncrementQuota(dev); refundQuota(dev)
  const after = readQuota(dev)
  assert.equal(after.device.remaining, before.device.remaining)
  assert.equal(after.global.remaining, before.global.remaining)
})

test('a device is cut off at its own limit — and stops draining the shared pool', () => {
  const dev = freshDevice()
  const poolBefore = readQuota(dev).global.remaining

  for (let i = 0; i < FREE_DEVICE_DAILY_LIMIT; i++) {
    assert.equal(checkAndIncrementQuota(dev).allowed, true, `request ${i + 1} should be allowed`)
  }

  // One over: refused, and attributed to the DEVICE cap, not the pool.
  const over = checkAndIncrementQuota(dev)
  assert.equal(over.allowed, false)
  assert.equal(over.blockedBy, 'device')
  assert.equal(over.deviceRemaining, 0)

  // The refusal must NOT have touched the shared pool — the whole point of the
  // device cap is that one visitor can't keep drawing it down.
  const poolAfter = readQuota(dev).global.remaining
  assert.equal(
    poolAfter, poolBefore! - FREE_DEVICE_DAILY_LIMIT,
    'a device-capped refusal must not spend a pool slot',
  )

  for (let i = 0; i < FREE_DEVICE_DAILY_LIMIT; i++) refundQuota(dev)   // leave the pool as we found it
  assert.equal(readQuota(dev).global.remaining, poolBefore)
})

test('one device cannot exhaust another device s allowance', () => {
  const a = freshDevice()
  const b = freshDevice()
  const bBefore = readQuota(b).device.remaining

  checkAndIncrementQuota(a)
  assert.equal(readQuota(b).device.remaining, bBefore, 'device b is unaffected by device a')

  refundQuota(a)
})

test('an unauthenticated read still reports the shared pool', () => {
  const view = readQuota()
  assert.equal(typeof view.global.remaining, 'number')
  assert.equal(view.device.remaining, FREE_DEVICE_DAILY_LIMIT, 'no device → full allowance shown')
})
