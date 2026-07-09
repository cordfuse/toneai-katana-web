// Loader for config/providers.yaml — the operator-visible provider registry.
//
// Keeps the per-provider DATA (id, label, category, envKey, defaultModel,
// models[], baseURL bits) in YAML so it can be edited without touching
// TypeScript, while the per-provider BEHAVIOR (factory functions that
// construct AI SDK LanguageModel instances) stays in code where it can
// import provider SDKs and reference closure-captured env-detection logic.
//
// Schema, validation, and merge are all here so ai-tools.ts stays focused
// on AI SDK invocation rather than config plumbing.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { ProviderInfo, InternalModelFactory, ProviderCategory, ModelInfo } from './ai-tools-types'

// Path resolution: next.js runtime cwd is the project root in dev + on
// Vercel. process.cwd() gives the same root in both. The YAML lives at
// config/providers.yaml relative to that root.
const CONFIG_PATH = join(process.cwd(), 'config', 'providers.yaml')

interface RawModelEntry { id?: unknown; label?: unknown }
interface RawProviderEntry {
  label?: unknown
  category?: unknown
  envKey?: unknown
  baseURLEnv?: unknown
  defaultBaseURL?: unknown
  defaultModel?: unknown
  models?: unknown
}
interface RawConfig {
  providers?: Record<string, RawProviderEntry>
}

class ProviderConfigError extends Error {}

function validateModels(providerId: string, raw: unknown): ModelInfo[] {
  if (!Array.isArray(raw)) {
    throw new ProviderConfigError(`provider ${providerId}: models must be an array`)
  }
  const out: ModelInfo[] = []
  for (const [i, m] of (raw as RawModelEntry[]).entries()) {
    if (!m || typeof m !== 'object') {
      throw new ProviderConfigError(`provider ${providerId}: models[${i}] must be an object with id+label`)
    }
    if (typeof m.id !== 'string' || m.id.length === 0) {
      throw new ProviderConfigError(`provider ${providerId}: models[${i}].id missing or not a string`)
    }
    if (typeof m.label !== 'string' || m.label.length === 0) {
      throw new ProviderConfigError(`provider ${providerId}: models[${i}].label missing or not a string`)
    }
    out.push({ id: m.id, label: m.label })
  }
  return out
}

function validateCategory(providerId: string, raw: unknown): ProviderCategory {
  if (raw !== 'cloud' && raw !== 'local') {
    throw new ProviderConfigError(`provider ${providerId}: category must be 'cloud' or 'local'`)
  }
  return raw
}

/**
 * Merge YAML data with a code-side factory map.
 *
 * @param factories — keyed by provider id, each receives the resolved
 *                    ProviderInfo at call time so per-provider config
 *                    (envKey, baseURLEnv, defaultBaseURL) reads from
 *                    YAML and isn't hard-coded in a closure. Entries
 *                    with no matching YAML provider are silently ignored
 *                    (lets you keep a factory around for a provider the
 *                    operator removed from YAML without crashing).
 * @returns the same ProviderInfo[] shape that pre-YAML code expected
 *          (id, label, category, models, createModel, etc.), assembled
 *          per the YAML's provider order so the UI listing is stable.
 *          The exposed `createModel` is the standard ModelFactory
 *          shape (m) => LanguageModel — the loader binds the
 *          providerInfo arg via partial application.
 */
export function loadProvidersConfig(
  factories: Record<string, InternalModelFactory>,
): ProviderInfo[] {
  let raw: string
  try {
    raw = readFileSync(CONFIG_PATH, 'utf-8')
  } catch (err) {
    throw new ProviderConfigError(`config/providers.yaml not readable: ${(err as Error).message}`)
  }
  const parsed = parseYaml(raw) as RawConfig | null
  if (!parsed || typeof parsed !== 'object' || !parsed.providers || typeof parsed.providers !== 'object') {
    throw new ProviderConfigError(`config/providers.yaml: top-level 'providers' key missing or not an object`)
  }

  const out: ProviderInfo[] = []
  for (const [providerId, entry] of Object.entries(parsed.providers)) {
    if (!entry || typeof entry !== 'object') {
      throw new ProviderConfigError(`provider ${providerId}: entry must be an object`)
    }
    if (typeof entry.label !== 'string' || entry.label.length === 0) {
      throw new ProviderConfigError(`provider ${providerId}: label required`)
    }
    const category = validateCategory(providerId, entry.category)
    if (typeof entry.defaultModel !== 'string' || entry.defaultModel.length === 0) {
      throw new ProviderConfigError(`provider ${providerId}: defaultModel required`)
    }
    const models = validateModels(providerId, entry.models)
    if (!models.some(m => m.id === entry.defaultModel)) {
      throw new ProviderConfigError(`provider ${providerId}: defaultModel '${entry.defaultModel as string}' not in models[]`)
    }
    const factory = factories[providerId]
    if (!factory) {
      throw new ProviderConfigError(`provider ${providerId}: no factory wired in ai-tools.ts; add an entry to FACTORIES or remove from YAML`)
    }

    // Build the ProviderInfo with a placeholder createModel, fill the
    // category-specific config, then bind the factory to the now-resolved
    // ProviderInfo via partial application. The factory closure captures
    // `info` by reference, so it sees the YAML-loaded envKey / baseURLEnv /
    // defaultBaseURL at call time — not at module load.
    const info: ProviderInfo = {
      id: providerId,
      label: entry.label,
      category,
      defaultModel: entry.defaultModel,
      models,
      // Placeholder — replaced below once info is fully populated.
      createModel: () => { throw new Error(`provider ${providerId}: createModel called before binding`) },
    }
    if (category === 'cloud') {
      if (typeof entry.envKey !== 'string' || entry.envKey.length === 0) {
        throw new ProviderConfigError(`provider ${providerId}: cloud providers require envKey`)
      }
      info.envKey = entry.envKey
    } else {
      // category === 'local'
      if (typeof entry.baseURLEnv !== 'string' || entry.baseURLEnv.length === 0) {
        throw new ProviderConfigError(`provider ${providerId}: local providers require baseURLEnv`)
      }
      if (typeof entry.defaultBaseURL !== 'string' || entry.defaultBaseURL.length === 0) {
        throw new ProviderConfigError(`provider ${providerId}: local providers require defaultBaseURL`)
      }
      info.baseURLEnv = entry.baseURLEnv
      info.defaultBaseURL = entry.defaultBaseURL
    }
    info.createModel = (modelId: string) => factory(modelId, info)
    out.push(info)
  }
  return out
}
