// Patch pipeline — public surface.
//
// The tone-intent → parameter-image writer, keyed off the Katana generation.
// See docs/tsl-format.md and docs/kat-format.md for what's verified vs assumed,
// and docs/settings.md § Tier 1 for the confidence guard this enforces.
//
// STATUS: MkI writes (verified). MkII/MkIII/GO are declared generations whose
// writers refuse to emit until their offset tables are extracted and validated
// (writers/mk2.ts documents the promotion steps).
//
// NOT YET WIRED: the model-facing tool schema (the model still streams prose,
// not intent) and the .tsl JSON wrapper around the parameter image. Both are
// the next phase — this module is the deterministic writer they'll sit on top of.

// Importing the writer modules runs their registerWriter() side effects. Must
// happen before writePatchImage() is called, so the barrel owns it.
import './writers/mk1'
import './writers/mk2'

export * from './enums'
export * from './intent'
export * from './generations'
export {
  type PatchImage, type PatchWriter, type WriteOptions,
  LayoutNotExtractedError, UnvalidatedLayoutError,
  writePatchImage, registerWriter,
} from './writer'
