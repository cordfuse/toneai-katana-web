// Patch pipeline — public surface.
//
// Tone intent → a downloadable patch, keyed off the Katana generation. See
// docs/tsl-format.md and docs/kat-format.md for what's verified vs assumed, and
// docs/settings.md § Tier 1 for the confidence guard this enforces.
//
// STATUS:
//   MkII — writes a .tsl liveset (writePatchTsl). Confidence 'derived':
//          app-accurate structure, not yet round-tripped against a real export.
//   MkI  — flat parameter image (writePatchImage), verified offsets.
//   MkIII/GO — declared, refuse to emit until their tables are extracted.
//
// NOT YET WIRED: the model-facing tool schema (the model still streams prose,
// not intent). That's the next phase this writer sits under.

import type { KatanaDevice } from '@/lib/storage'
import type { TonePatch } from './intent'
import { generationForDevice, GENERATIONS } from './generations'
import { LayoutNotExtractedError, UnvalidatedLayoutError, type WriteOptions } from './writer'
import { writeMk2Tsl } from './writers/mk2'
import { writeMk3Tsl } from './writers/mk3'
import { writeAirTsl } from './writers/air'
import { writeGoTsl, writeGoBassTsl } from './writers/go'
import { writeBassTsl } from './writers/bass'

// MkI registers its flat-image writer as a side effect.
import './writers/mk1'

export * from './enums'
export * from './intent'
export * from './generations'
export {
  type PatchImage, type PatchWriter, type WriteOptions,
  LayoutNotExtractedError, UnvalidatedLayoutError,
  writePatchImage, registerWriter,
} from './writer'
export { type SectionMap, toTsl, tslString, tslFilename } from './tsl'
export { buildMk2Sections, writeMk2Tsl } from './writers/mk2'
export { buildMk3Sections, writeMk3Tsl } from './writers/mk3'
export { buildAirSections, writeAirTsl, airAmpSettings, type AirAmpSettings } from './writers/air'
export { buildGoSections, writeGoTsl, buildGoBassSections, writeGoBassTsl } from './writers/go'
export { buildBassSections, writeBassTsl } from './writers/bass'
export {
  type ConvertNote, type ConvertedIntent, type ConvertedTone,
  canConvert, convertIntent, convertTone,
} from './convert'

/**
 * Write a .tsl liveset for a device, or throw if its layout can't be trusted.
 *
 * Enforces the confidence guard: 'verified' emits freely, 'derived' requires
 * `allowUnvalidated` (the caller must have shown the user the "unvalidated
 * patch" warning), 'unextracted' always throws. Only MkII has a .tsl writer
 * today; other generations throw LayoutNotExtractedError.
 */
export function writePatchTsl(
  patch: TonePatch,
  device: KatanaDevice,
  opts: WriteOptions = {},
): object {
  const generation = generationForDevice(device)
  const profile = GENERATIONS[generation]

  switch (profile.confidence) {
    case 'verified': break
    case 'derived':
      if (!opts.allowUnvalidated) throw new UnvalidatedLayoutError(generation)
      break
    case 'unextracted':
      throw new LayoutNotExtractedError(generation)
  }

  if (generation === 'mk2') return writeMk2Tsl(patch)
  if (generation === 'mk3') return writeMk3Tsl(patch)
  if (generation === 'air') return writeAirTsl(patch)
  if (generation === 'go') return writeGoTsl(patch)
  if (generation === 'gobass') return writeGoBassTsl(patch)
  if (generation === 'basshead') return writeBassTsl(patch)
  // MkI's deliverable path is the .kat flat image (writePatchImage); a MkI .tsl
  // wrapper isn't built yet. GO is guarded out above (unextracted).
  throw new LayoutNotExtractedError(generation)
}
