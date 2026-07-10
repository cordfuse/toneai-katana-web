// Quota refund contract: a consumed free-tier slot can be handed back when a
// request fails before delivering output. Each test is net-zero against the
// shared counter (every increment is paired with a refund) so running the
// suite never inflates or drains the real pool.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readQuota, checkAndIncrementQuota, refundQuota } from '../quota'

test('refundQuota restores a slot consumed by checkAndIncrementQuota', () => {
  const before = readQuota().remaining
  const r = checkAndIncrementQuota()
  assert.equal(r.allowed, true)
  assert.equal(readQuota().remaining, before - 1, 'increment should spend one slot')
  refundQuota()
  assert.equal(readQuota().remaining, before, 'refund should give the slot back')
})

test('refund + re-consume nets to zero (idempotent slot accounting)', () => {
  const before = readQuota().remaining
  // consume, refund, consume, refund — always paired, so the pool is unchanged.
  checkAndIncrementQuota(); refundQuota()
  checkAndIncrementQuota(); refundQuota()
  assert.equal(readQuota().remaining, before)
})
