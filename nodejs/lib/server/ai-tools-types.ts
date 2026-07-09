// Type definitions shared between ai-tools.ts (factories + invocation
// helpers) and providers-config.ts (YAML loader). Lives separately so
// the loader doesn't pull in @ai-sdk/* runtime imports just to read the
// type shapes — pure type-only file, no runtime cost.

import type { LanguageModel } from 'ai'

export interface ModelInfo {
  id: string
  label: string
}

export type ProviderCategory = 'cloud' | 'local'

// Public factory shape — what callers of provider.createModel see. Pure
// (modelId) -> LanguageModel because by the time it's called the
// provider config (envKey, baseURL bits) is already resolved.
export type ModelFactory = (modelId: string) => LanguageModel

// Internal factory shape — what the FACTORIES map in ai-tools.ts uses.
// Receives the resolved ProviderInfo so any per-provider runtime wiring
// (env-var name, baseURL, etc.) reads from the YAML-loaded config instead
// of being hard-coded in a closure at module load. The loader binds this
// to the public ModelFactory shape by partial application.
export type InternalModelFactory = (modelId: string, providerInfo: ProviderInfo) => LanguageModel

export interface ProviderInfo {
  id: string
  label: string
  category: ProviderCategory
  envKey?: string                  // cloud: env var that must be set
  baseURLEnv?: string              // local: env var that overrides baseURL
  defaultBaseURL?: string          // local: fallback baseURL
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
