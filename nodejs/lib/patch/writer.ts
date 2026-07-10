// Patch writer — tone intent → flat parameter image, per generation.
//
// This is the deterministic half of the pipeline. The model produces a
// TonePatch (intent.ts); a per-generation PatchWriter places those values at
// the device's fixed byte offsets. What comes out is the flat parameter image
// (the .kat body / the bytes a .tsl carries per section). Assembling the .tsl
// JSON WRAPPER around this image is a separate, still-unvalidated step (see
// docs/tsl-format.md § NOT verified) and is intentionally not done here yet.
//
// THE GUARD (docs/kat-format.md, docs/settings.md § Tier 1): a writer only
// emits when its layout is trustworthy. `verified` runs freely; `derived` runs
// only when the caller explicitly opts into an unvalidated patch; `unextracted`
// always throws. This makes "a patch the amp rejects is worse than none"
// enforceable at the type/flow level rather than by convention.

import type { KatanaDevice } from '@/lib/storage'
import type { TonePatch } from './intent'
import {
  type Generation, type GenerationProfile,
  GENERATIONS, generationForDevice,
} from './generations'

export type PatchImage = Uint8Array

/** A layout whose offset table hasn't been recovered from bytecode yet. */
export class LayoutNotExtractedError extends Error {
  constructor(public generation: Generation) {
    super(
      `KATANA ${generation} patch layout is not extracted yet. Its section+offset ` +
      `table (see docs/kat-format.md § Per-generation addressing) must be pulled ` +
      `from the Librarian bytecode and validated against a ground-truth .tsl before ` +
      `a writer can emit. Only MkI is currently writable.`,
    )
    this.name = 'LayoutNotExtractedError'
  }
}

/** A `derived` layout the caller tried to emit without opting into the risk. */
export class UnvalidatedLayoutError extends Error {
  constructor(public generation: Generation) {
    super(
      `KATANA ${generation} layout is derived from bytecode but never validated ` +
      `against a real export. Pass { allowUnvalidated: true } to emit anyway, and ` +
      `surface the "unvalidated patch" warning to the user first (docs/settings.md).`,
    )
    this.name = 'UnvalidatedLayoutError'
  }
}

export interface PatchWriter {
  readonly generation: Generation
  /** Fixed image length in bytes (MkI = 2797). */
  readonly imageSize: number
  /** Place intent values into a fresh image. Pure: no I/O, no shared state. */
  writeImage(patch: TonePatch): PatchImage
}

export interface WriteOptions {
  /** Permit a `derived` (bytecode-recovered, unvalidated) layout to emit. Has
   *  no effect on `verified` (always allowed) or `unextracted` (always throws). */
  allowUnvalidated?: boolean
}

// Writer registry. Populated by the per-generation modules via register().
// A map rather than static imports so a generation that isn't implemented is
// simply absent, and the guard below turns that into a clear error.
const WRITERS = new Map<Generation, PatchWriter>()

export function registerWriter(writer: PatchWriter): void {
  WRITERS.set(writer.generation, writer)
}

/** Enforce the confidence guard for a profile before any bytes are written. */
function assertWritable(profile: GenerationProfile, opts: WriteOptions): void {
  switch (profile.confidence) {
    case 'verified':
      return
    case 'derived':
      if (!opts.allowUnvalidated) throw new UnvalidatedLayoutError(profile.id)
      return
    case 'unextracted':
      throw new LayoutNotExtractedError(profile.id)
  }
}

/**
 * Write the flat parameter image for a device, or throw if its layout can't be
 * trusted. The single entry point callers should use.
 */
export function writePatchImage(
  patch: TonePatch,
  device: KatanaDevice,
  opts: WriteOptions = {},
): PatchImage {
  const generation = generationForDevice(device)
  const profile = GENERATIONS[generation]
  assertWritable(profile, opts)

  const writer = WRITERS.get(generation)
  if (!writer) {
    // Confidence said writable but no writer is registered — a wiring bug, not
    // a data-confidence issue. Fail loudly.
    throw new LayoutNotExtractedError(generation)
  }
  return writer.writeImage(patch)
}

// ─── shared encode helpers ───────────────────────────────────────────────────
// Katana data bytes are 7-bit (0–127). These convert intent values to that
// range and place them, with bounds checks so an off-by-one in an offset table
// surfaces as a throw, not a silently corrupt patch.

/** Clamp any number to a single 7-bit MIDI data byte. */
export function toByte(n: number): number {
  const v = Math.round(n)
  if (v < 0) return 0
  if (v > 127) return 127
  return v
}

/** Scale a 0–100 UI knob to the 0–127 device range. */
export function scaleKnob(knob: number): number {
  return toByte((knob / 100) * 127)
}

/** Place a byte at `offset`, guarding against writing past the image. */
export function putByte(image: PatchImage, offset: number, value: number): void {
  if (offset < 0 || offset >= image.length) {
    throw new RangeError(`patch offset ${offset} out of range (image ${image.length}B)`)
  }
  image[offset] = toByte(value)
}

/** Write PATCH_NAME: up to 16 ASCII bytes, space-padded (0x20), at offset 0. */
export function writePatchName(image: PatchImage, name: string): void {
  for (let i = 0; i < 16; i++) {
    const code = i < name.length ? name.charCodeAt(i) : 0x20
    // Non-ASCII or control chars → space, matching the format's ASCII-only field.
    image[i] = code >= 0x20 && code <= 0x7e ? code : 0x20
  }
}
