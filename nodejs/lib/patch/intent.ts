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

import type { PickupNoise } from '@/lib/gear'

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
 * The noise suppressor — the gate between the pickups and a high-gain preamp.
 *
 * THIS IS NOT A GARNISH. It is why a real player's metal patch is playable and
 * ours was not. Every patch this app has ever produced shipped with the gate OFF
 * (NS1_ON_OFF = 0), because the writer never wrote the byte and the donor template
 * it clones is a CLEAN patch, which has no use for one. Stack gain 85 on top of a
 * clean patch's settings and the amp howls the moment you touch the strings — which
 * is exactly what a MkII owner reported.
 *
 * A gate is not optional above roughly half gain. It is part of the tone.
 *
 * `threshold` is how loud the signal must be to open the gate: too low and the hiss
 * comes through anyway, too high and quiet notes get chopped off. It scales with how
 * much dirt is in front of it. `release` is how fast it shuts once you stop.
 */
export interface NoiseSuppressor {
  on: boolean
  /** 0–100. Higher = gate opens later. Scale it with gain. */
  threshold: Knob
  /** 0–100. How quickly the gate closes after the note dies. */
  release: Knob
}

/**
 * Raise the gate for a noisy pickup. DETERMINISTIC — not left to the model.
 *
 * The prompt asks the model to give a single coil 8-12 more threshold than a
 * humbucker. Measured, on the same prompt and the same gain with only the pickup
 * changed, it gave it TWO:
 *
 *   bridge humbucker -> threshold 48
 *   neck P-90        -> threshold 50
 *
 * That is the same failure we already hit once on this codebase, when we asked the
 * model nicely not to narrate before a tool call and it narrated anyway. The lesson
 * held then and holds now: if a rule must be true, ENFORCE IT IN CODE. A prompt is
 * guidance; a function is a guarantee.
 *
 * So the model's gate is a starting point, and this is the correction applied to it
 * on the way to the writer. It only ever raises — a model that already understood the
 * pickup keeps its (higher) choice.
 *
 * `mixed` gets half the bump: the player left the position on auto with both kinds of
 * pickup fitted, so we genuinely do not know which one they'll select, and splitting
 * the difference beats under-gating a P-90 into a high-gain patch.
 */
export function calibrateGateForPickup(ns: NoiseSuppressor, noise: PickupNoise): NoiseSuppressor {
  if (!ns.on) return ns
  const bump = noise === 'single-coil' ? 10 : noise === 'mixed' ? 5 : 0
  if (bump === 0) return ns
  // Cap at 60. Past that the gate stops being a gate and starts eating the player's
  // quiet notes, which sounds like a broken patch rather than a noisy one.
  return { ...ns, threshold: Math.min(60, Math.max(ns.threshold, ns.threshold + bump)) }
}

/**
 * Pick a sane gate for a patch that didn't specify one.
 *
 * The model SHOULD choose this (it knows whether it's designing a jazz clean or a
 * djent chug), and the schema asks it to. But the writer must never emit a patch
 * with an unconsidered gate again, so this is the floor: derive it from how much
 * gain is actually in the signal path.
 *
 * Deliberately conservative. A gate that is slightly too open leaves a little hiss;
 * a gate that is too aggressive eats the tail of every note and sounds broken. When
 * guessing, err toward hiss.
 */
export function defaultNoiseSuppressor(p: TonePatch): NoiseSuppressor {
  // Total dirt in front of the gate: preamp gain, plus whatever the booster adds.
  const drive = p.booster?.on ? (p.booster.drive ?? 0) : 0
  const heat = p.ampA.gain + drive * 0.4

  // Below this, a gate does more harm than good — cleans keep their bloom.
  if (heat < 45) return { on: false, threshold: 0, release: 50 }

  // Ramp the threshold with the heat, and CAP IT WELL BELOW the top of the range.
  // This is the derived fallback, not a considered choice, so it must fail in the
  // forgiving direction: a slightly open gate leaves a little hiss (annoying), a gate
  // set too high swallows the tail of every quiet note (sounds broken, and the player
  // blames the patch). ~15 at the edge of breakup, ~44 for a fully saturated stack.
  const threshold = Math.round(Math.min(45, 15 + (heat - 45) * 0.45))
  return { on: true, threshold, release: 50 }
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
  /** The gate. Omitted → the writer derives one from the gain
   *  (defaultNoiseSuppressor). It is NEVER left to the donor template. */
  noiseSuppressor?: NoiseSuppressor
  /** 0–100 patch output level, so one tone isn't twice as loud as the next.
   *  Omitted → 100 (unity), written explicitly rather than inherited. */
  patchLevel?: Knob
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

  // The gate goes in the log line because it is the parameter that made patches
  // unplayable while nobody was looking. Report what will actually be WRITTEN —
  // the derived gate when the model didn't choose one — not just what it said.
  const ns = p.noiseSuppressor ?? defaultNoiseSuppressor(p)
  parts.push(ns.on ? `NS thr${ns.threshold}` : 'NS off')

  return parts.join(' · ')
}
