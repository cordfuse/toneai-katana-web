// Secret scrubber. Runs before ANYTHING is written to a log buffer, persisted,
// or handed to the download — on both client and server. Its one non-negotiable
// job: an Anthropic API key must never survive into a log. It also strips the
// device JWT and any obviously-credential-named field, belt-and-suspenders.
//
// Covered by __tests__/scrub.test.ts, which plants keys in every shape and
// asserts none survive. Do not weaken the patterns without updating that test.

const REDACTED = '***REDACTED***'

// Anthropic keys are `sk-ant-…`; also catch a generic `sk-…` secret shape.
const ANTHROPIC_KEY_RE = /sk-ant-[A-Za-z0-9_-]{6,}/g
const GENERIC_SK_RE = /\bsk-[A-Za-z0-9]{16,}\b/g
// `Authorization: Bearer <jwt>` and bare JWTs (three base64url segments).
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

/** Redact secrets that appear inside a free-text string. */
export function scrubString(s: string): string {
  return s
    .replace(ANTHROPIC_KEY_RE, REDACTED)
    .replace(GENERIC_SK_RE, REDACTED)
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(JWT_RE, REDACTED)
}

// Field names whose VALUE is a credential and must be dropped wholesale. Matched
// on a normalised key (lowercased, non-alphanumerics removed) so `x-anthropic-key`,
// `apiKey`, and `api_key` all collapse to the same token. Note the plural-safe
// entries: "token" is redacted but "tokens" (usage counts) is deliberately not.
const SENSITIVE_KEYS = new Set([
  'authorization', 'xanthropickey', 'anthropickey', 'apikey', 'secret',
  'password', 'passwd', 'token', 'authtoken', 'byokkey', 'jwt', 'bearer',
  'cookie', 'setcookie',
])

const normKey = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Deep-scrub any JSON-serialisable value. Strings are pattern-scrubbed; object
 * keys that name a credential have their value redacted; everything else is
 * walked recursively. Cycle- and depth-guarded so a hostile or accidental
 * self-referential object can't hang the logger.
 */
export function scrub(value: unknown, depth = 8, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubString(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  if (depth <= 0) return '[Truncated]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((v) => scrub(v, depth - 1, seen))

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(normKey(k)) ? REDACTED : scrub(v, depth - 1, seen)
  }
  return out
}
