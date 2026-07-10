// The scrubber is the one thing standing between a user's Anthropic key and a
// downloadable log file. This test plants a key in every shape a log entry
// could carry it and asserts none survive. Run via `npm test` (tsx loader).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrub, scrubString } from '../scrub'

const KEY = 'sk-ant-api03-AbC123_def-456GHIjklMNOpqrs'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJkZXZpY2VJZCI6ImFiYyJ9.s3cr3tSignaturePart'

function serialize(v: unknown): string {
  return JSON.stringify(scrub(v))
}

test('a key in a plain string is redacted', () => {
  assert.ok(!scrubString(`key is ${KEY} ok`).includes(KEY))
})

test('a key nested deep in objects/arrays is redacted', () => {
  const blob = { a: { b: [{ note: `here: ${KEY}` }] } }
  assert.ok(!serialize(blob).includes(KEY))
})

test('credential-named fields are dropped wholesale', () => {
  const headers = { 'x-anthropic-key': KEY, apiKey: KEY, Authorization: `Bearer ${JWT}` }
  const out = serialize(headers)
  assert.ok(!out.includes(KEY))
  assert.ok(!out.includes(JWT))
})

test('a bare JWT and Bearer header are redacted', () => {
  assert.ok(!scrubString(`Authorization: Bearer ${JWT}`).includes(JWT))
  assert.ok(!scrubString(`token=${JWT};`).includes(JWT))
})

test('usage token COUNTS are preserved (not over-redacted)', () => {
  const usage = { tokens: { input: 1200, output: 340 }, inputTokens: 1200 }
  const out = scrub(usage) as typeof usage
  assert.equal(out.tokens.input, 1200)
  assert.equal(out.inputTokens, 1200)
})

test('circular references do not hang the scrubber', () => {
  const a: Record<string, unknown> = { name: 'x' }
  a.self = a
  const out = scrub(a) as Record<string, unknown>
  assert.equal(out.name, 'x')
  assert.equal(out.self, '[Circular]')
})

test('ordinary content is left intact', () => {
  const patch = { name: 'Bad Edge Chime', amp: 'VO Drive', gain: 38 }
  assert.deepEqual(scrub(patch), patch)
})
