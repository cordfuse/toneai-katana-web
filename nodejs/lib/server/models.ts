// The chat model — env-driven, so an operator can swap models without a rebuild.
//
//   TONEAI_MODEL   the chat model. Must be an id present in the active
//                  provider's `models[]` list (config/providers.yaml), which is
//                  the allow-list that validates it.
//
// This is a SERVER decision: on the free tier the model spends the operator's
// key, so the client neither picks it nor sends it (app/api/chat/route.ts).
//
// WHY HAIKU (chosen 2026-07-12, after an A/B on the same two prompts).
// Haiku 4.5 costs ~2.4x less per tone than Sonnet 4.6 — measured, not estimated:
//
//   Ziggy Stardust   Sonnet $0.1139   Haiku $0.0446
//   Rebel Rebel      Sonnet $0.0817   Haiku $0.0365
//
// and the TONES were comparable: on Rebel Rebel both models independently picked
// Clean Twin + Overdrive + Comp with knob values within a few points of each
// other. What Haiku got wrong was not the tone but the PROSE — it ignored the
// "say nothing before the tool call" instruction and leaked its research notes.
// That is now handled structurally by the pre-tool narration filter in
// ai-tools.ts, rather than by trusting the model to obey.
//
// Sonnet 4.6 remains in the allow-list. If tone QUALITY ever regresses, set
// TONEAI_MODEL=claude-sonnet-4-6 and the app is back on it without a rebuild.
//
// There is deliberately no LIGHT_MODEL tier. The scaffold this app grew from had
// one (a Haiku for classification / short titling), but nothing here ever called
// it — every request is a tone design. Reintroduce it when there's a second,
// genuinely lighter call to make, not before.

export const DEFAULT_MODEL = process.env.TONEAI_MODEL?.trim() || 'claude-haiku-4-5'

/**
 * BYOK-only mode: the free tier is retired and every request must bring its own
 * key. The single authoritative switch — set it and free mode is off coherently
 * across the whole app (the /providers freeTier flag and the chat route both
 * read this). Lenient on the value so an operator can't get it subtly wrong:
 * `1`, `true`, or `yes` (any case) all count as on. Anything else is off.
 */
export function isByokOnly(): boolean {
  const v = process.env.TONEAI_BYOK_ONLY?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}
