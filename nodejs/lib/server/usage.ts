// Token accounting for a chat request.
//
// The app used to log latency and character counts and throw the token usage
// away — which meant a question as basic as "why did yesterday cost $20?" could
// only be answered by arithmetic and inference. This module keeps the number.
//
// WHY IT MATTERS HERE SPECIFICALLY. Web search is billed twice over:
//
//   1. $10 per 1,000 searches — a flat fee, and the small half.
//   2. The search RESULTS are billed as INPUT TOKENS. Anthropic's docs:
//      "Web search results retrieved throughout a conversation are counted as
//      input tokens, in search iterations executed during a single turn and in
//      subsequent conversation turns."
//
// (2) is the one that hurts, because a multi-step tool loop re-sends the
// accumulated results as input on EVERY step. So the figure that matters is the
// per-request TOTAL across steps (AI SDK `totalUsage`), not the last step's.
//
// Cost here is an ESTIMATE for triage — it tells you which requests are
// expensive and why. Anthropic's dashboard is the source of truth for billing.

/** Prices in USD per million tokens. Mirrors the model's row in
 *  https://platform.claude.com/docs/en/about-claude/pricing (read 2026-07-12). */
interface ModelPrice {
  input: number
  cacheWrite5m: number
  cacheRead: number
  output: number
}

// Only models in config/providers.yaml need an entry. An unknown model logs
// tokens with no cost rather than guessing at a price.
//
// NOTE on claude-sonnet-5: $2/$10 is INTRODUCTORY pricing, and it ends
// 2026-08-31 — after which it is $3/$15. It also bills on a newer tokenizer that
// emits ~30% more tokens for the same text, which is why claude-sonnet-4-6 is
// the default here despite the higher sticker price. If Sonnet 5 is ever made
// the default again, update these numbers first.
const PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-6': { input: 3.00, cacheWrite5m: 3.75, cacheRead: 0.30, output: 15.00 },
  'claude-sonnet-5':   { input: 2.00, cacheWrite5m: 2.50, cacheRead: 0.20, output: 10.00 },
  'claude-haiku-4-5':  { input: 1.00, cacheWrite5m: 1.25, cacheRead: 0.10, output: 5.00 },
}

/** $10 per 1,000 searches, charged on top of the tokens the results cost. */
const USD_PER_SEARCH = 10 / 1000

/** What one chat request consumed. Every field is optional because a provider
 *  may not report it — a missing number must never be silently read as zero. */
export interface RequestUsage {
  /** Total input, inclusive of cached tokens. */
  inputTokens?: number
  /** The input actually billed at the base rate (input minus cache read/write).
   *  This is the number that moves when search payload grows. */
  noCacheTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens?: number
  /** Searches Anthropic ran server-side for this request. */
  webSearches?: number
  /** Estimated USD, to 4dp. Absent when the model has no price entry. */
  estUsd?: number
  /** Estimated USD attributable to the search FEE alone — the rest is tokens.
   *  Splitting these is the whole point: they lead to different fixes. */
  estSearchFeeUsd?: number
}

/** AI SDK usage shape (ai@6 LanguageModelUsage), narrowed to what we log. */
interface SdkUsage {
  /** TOTAL input, INCLUSIVE of cached tokens — verified against a real run:
   *  noCacheTokens + cacheReadTokens + cacheWriteTokens === inputTokens.
   *  Pricing off this number double-counts the cache; use noCacheTokens. */
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  inputTokenDetails?: {
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/**
 * Fold the SDK's usage into the shape we log, with an estimated cost.
 *
 * Pass the per-request TOTAL (`totalUsage`), not a single step's — in a tool
 * loop the search payload is re-sent as input on every step, and that
 * amplification is precisely what we're trying to see.
 *
 * `webSearches` is not in the usage object; the AI SDK doesn't surface
 * Anthropic's `server_tool_use.web_search_requests` there. The caller counts the
 * search tool-calls it sees on the stream and passes the count in.
 */
export function summarizeUsage(
  usage: SdkUsage | undefined,
  model: string,
  webSearches?: number,
): RequestUsage {
  if (!usage) return {}

  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens

  // The three input buckets are billed at DIFFERENT rates, and `inputTokens` is
  // their sum — so the base-rate bucket is noCacheTokens, not inputTokens.
  // Pricing `inputTokens` at the base rate and then adding the cache lines on
  // top charges the cached tokens twice, which overstated a measured request by
  // ~2x before this was caught.
  const noCacheTokens =
    usage.inputTokenDetails?.noCacheTokens ??
    Math.max(0, (usage.inputTokens ?? 0) - (cacheReadTokens ?? 0) - (cacheWriteTokens ?? 0))

  const out: RequestUsage = {
    inputTokens: usage.inputTokens,
    noCacheTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: usage.totalTokens,
    webSearches,
  }

  const price = PRICES[model]
  if (!price) return out   // unknown model: report tokens, don't invent a price

  const usd =
    (noCacheTokens * price.input +
     (cacheReadTokens ?? 0) * price.cacheRead +
     (cacheWriteTokens ?? 0) * price.cacheWrite5m +
     (usage.outputTokens ?? 0) * price.output) / 1_000_000

  const searchFee = (webSearches ?? 0) * USD_PER_SEARCH

  out.estSearchFeeUsd = round4(searchFee)
  out.estUsd = round4(usd + searchFee)
  return out
}