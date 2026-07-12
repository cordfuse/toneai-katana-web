// Operator authentication for the admin routes.
//
// ONE SHARED SECRET, and it is the operator's — not a user's. There is no admin
// UI, no login, no session: this exists so the person who pays the Anthropic bill
// can read their own telemetry. Everything here is built around the assumption
// that the token WILL eventually leak (a screenshot, shell history, a stray paste)
// and that the blast radius must stay small when it does.
//
// THREE PROPERTIES, each deliberate:
//
//   1. Unset ADMIN_TOKEN → the route 404s, not 401s. A deploy that has not opted
//      in should not have the endpoint AT ALL, and should not advertise its
//      existence to anyone probing for it. Absence of the env var is the off
//      switch, and it is the default.
//
//   2. The token travels in a HEADER, never a querystring. A URL-borne secret
//      leaks into server access logs, the platform's own request logs, browser
//      history, the Referer sent to third parties, every proxy in the path, and
//      any screenshot with the address bar in it. A token in a URL should be
//      assumed already compromised.
//
//   3. Constant-time comparison. A plain === on a secret leaks its length and
//      matching prefix through timing. It is two lines to do right.

import { timingSafeEqual } from 'node:crypto'

/** Header the operator's token is read from. Deliberately NOT `Authorization` —
 *  that header already carries the device JWT, and conflating two auth schemes on
 *  one header is how a check ends up accidentally passing the wrong credential. */
export const ADMIN_HEADER = 'x-admin-token'

/** Is the admin surface switched on for this deploy at all? */
export function adminEnabled(): boolean {
  return !!process.env.ADMIN_TOKEN?.trim()
}

/**
 * Verify an operator token in constant time.
 *
 * Returns false when the admin surface is disabled, so a caller that forgets to
 * check adminEnabled() still fails closed rather than open.
 */
export function isAdmin(presented: string | null | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN?.trim()
  if (!expected) return false
  if (!presented) return false

  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which would itself be a timing
  // signal. Compare lengths first, but STILL run the comparison on a same-length
  // buffer so a wrong-length guess costs the same as a wrong-value one.
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}
