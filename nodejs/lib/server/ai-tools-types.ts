// Type definitions shared between ai-tools.ts (factories + invocation
// helpers) and providers-config.ts (YAML loader). Lives separately so
// the loader doesn't pull in @ai-sdk/* runtime imports just to read the
// type shapes — pure type-only file, no runtime cost.

import type { LanguageModel } from 'ai'

export interface ModelInfo {
  id: string
  label: string
}

// Cloud only. The scaffold this app grew from also supported LOCAL providers
// (Ollama / LM Studio / llama.cpp) — a baseURL, a live /v1/models probe, and
// "is the server running?" error handling. All of it was unreachable here: the
// registry holds one cloud provider, and the loader throws on a provider with no
// factory, so a local entry could not exist without a code change.
export type ProviderCategory = 'cloud'

// Public factory shape — what callers of provider.createModel see. The
// provider config (envKey) is already resolved by the time it's called.
//
// `apiKey` is the BYOK path: when present it is a caller-supplied key that
// arrived on this request and must be used instead of the server's env key.
// It is a TRANSIENT credential — never persist it, never log it, and scrub
// it from provider error objects before surfacing them.
export type ModelFactory = (modelId: string, apiKey?: string) => LanguageModel

// Internal factory shape — what the FACTORIES map in ai-tools.ts uses.
// Receives the resolved ProviderInfo so any per-provider runtime wiring
// (env-var name, etc.) reads from the YAML-loaded config instead of being
// hard-coded in a closure at module load. The loader binds this to the
// public ModelFactory shape by partial application.
export type InternalModelFactory = (modelId: string, providerInfo: ProviderInfo, apiKey?: string) => LanguageModel

export interface ProviderInfo {
  id: string
  label: string
  category: ProviderCategory
  envKey?: string                  // env var that must be set for `available`
  defaultModel: string
  models: ModelInfo[]
  createModel: ModelFactory
}

export interface PublicProviderInfo {
  id: string
  label: string
  category: ProviderCategory
  available: boolean
  defaultModel: string
  models: ModelInfo[]
}
