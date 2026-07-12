// How a limit is READ from the environment.
//
// The load-bearing assertion in this file is that **0 does not mean unlimited**.
//
// `0` is the natural way to write "none": an operator switching the free tier off
// (BYOK-only) types 0 and expects zero. If 0 meant "unlimited" they would get the
// exact inverse — an unbounded bill on their own key, with nothing in the UI to
// reveal it. A stray zero or an empty dashboard field would do the same. Every
// other guard in this app fails closed; so must this one.
//
// `unlimited` is a WORD precisely because a word cannot be typed by accident and
// cannot be confused with "none".
//
// The limits are read at module load, so each case runs in a child process with a
// different environment — there is no way to re-read them in-process.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../..')

/** Load quota.ts in a child process with `env` applied, and report what it parsed. */
function limitsUnder(env: Record<string, string>): { global: unknown; device: unknown } {
  const out = execFileSync(
    process.execPath,
    [
      // tsx, the same loader `npm test` uses. NOT an --experimental-* flag: this
      // repo forbids those (see CLAUDE.md), and a test is not an exemption.
      '--import', 'tsx',
      '-e',
      `import('${path.join(ROOT, 'lib/server/quota.ts')}').then(m => {
         const j = (v) => (v === Infinity ? 'unlimited' : v)
         console.log(JSON.stringify({ global: j(m.FREE_DAILY_LIMIT), device: j(m.FREE_DEVICE_DAILY_LIMIT) }))
       })`,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, ...env, DB_PATH: '/tmp/quota-limits-test.db' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
  return JSON.parse(out.trim().split('\n').pop()!)
}

test('ZERO MEANS NO FREE REQUESTS — never unlimited', () => {
  const l = limitsUnder({ FREE_DAILY_LIMIT: '0', FREE_DEVICE_DAILY_LIMIT: '0' })
  assert.equal(l.global, 0, '0 must stay 0 — an operator who types 0 wants the free tier OFF')
  assert.equal(l.device, 0)
  assert.notEqual(l.global, 'unlimited', 'a zero that silently means unlimited is an unbounded bill')
})

test('the WORD unlimited removes the cap', () => {
  const l = limitsUnder({ FREE_DAILY_LIMIT: 'unlimited', FREE_DEVICE_DAILY_LIMIT: 'unlimited' })
  assert.equal(l.global, 'unlimited')
  assert.equal(l.device, 'unlimited')
})

test('unlimited is case-insensitive and tolerates whitespace', () => {
  const l = limitsUnder({ FREE_DAILY_LIMIT: '  UNLIMITED  ' })
  assert.equal(l.global, 'unlimited')
})

test('a plain number is a plain number', () => {
  const l = limitsUnder({ FREE_DAILY_LIMIT: '250', FREE_DEVICE_DAILY_LIMIT: '25' })
  assert.equal(l.global, 250)
  assert.equal(l.device, 25)
})

test('unset falls back to the shipped defaults', () => {
  const l = limitsUnder({ FREE_DAILY_LIMIT: '', FREE_DEVICE_DAILY_LIMIT: '' })
  assert.equal(l.global, 100)
  assert.equal(l.device, 10)
})

test('garbage falls back to the default rather than becoming NaN', () => {
  // A NaN limit makes every `count < limit` comparison false, which silently
  // blocks ALL free traffic — a typo must not take the free tier down.
  const l = limitsUnder({ FREE_DAILY_LIMIT: 'lots', FREE_DEVICE_DAILY_LIMIT: '-5' })
  assert.equal(l.global, 100)
  assert.equal(l.device, 10, 'a negative limit is nonsense, not a cap of -5')
})
