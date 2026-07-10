// Tone intent — the constrained contract the MODEL selects against.
//
// The model never writes a .tsl or a byte. It fills in this object: an amp
// voicing, gain staging, an EQ curve, and an effects chain, chosen from the
// verified enum vocabulary (enums.ts). A deterministic per-generation writer
// (writer.ts) turns intent → parameter image. This is the "invalid patches
// impossible by construction" design from docs/tsl-format.md § Design
// consequence: the model can only pick legal names and in-range knobs, so it
// cannot emit the 2,000-field soup a raw-JSON approach would risk.
//
// SCOPE: only parameters that are VERIFIED in docs/kat-format.md appear here.
// Speaker/mic labels, amp variation switching, and the FX sub-parameter trees
// are deliberately omitted until they're traced — a smaller honest schema beats
// a wide guessed one.
//
// Knob ranges are 0–100 (the Katana UI scale), NOT raw 7-bit MIDI. The writer
// owns the 0–100 → device-value mapping, because that mapping can differ per
// parameter and per generation.

import type { AmpName, OdDsName, DelayName, ReverbName, FxName } from './enums'

/** A 0–100 UI knob value. Not a byte — the writer scales it. */
export type Knob = number

export interface AmpChannel {
  /** Amp model by name (enums.ts AMP_TYPES). The writer resolves the byte. */
  type: AmpName
  gain: Knob
  bass: Knob
  middle: Knob
  treble: Knob
  presence: Knob
  level: Knob
}

export interface Booster {
  on: boolean
  /** OD/DS/booster voicing (enums.ts OD_DS_TYPES). */
  type: OdDsName
  drive: Knob
  tone: Knob
  level: Knob
}

export interface ModFx {
  on: boolean
  /** One of the shared MOD/FX pool (enums.ts FX_TYPES). Sub-params are not yet
   *  modelled — the writer applies the type and leaves defaults until the
   *  per-type trees are traced. */
  type: FxName
}

export interface Delay {
  on: boolean
  type: DelayName
  /** Milliseconds. The writer clamps + encodes to the device's time range. */
  timeMs: number
  feedback: Knob
  level: Knob
}

export interface Reverb {
  on: boolean
  type: ReverbName
  /** Seconds. Writer clamps + encodes. */
  timeS: number
  level: Knob
}

/**
 * A single Katana patch as tone intent.
 *
 * `name` is capped at 16 ASCII chars by the format (PATCH_NAME, offset 0–15,
 * space-padded). The writer enforces the cap; the model should aim short.
 *
 * The Katana has TWO independent preamp channels (A @ 81, B @ 129). Most
 * factory patches leave B off (Natural Clean). `ampB` is optional; omit it for
 * a single-amp patch.
 */
export interface TonePatch {
  name: string
  ampA: AmpChannel
  ampB?: AmpChannel
  booster: Booster
  fx1?: ModFx
  fx2?: ModFx
  delay: Delay
  reverb: Reverb
}

/** A neutral starting patch — clean amp, everything else off. Useful as the
 *  base the model edits, and as a writer smoke-test input. */
export function blankPatch(name = 'Init Patch'): TonePatch {
  return {
    name,
    ampA: { type: 'Clean', gain: 40, bass: 50, middle: 50, treble: 50, presence: 50, level: 60 },
    booster: { on: false, type: 'Overdrive', drive: 50, tone: 50, level: 50 },
    delay: { on: false, type: 'Digital', timeMs: 400, feedback: 30, level: 40 },
    reverb: { on: false, type: 'Plate', timeS: 2, level: 40 },
  }
}
