// The chat model — env-driven, so an operator can swap models without a rebuild.
//
//   TONEAI_MODEL   the chat model. Tone design needs real reasoning (web
//                  research + a constrained schema), so this is a Sonnet-tier
//                  model, NOT Opus. Must be an id present in the active
//                  provider's `models[]` list (config/providers.yaml), which is
//                  the allow-list that validates it.
//
// This is a SERVER decision: on the free tier the model spends the operator's
// key, so the client neither picks it nor sends it (app/api/chat/route.ts).
//
// There is deliberately no LIGHT_MODEL tier. The scaffold this app grew from had
// one (a Haiku for classification / short titling), but nothing here ever called
// it — every request is a tone design. Reintroduce it when there's a second,
// genuinely lighter call to make, not before.

export const DEFAULT_MODEL = process.env.TONEAI_MODEL?.trim() || 'claude-sonnet-4-6'
