// Free-tier quota: a per-device cap sitting UNDER a global daily ceiling.
//
// Only the FREE path consumes quota. A request carrying the user's own Anthropic
// key (BYOK) never reaches this module.
//
// TWO limits, because they do different jobs:
//
//   daily_quota         GLOBAL — the operator's BUDGET cap. At ~$0.10/request it
//                       is the only thing bounding what a day can cost.
//   daily_quota_device  PER-DEVICE — the FAIRNESS cap. Without it one visitor
//                       (or one script, or one runaway retry loop) drains the
//                       entire pool: they spend the whole day's budget AND deny
//                       every other user the free tier. A global counter alone is
//                       a denial-of-service switch that any visitor can flip.
//
// Both are keyed on the UTC date, so they roll over without a cron.
//
// HONEST LIMITS OF THE DEVICE CAP: `device_id` is a UUID the CLIENT generates and
// keeps in localStorage. Clearing storage or opening a private window mints a new
// one. So this is a speed bump, not a wall — it stops accidental loops, casual
// over-use, and the honest heavy user; it does not stop someone determined to
// farm the tier. Stopping that needs IP limits or real accounts. What it does buy
// is a change in the SHAPE of the downside: "one script costs $100" becomes "one
// script costs $1 per browser profile it bothers to reset".
//
// NOTE ON ATOMICITY: `mighty-ai-qr-web/lib/server/quota.ts` does SELECT → compare
// → UPDATE, which over-serves under concurrency (two requests at limit-1 both read
// limit-1, both pass, both increment). Each increment here is a single statement
// with the bound in the WHERE clause, so a row comes back only if the increment
// actually happened.

import db from './db'

/** No cap at all. Only reachable by writing the WORD `unlimited`. */
export const UNLIMITED = Number.POSITIVE_INFINITY

/**
 * Read a limit from the environment.
 *
 *   "unlimited"  → no cap. Self-hosters run this on their own key, and telling
 *                  them to type `1000` when they mean "no limit" is silly.
 *   0            → NO free requests at all. BYOK-only. A real, useful setting.
 *   n            → n requests per day.
 *
 * ZERO DOES NOT MEAN UNLIMITED, and that is a deliberate refusal.
 *
 * `0` is the natural way to write "none". An operator who wants to switch the free
 * tier OFF — because they only want BYOK — will type `0` and expect zero. If `0`
 * meant "unlimited" they would get the exact inverse of their intent: an unbounded
 * bill on their own key, with nothing in the UI to reveal it. A stray zero, an
 * empty field in a dashboard, a bad copy-paste — all silently uncap the spend.
 *
 * Every other guard in this app fails CLOSED. This one must too. `unlimited` cannot
 * be typed by accident and cannot be confused with "none", which is exactly why it
 * is a word and not a number.
 *
 * An unparseable value falls back to the default rather than becoming NaN — a NaN
 * limit makes every comparison false, which silently blocks ALL free traffic.
 */
function parseLimit(raw: string | undefined, fallback: number, name: string): number {
  const v = raw?.trim()
  if (!v) return fallback
  if (v.toLowerCase() === 'unlimited') return UNLIMITED

  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) {
    console.warn(
      `[quota] ${name}="${raw}" is not a whole number >= 0 or the word "unlimited" — ` +
      `falling back to ${fallback}.`,
    )
    return fallback
  }
  return n
}

/** The operator's daily budget ceiling, shared by everyone. THIS NUMBER IS THE
 *  BILL: a served tone costs roughly $0.035 (measured in production on Haiku 4.5 —
 *  see lib/server/usage.ts), so 100/day is about $3.50/day, ~$105/month worst case,
 *  and only if the pool is drained every single day.
 *
 *  It was 1000 by default — a ceiling nobody had chosen, which at the old model's
 *  ~$0.10/tone was ~$100 PER DAY. Change this deliberately: it is the only thing
 *  bounding what a day can cost. `unlimited` removes the bound entirely, which is
 *  reasonable when it is your own key and your own instance, and reckless when it
 *  is not. */
export const FREE_DAILY_LIMIT = parseLimit(process.env.FREE_DAILY_LIMIT, 100, 'FREE_DAILY_LIMIT')

/** What one device may take from that pool per day. Deliberately 10% of the pool:
 *  generous enough to genuinely try the product (several tones plus retries),
 *  bounded enough that one visitor cannot drain the day for everyone else.
 *
 *  Keep the RATIO if you change either number — 10-of-100 and 5-of-50 are the same
 *  fairness guarantee, and it is the ratio, not the absolute, that decides how
 *  many people a full pool can serve. */
export const FREE_DEVICE_DAILY_LIMIT = parseLimit(
  process.env.FREE_DEVICE_DAILY_LIMIT, 10, 'FREE_DEVICE_DAILY_LIMIT',
)

/** SQLite cannot bind Infinity. Where a limit becomes a SQL bound, send the largest
 *  integer instead — semantically identical at any traffic a day can produce. */
const sqlBound = (limit: number): number =>
  Number.isFinite(limit) ? limit : Number.MAX_SAFE_INTEGER

/** UTC date, `YYYY-MM-DD`. The quota resets at midnight UTC. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Which limit stopped the request. They mean different things to a user — one is
 *  "you've had your share", the other is "nothing you did; the pool is dry" — so
 *  the caller words them differently. */
export type QuotaBlock = 'device' | 'global'

export interface QuotaResult {
  allowed: boolean
  /** Set only when allowed === false. */
  blockedBy?: QuotaBlock
  /** Remaining for THIS device after this call. `'unlimited'` = no cap. */
  deviceRemaining: number | Unlimited
  /** Remaining in the shared pool after this call. `'unlimited'` = no cap. */
  globalRemaining: number | Unlimited
}

interface CountRow { count: number }

/** The literal an uncapped counter reports, on the wire and in the client's types.
 *  The SAME word the operator writes in the environment — one vocabulary from
 *  config to API to UI, with nothing to translate and nothing to infer. */
export const UNLIMITED_WIRE = 'unlimited' as const
export type Unlimited = typeof UNLIMITED_WIRE

/** One counter as the API reports it.
 *
 *  UNLIMITED IS THE STRING 'unlimited', NOT null, AND NOT Infinity.
 *
 *  - Infinity cannot survive JSON: `JSON.stringify(Infinity)` is `null`. So a
 *    naive implementation ships a null it never intended.
 *  - null is worse than useless here because it is OVERLOADED — it is also what a
 *    missing field, a failed parse, or a serialisation quirk looks like. Worse,
 *    JavaScript does arithmetic on it silently: `null - 5` is `-5`. A client that
 *    forgets to branch produces a plausible WRONG NUMBER instead of an error.
 *  - 'unlimited' cannot do that. `'unlimited' - 5` is NaN — visibly broken rather
 *    than quietly wrong — and the union type forces the client to handle it.
 */
export interface QuotaCounter {
  remaining: number | Unlimited
  limit: number | Unlimited
}

export interface QuotaView {
  device: QuotaCounter
  global: QuotaCounter
}

/** Shape one counter for the wire. An infinite limit becomes the literal. */
function counter(limit: number, used: number): QuotaCounter {
  if (!Number.isFinite(limit)) return { remaining: UNLIMITED_WIRE, limit: UNLIMITED_WIRE }
  return { remaining: Math.max(0, limit - used), limit }
}

/** True when a counter has no cap. Use this rather than testing the literal by
 *  hand — a stringly-typed comparison scattered across the codebase is how the
 *  next sentinel change breaks something quietly. */
export function isUnlimited(v: number | Unlimited): v is Unlimited {
  return v === UNLIMITED_WIRE
}

/** Read both counters without consuming anything. Backs `GET /api/quota`.
 *  `deviceId` is optional: an unauthenticated caller (the page before its first
 *  auth round-trip) still gets the global numbers. */
export function readQuota(deviceId?: string): QuotaView {
  const date = today()

  const g = db
    .prepare('SELECT count FROM daily_quota WHERE date = ?')
    .get(date) as unknown as CountRow | undefined

  let deviceCount = 0
  if (deviceId) {
    const d = db
      .prepare('SELECT count FROM daily_quota_device WHERE date = ? AND device_id = ?')
      .get(date, deviceId) as unknown as CountRow | undefined
    deviceCount = d?.count ?? 0
  }

  return {
    device: counter(FREE_DEVICE_DAILY_LIMIT, deviceCount),
    global: counter(FREE_DAILY_LIMIT, g?.count ?? 0),
  }
}

/**
 * Consume one free-tier request: one slot from this device's allowance AND one
 * from the shared pool.
 *
 * ORDER MATTERS. The device cap is checked first, so a user who has had their
 * share cannot keep draining the global pool — which is the entire point of
 * having a device cap. If the device passes but the GLOBAL pool is exhausted, the
 * device increment is rolled back: the request was never served, so it must not
 * count against the user's allowance.
 */
export function checkAndIncrementQuota(deviceId: string): QuotaResult {
  const date = today()

  // A zero limit is a HARD OFF, not a degenerate number. Short-circuit before
  // touching the DB: `count < 0` could never pass anyway, but saying it out loud
  // keeps "the operator switched the free tier off" from looking like "the pool
  // happens to be empty today".
  if (FREE_DEVICE_DAILY_LIMIT === 0 || FREE_DAILY_LIMIT === 0) {
    return {
      allowed: false,
      blockedBy: FREE_DEVICE_DAILY_LIMIT === 0 ? 'device' : 'global',
      deviceRemaining: 0,
      globalRemaining: 0,
    }
  }

  db.prepare('INSERT OR IGNORE INTO daily_quota_device (date, device_id, count) VALUES (?, ?, 0)')
    .run(date, deviceId)
  const deviceRow = db
    .prepare(
      `UPDATE daily_quota_device SET count = count + 1
        WHERE date = ? AND device_id = ? AND count < ?
        RETURNING count`,
    )
    .get(date, deviceId, sqlBound(FREE_DEVICE_DAILY_LIMIT)) as unknown as CountRow | undefined

  if (!deviceRow) {
    const view = readQuota(deviceId)
    return {
      allowed: false,
      blockedBy: 'device',
      deviceRemaining: 0,
      globalRemaining: view.global.remaining,
    }
  }

  db.prepare('INSERT OR IGNORE INTO daily_quota (date, count) VALUES (?, 0)').run(date)
  const globalRow = db
    .prepare(
      `UPDATE daily_quota SET count = count + 1
        WHERE date = ? AND count < ?
        RETURNING count`,
    )
    .get(date, sqlBound(FREE_DAILY_LIMIT)) as unknown as CountRow | undefined

  if (!globalRow) {
    // Pool is dry. Hand the device its slot back — it never got served, so it
    // would be wrong to spend the user's allowance on a request we refused.
    refundDevice(deviceId, date)
    return {
      allowed: false,
      blockedBy: 'global',
      deviceRemaining: counter(FREE_DEVICE_DAILY_LIMIT, deviceRow.count - 1).remaining,
      globalRemaining: 0,
    }
  }

  return {
    allowed: true,
    deviceRemaining: counter(FREE_DEVICE_DAILY_LIMIT, deviceRow.count).remaining,
    globalRemaining: counter(FREE_DAILY_LIMIT, globalRow.count).remaining,
  }
}

function refundDevice(deviceId: string, date: string): void {
  db.prepare('UPDATE daily_quota_device SET count = MAX(0, count - 1) WHERE date = ? AND device_id = ?')
    .run(date, deviceId)
}

/**
 * Give back one consumed free-tier slot — BOTH counters, since both were spent.
 * Called when a free request fails before delivering any output: the increments
 * happen up front (to reserve the slot under concurrency), so a request that then
 * errors would otherwise burn a slot for nothing. Clamped at 0 so a double-refund
 * or a post-midnight refund can't drive a counter negative.
 */
export function refundQuota(deviceId: string): void {
  const date = today()
  db.prepare('UPDATE daily_quota SET count = MAX(0, count - 1) WHERE date = ?').run(date)
  refundDevice(deviceId, date)
}
