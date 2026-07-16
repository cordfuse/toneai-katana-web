// mapProviderError — the two failures below are not hypotheticals. They are the
// VERBATIM strings from the 29 errors on the first day of public traffic, copied
// out of the production log. If a future refactor stops matching them, real users
// go back to being shown "invalid x-api-key" and giving up.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapProviderError, BYOK_GUIDE_URL } from '../provider-errors'

// Exactly as Anthropic sent them (18x and 11x respectively).
const NO_CREDIT = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'
const BAD_KEY = 'invalid x-api-key'

test('BYOK: no credit names the Claude Pro trap explicitly', () => {
  const s = mapProviderError(NO_CREDIT, 'user')
  // The whole point. 18 of 29 failures were almost certainly people who thought a
  // Claude subscription included API access. If this assertion ever fails, the
  // message has stopped answering the question users actually have.
  assert.match(s, /Pro or Max subscription is billed\s+separately|does NOT include API access/i)
  assert.match(s, /Billing/)
  assert.ok(s.includes(BYOK_GUIDE_URL))
})

test('BYOK: an invalid key says what a key looks like and how to replace it', () => {
  const s = mapProviderError(BAD_KEY, 'user')
  assert.match(s, /sk-ant-/, 'tell them the shape of a real key')
  assert.match(s, /create a new one/i)
  assert.ok(s.includes(BYOK_GUIDE_URL))
  assert.doesNotMatch(s, /x-api-key/, 'never echo the raw provider jargon')
})

test('SERVER key out of credit: never tell a user to top up an account they do not own', () => {
  const s = mapProviderError(NO_CREDIT, 'server')
  assert.match(s, /free tier/i)
  assert.doesNotMatch(s, /your (Anthropic )?account/i)
  assert.doesNotMatch(s, /\$5/, 'billing advice is meaningless — it is not their bill')
})

test('SERVER key invalid: do not leak that OUR key is misconfigured', () => {
  const s = mapProviderError(BAD_KEY, 'server')
  assert.match(s, /free tier is no longer available/i)
  assert.doesNotMatch(s, /sk-ant-|x-api-key|ANTHROPIC_API_KEY/i)
})

test('rate limits are attributed to the right party', () => {
  assert.match(mapProviderError('rate_limit_error', 'user'), /your account|their limit on your key/i)
  assert.match(mapProviderError('rate_limit_error', 'server'), /Too many tones|give it a moment/i)
})

test('an overloaded provider reassures rather than blames the key', () => {
  const s = mapProviderError('Overloaded', 'user')
  assert.match(s, /busy/i)
  assert.match(s, /nothing is wrong with your key/i)
})

test('an unrecognised error passes through rather than being swallowed', () => {
  const s = mapProviderError('some brand new failure mode', 'user')
  assert.equal(s, 'some brand new failure mode')
})

test('a key leaked into an unmapped provider error is still scrubbed', () => {
  const s = mapProviderError('boom with sk-ant-api03-SECRETSECRETSECRET in it', 'user')
  assert.doesNotMatch(s, /sk-ant-api03-SECRET/)
  assert.match(s, /REDACTED/)
})

test('an empty error still says something', () => {
  assert.ok(mapProviderError('', 'user').length > 0)
})
