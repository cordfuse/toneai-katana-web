// Gain calibration — compress the model's gain intent to the KATANA's actual
// response, in code, before the writer sees it.
//
// WHY: the model dials gain as if the KATANA's 0-100 were the real amp's knob.
// It is not. The KATANA's amp sims saturate far earlier than the amps they
// model — a real Plexi at 55% gain is crunchy; the MS1959 sim at 55 is already
// molten, and the Lead/Brown/R-Fire voices at 70+ are fizz and noise the gate
// cannot contain. A MkII owner reported exactly that (2026-07-16): "nothing
// works ... distorted, massive gain, volume ... in general I find if you use a
// booster, turn gain down and put the amp on clean or crunch to have any chance
// of a usable tone."
//
// Same lesson as the noise gate: told about it in a prompt, the model nudges;
// enforced here, it is a guarantee. The model's gain is treated as INTENT ON THE
// REAL AMP'S DIAL and mapped onto the sim's usable range.
//
// ── PROVISIONAL CONSTANTS ────────────────────────────────────────────────────
// The knees and slopes below are set from community consensus ("a bit past
// halfway plus an OD stack" is the working high-gain recipe; fizz beyond ~65)
// and are awaiting anchoring against real-hardware listening notes on the
// author's MkII (the CAL_LEAD_G40/55/70 + CAL_BROWN_G55 sweep). Tune the numbers
// there; do not re-derive them from forum lore, which is where these came from.

import type { TonePatch, AmpChannel } from './intent'

/** How hard a voice drives for a given gain value — decides which curve applies. */
export type GainFamily = 'clean' | 'crunch' | 'high-gain'

/** Uppercase, strip non-alphanumerics — same trick as descriptions.ts, so all
 *  per-generation spellings of one voice land on one entry. */
function normalize(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9+]/g, '')
}

// Voices whose sims saturate hard — the complaint territory. Includes the
// panel voices every generation shares and the full-amp-set heavy hitters.
const HIGH_GAIN = new Set([
  'LEAD', 'BROWN', 'HIGAINSTACK', 'POWERDRIVE', 'EXTREMELEAD', 'COREMETAL',
  'MS1959I', 'MS1959I+II', 'RFIREVINTAGE', 'RFIREMODERN', 'TAMPLEAD',
  'BGLEAD', 'BGDRIVE', 'VOLEAD', 'BOGNERUBER', 'ORANGEROCKER', 'DRIVE',
].map(normalize))

const CRUNCH = new Set([
  'CRUNCH', 'COMBOCRUNCH', 'STACKCRUNCH', 'PROCRUNCH', 'DELUXECRUNCH',
  'VODRIVE', 'MATCHDRIVE', 'PUSHED',
].map(normalize))

export function gainFamilyForAmp(ampType: string): GainFamily {
  // "Lead (Variation)" calibrates like Lead — the variation is hotter, not tamer.
  const key = normalize(ampType).replace(/VARIATION$/, '')
  if (HIGH_GAIN.has(key)) return 'high-gain'
  if (CRUNCH.has(key)) return 'crunch'
  return 'clean'
}

/** Soft-knee compression: identity up to the knee, `slope` beyond it, hard cap. */
function compress(gain: number, knee: number, slope: number, cap: number): number {
  const g = gain <= knee ? gain : knee + (gain - knee) * slope
  return Math.min(cap, Math.round(g))
}

function calibrateChannel(ch: AmpChannel): AmpChannel {
  const family = gainFamilyForAmp(ch.type)
  if (family === 'clean') return ch

  const gain =
    family === 'high-gain'
      ? compress(ch.gain, 45, 0.55, 70) // 55→51, 70→59, 100→70
      : compress(ch.gain, 55, 0.6, 75) //  crunch: 70→64, 100→75

  // The volume half of the complaint: dirt compresses, so equal channel level is
  // LOUDER on a gained patch. Cap it where a clean patch of level 60 sits.
  const level = Math.min(ch.level, 60)

  return { ...ch, gain, level }
}

/**
 * Map the model's gain intent onto the KATANA sim's usable range. Applied to
 * every patch before the gate is derived and before any bytes are written —
 * the gate must scale with the gain the amp will actually run, not the intent.
 */
export function calibrateGainForDevice(patch: TonePatch): TonePatch {
  const out: TonePatch = { ...patch, ampA: calibrateChannel(patch.ampA) }
  if (patch.ampB) out.ampB = calibrateChannel(patch.ampB)
  return out
}
