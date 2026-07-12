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

// Amp/effect type fields are plain strings, validated at write time against the
// TARGET DEVICE'S vocabulary (each writer resolves name -> byte via its own
// maps, throwing on an unknown name). They were fixed MkII-only unions; widening
// to string is what lets one intent shape carry MkII, Gen 3, etc. — the schema
// handed to the model still constrains the names per device (lib/patch/vocab).

/** A 0–100 UI knob value. Not a byte — the writer scales it. */
export type Knob = number

export interface AmpChannel {
  /** Amp model by name; resolved to a byte by the target device's writer. */
  type: string
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
  type: string
  drive: Knob
  tone: Knob
  level: Knob
}

export interface ModFx {
  on: boolean
  /** One of the shared MOD/FX pool (enums.ts FX_TYPES). */
  type: string
  // Common mod/dynamics knobs (0–100). Which apply depends on `type` — the writer
  // maps each to that effect's real byte offset (mk2 FX_PARAM_LAYOUT) and stamps a
  // musical default for any left unset, so an "on" effect is never silent. Effect
  // types outside the modelled set ignore these and write type-only.
  rate?: Knob
  depth?: Knob
  level?: Knob
  /** Resonance / feedback — phaser, flanger. */
  reso?: Knob
  /** Compressor: sustain, attack, tone. */
  sustain?: Knob
  attack?: Knob
  tone?: Knob
}

export interface Delay {
  on: boolean
  type: string
  /** Milliseconds. The writer clamps + encodes to the device's time range. */
  timeMs: number
  feedback: Knob
  level: Knob
}

export interface Reverb {
  on: boolean
  type: string
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

/**
 * One-line, human-readable summary of what the model actually dialled.
 *
 * This is TELEMETRY, and it is the only record of the model's real output. The log
 * used to store just the tone's NAME ("Rebel Rebel"), which tells you nothing about
 * whether the patch behind it was any good. With this you can answer the questions
 * that matter after a model change: is it reaching for the same amp every time? has
 * it stopped using the delay? are the gain values sane, or is everything pinned at
 * 100?
 *
 * Safe to log unconditionally: this is the MODEL's output, not the user's words.
 * Unlike a prompt it carries nothing personal, so it is never withheld.
 *
 * Example:
 *   Clean Twin g38 b44 m60 t72 p65 · OD Overdrive d52 t72 · FX1 Comp · Reverb Room 1.0s
 */
export function describePatch(p: TonePatch): string {
  const parts: string[] = []

  const amp = (a: AmpChannel) =>
    `${a.type} g${a.gain} b${a.bass} m${a.middle} t${a.treble} p${a.presence}`
  parts.push(amp(p.ampA))
  if (p.ampB) parts.push(`+amp2 ${amp(p.ampB)}`)

  // `on: false` is meaningful — "the model chose NOT to use a drive" is a finding,
  // not an absence. Record it rather than dropping the block silently.
  parts.push(p.booster.on
    ? `OD ${p.booster.type} d${p.booster.drive} t${p.booster.tone}`
    : 'OD off')

  const fx = (f: ModFx | undefined, label: string) =>
    !f ? null : f.on ? `${label} ${f.type}` : `${label} off`
  const fx1 = fx(p.fx1, 'FX1'); if (fx1) parts.push(fx1)
  const fx2 = fx(p.fx2, 'FX2'); if (fx2) parts.push(fx2)

  parts.push(p.delay.on
    ? `Delay ${p.delay.type} ${p.delay.timeMs}ms fb${p.delay.feedback}`
    : 'Delay off')

  parts.push(p.reverb.on
    ? `Reverb ${p.reverb.type} ${p.reverb.timeS.toFixed(1)}s`
    : 'Reverb off')

  return parts.join(' · ')
}
