// Model tiers — env-driven, so an operator can swap models without a rebuild.
// Inspired by mighty-ai-qr-web's split (a Sonnet workhorse + Haiku for the
// light QR-identify call).
//
//   TONEAI_MODEL        the DEFAULT chat model. Tone design needs real
//                          reasoning (web research + a constrained schema), so
//                          this is a Sonnet-tier model, NOT Opus.
//   TONEAI_MODEL_LIGHT  for processes that DON'T need deep reasoning
//                          (classification, short titling, extraction). Haiku.
//
// Both must be a model id present in the active provider's `models[]` list
// (config/providers.yaml). The DEFAULT_MODEL also overrides the default
// provider's `defaultModel` at registry load (ai-tools.ts), so the client
// picker and the server agree on one env-driven default.

export const DEFAULT_MODEL = process.env.TONEAI_MODEL?.trim() || 'claude-sonnet-5'
export const LIGHT_MODEL = process.env.TONEAI_MODEL_LIGHT?.trim() || 'claude-haiku-4-5'
