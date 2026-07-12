// Cross-device tone conversion — re-voice a stored tone INTENT for a different
// KATANA generation, then let that generation's writer emit the .tsl.
//
// This is possible because a generated tone keeps its device-agnostic intent
// (TonePatch), so converting never parses a .tsl — it re-renders the intent
// through the target writer (lib/patch/index.ts). Only the categorical NAMES
// need translating; every numeric (gain, EQ, knobs 0–100, delay ms, reverb s)
// is device-neutral and copies straight across.
//
// Two translation strategies, by how BOSS treated each category across gens:
//   • Boosters / FX / delays / reverbs — BOSS kept the same names, differing only
//     in case or punctuation ("DST Plus" ↔ "DST+", "AC Processor" ↔
//     "AC.PROCESSOR"). A normalized-name match maps them near-losslessly. An
//     effect with no counterpart on the target (e.g. MkII "Tera Echo" → Gen 3)
//     turns its slot OFF rather than emit a name the amp would reject.
//   • Amps — Gen 3 collapsed MkII's 33 models into 6 "characters", so amps need a
//     semantic bucket map (AMP_CANON). This is the one lossy, curated category.
//
// Conversion is best-match in TONE, never in VALIDITY: canonical→native and the
// name matcher always resolve to a real name on the target, so a converted patch
// is always importable (docs/CLAUDE.md: "a patch the amp rejects is worse than
// no patch"). What was approximated is reported in `notes` for the UI to show.

import { type KatanaDevice, instrumentForDevice } from '@/lib/storage'
import type { TonePatch, ModFx } from './intent'
import { generationForDevice, type Generation } from './generations'
import { vocabForGeneration } from './vocab'
import { writePatchTsl } from './index'
import { tslString, tslFilename } from './tsl'

// ── name normalization (boosters / FX / delays / reverbs) ────────────────────

/** Fold case + punctuation so "DST Plus"/"DST+" and "AC Processor"/"AC.PROCESSOR"
 *  compare equal. "+" becomes "PLUS" first so it survives the strip. */
function norm(s: string): string {
  return s.toUpperCase().replace(/\+/g, 'PLUS').replace(/[^A-Z0-9]/g, '')
}

/** The target name whose normalized form matches `name`, or undefined if the
 *  target generation has no equivalent effect. */
function matchByName(name: string, target: readonly string[]): string | undefined {
  const n = norm(name)
  return target.find(t => norm(t) === n)
}

// ── amp character buckets (the one curated map) ──────────────────────────────
//
// Canonical set = Gen 3's six amp characters, the coarsest common vocabulary.
// Every source amp maps to a bucket; each target picks a representative amp per
// bucket. Gen 3 ↔ canonical is identity; MkII needs the 33→6 collapse below.

type AmpCanon = 'acoustic' | 'clean' | 'pushed' | 'crunch' | 'lead' | 'brown'

const MK2_AMP_CANON: Record<string, AmpCanon> = {
  'Natural Clean': 'clean', 'Clean': 'clean', 'Clean Twin': 'clean', 'Clean (Variation)': 'clean',
  'Acoustic': 'acoustic', 'Acoustic (Variation)': 'acoustic',
  'VO Drive': 'pushed', 'Match Drive': 'pushed',
  'Combo Crunch': 'crunch', 'Stack Crunch': 'crunch', 'Pro Crunch': 'crunch', 'Crunch': 'crunch',
  'Deluxe Crunch': 'crunch', 'MS1959 I': 'crunch', 'Orange Rocker': 'crunch', 'Crunch (Variation)': 'crunch',
  'Hi-Gain Stack': 'lead', 'Power Drive': 'lead', 'Extreme Lead': 'lead', 'VO Lead': 'lead',
  'BG Lead': 'lead', 'BG Drive': 'lead', 'MS1959 I+II': 'lead', 'R-Fire Vintage': 'lead',
  'T-Amp Lead': 'lead', 'Lead': 'lead', 'Custom': 'lead', 'Lead (Variation)': 'lead',
  'Core Metal': 'brown', 'R-Fire Modern': 'brown', 'Brown': 'brown', 'Bogner Uber': 'brown',
  'Brown (Variation)': 'brown',
}
const MK3_AMP_CANON: Record<string, AmpCanon> = {
  ACOUSTIC: 'acoustic', CLEAN: 'clean', PUSHED: 'pushed', CRUNCH: 'crunch', LEAD: 'lead', BROWN: 'brown',
}
// Air has FIVE panel voices — no PUSHED (it folds into CRUNCH). These are the amp
// INSTRUCTIONS an Air tone ships (the amp is never written to the .tsl).
const AIR_AMP_CANON: Record<string, AmpCanon> = {
  ACOUSTIC: 'acoustic', CLEAN: 'clean', CRUNCH: 'crunch', LEAD: 'lead', BROWN: 'brown',
}
// GO guitar mode shares Air's 5-voice amp model (no PUSHED).
const GO_AMP_CANON: Record<string, AmpCanon> = {
  ACOUSTIC: 'acoustic', CLEAN: 'clean', CRUNCH: 'crunch', LEAD: 'lead', BROWN: 'brown',
}
const AMP_TO_CANON: Partial<Record<Generation, Record<string, AmpCanon>>> = {
  mk2: MK2_AMP_CANON, mk3: MK3_AMP_CANON, air: AIR_AMP_CANON, go: GO_AMP_CANON,
}

// Generations that can take part in a conversion — every one with a writer + a
// tone vocabulary. Guitar generations translate amps through the character canon
// above; the bass generations (gobass / basshead) have no such canon (their amp
// voices — VINTAGE / FLAT / MODERN — aren't guitar characters), so they translate
// amps by NAME instead, like effects. The instrument gate in canConvert keeps the
// two families from ever crossing, so name-vs-canon never mix within one convert.
const CONVERTIBLE = new Set<Generation>(['mk2', 'mk3', 'air', 'go', 'gobass', 'basshead'])

// Representative amp per bucket, per generation. Air has no PUSHED voice, so
// pushed maps to its nearest, CRUNCH.
const AMP_FROM_CANON: Partial<Record<Generation, Record<AmpCanon, string>>> = {
  mk2: { acoustic: 'Acoustic', clean: 'Clean', pushed: 'VO Drive', crunch: 'Crunch', lead: 'Lead', brown: 'Brown' },
  mk3: { acoustic: 'ACOUSTIC', clean: 'CLEAN', pushed: 'PUSHED', crunch: 'CRUNCH', lead: 'LEAD', brown: 'BROWN' },
  air: { acoustic: 'ACOUSTIC', clean: 'CLEAN', pushed: 'CRUNCH', crunch: 'CRUNCH', lead: 'LEAD', brown: 'BROWN' },
  go: { acoustic: 'ACOUSTIC', clean: 'CLEAN', pushed: 'CRUNCH', crunch: 'CRUNCH', lead: 'LEAD', brown: 'BROWN' },
}

/** Translate an amp name from one generation to another. Two paths:
 *   • Both generations have a character canon (guitar) → map through the bucket.
 *   • Neither does (bass↔bass) → match by name, falling back to the target's first
 *     voice when the source voice has no counterpart (e.g. GO bass FLAT, which the
 *     desktop KATANA BASS lacks → its first voice, VINTAGE).
 *  Returns a name that is always valid on the target; never fails. */
function convertAmp(name: string, from: Generation, to: Generation, targetAmps: readonly string[]): string {
  const fromCanon = AMP_TO_CANON[from]
  const toCanon = AMP_FROM_CANON[to]
  if (fromCanon && toCanon) {
    const canon = fromCanon[name] ?? 'crunch'
    return toCanon[canon] ?? name
  }
  return matchByName(name, targetAmps) ?? targetAmps[0] ?? name
}

// ── conversion ───────────────────────────────────────────────────────────────

/** One approximation made during conversion, for the UI to surface. `to === null`
 *  means the effect had no target equivalent and its slot was turned off. */
export interface ConvertNote {
  field: string
  from: string
  to: string | null
}

export interface ConvertedIntent {
  patch: TonePatch
  notes: ConvertNote[]
}

/** True when a tone for `from` can be meaningfully re-voiced for `to`.
 *
 *  Three gates:
 *   1. SAME INSTRUMENT — a guitar tone is never converted to a bass rig or vice
 *      versa (different amps/EQ/voicing). This is the explicit cross-instrument
 *      guard; it also lets bass↔bass conversion work for free once a second bass
 *      device with a canon exists, without leaking across instruments.
 *   2. Different generation — nothing to do converting a device to itself.
 *   3. Both generations are convertible — have a writer + tone vocabulary. Guitar
 *      devices translate amps by character canon; bass devices by name (see
 *      convertAmp). The instrument gate keeps the two families from crossing.
 */
export function canConvert(from: KatanaDevice, to: KatanaDevice): boolean {
  if (instrumentForDevice(from) !== instrumentForDevice(to)) return false
  const f = generationForDevice(from), t = generationForDevice(to)
  return f !== t && CONVERTIBLE.has(f) && CONVERTIBLE.has(t)
}

/** Re-voice a tone intent for another device. Numerics copy unchanged; names are
 *  translated (amps by character bucket, effects by normalized name). Effects
 *  with no target equivalent are switched off. Returns the new intent + notes. */
export function convertIntent(patch: TonePatch, from: KatanaDevice, to: KatanaDevice): ConvertedIntent {
  const fromGen = generationForDevice(from)
  const toGen = generationForDevice(to)
  const next: TonePatch = structuredClone(patch)
  const notes: ConvertNote[] = []
  if (fromGen === toGen) return { patch: next, notes }

  const vocab = vocabForGeneration(toGen)

  // Amp — always present; character-bucket remap (guitar) or name match (bass).
  const newAmp = convertAmp(patch.ampA.type, fromGen, toGen, vocab.amps)
  if (newAmp !== patch.ampA.type) notes.push({ field: 'Amp', from: patch.ampA.type, to: newAmp })
  next.ampA.type = newAmp

  // Booster — normalized-name match; drop (off) if no equivalent.
  if (patch.booster.on) {
    const m = matchByName(patch.booster.type, vocab.boosters)
    if (m) next.booster.type = m
    else { next.booster.on = false; notes.push({ field: 'Booster / OD', from: patch.booster.type, to: null }) }
  }

  // FX slots — same treatment.
  const convertFx = (fx: ModFx | undefined, label: string) => {
    if (!fx?.on) return
    const m = matchByName(fx.type, vocab.fx)
    if (m) fx.type = m
    else { fx.on = false; notes.push({ field: label, from: fx.type, to: null }) }
  }
  convertFx(next.fx1, 'FX 1')
  convertFx(next.fx2, 'FX 2')

  // Delay / reverb — sets are identical across the guitar gens, but the two bass
  // devices differ (GO bass has PAN / STEREO delays the desktop KATANA BASS lacks).
  // Match by name; when there's no counterpart, fall back to the target's first
  // type (keeping the timing/feedback/level intact) rather than leave a name the
  // writer would reject. Note the swap so the UI can surface it.
  const remapTimeFx = (
    fx: { on: boolean; type: string }, target: readonly string[], label: string,
  ) => {
    if (!fx.on) return
    const m = matchByName(fx.type, target)
    if (m) { fx.type = m; return }
    if (target.length && fx.type !== target[0]) {
      notes.push({ field: label, from: fx.type, to: target[0] })
      fx.type = target[0]
    }
  }
  remapTimeFx(next.delay, vocab.delays, 'Delay')
  remapTimeFx(next.reverb, vocab.reverbs, 'Reverb')

  return { patch: next, notes }
}

export interface ConvertedTone {
  patch: TonePatch
  notes: ConvertNote[]
  tsl: string
  filename: string
}

/** Convert an intent AND render the target .tsl in one step. Throws only if the
 *  target writer refuses (it won't for a supported device). */
export function convertTone(patch: TonePatch, from: KatanaDevice, to: KatanaDevice): ConvertedTone {
  const { patch: next, notes } = convertIntent(patch, from, to)
  const tsl = writePatchTsl(next, to, { allowUnvalidated: true })
  return { patch: next, notes, tsl: tslString(tsl), filename: tslFilename(next.name || 'patch') }
}
