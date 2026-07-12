// KATANA Air writer — emits a .tsl liveset (device "KATANA-AIR", formatRev
// "0000", single flat "User%Patch" block).
//
// Air is a FLAT image, not a section map: clone the golden template (air/
// template.ts — a real 2335-byte patch) and overlay the effect fields the tone
// controls. Offsets are VERIFIED against the app's parameter model + a real bank
// (docs/air-format-notes.md).
//
// CRITICAL: an Air patch stores ONLY the effects chain. The amp (type/gain/EQ)
// is a global panel-knob state, never per-patch, so this writer does NOT write
// the amp. `airAmpSettings()` maps the intent's amp to Air's 5 panel voices for
// the INSTRUCTIONS the tone card shows alongside the download.
//
// Approximations (flagged, like the mk2 reverb): booster DRIVE/TONE/level and
// reverb time use linear maps from the 0–100 intent knobs; DELAY TIME uses the
// 2-byte 7-bit-pair encoding (hi*128+lo, as verified on MkII) but the Air sample
// never exercised delay, so it's UNVERIFIED on-device.

import type { TonePatch, ModFx } from '../intent'
import {
  AIR_AMP_TYPES, AIR_BOOSTER_BY_NAME, AIR_FX_BY_NAME, AIR_DELAY_BY_NAME, AIR_REVERB_BY_NAME,
} from '../air/enums'
import { templateSections } from '../air/template'
import { type SectionMap, toTsl } from '../tsl'
import { writePatchName as writeName16 } from '../writer'

const AIR_META = { formatRev: '0000', device: 'KATANA-AIR', name: '', keyPrefix: 'User%' }

// The flat "Air" family — KATANA:AIR, WAZA-AIR, WAZA-AIR BASS — all share this
// 2335-byte User%Patch image and the SAME effect offsets (verified: the WAZA apps
// only differ from KATANA:AIR in system/control params and the amp/effect VOICES,
// not the patch layout). So the writer is config-driven: one builder, one offset
// map, per-device template + enum tables + device string.
export interface AirModel {
  meta: { formatRev: string; device: string; keyPrefix: string }
  template: () => SectionMap
  boosters: Map<string, number>
  fx: Map<string, number>
  delays: Map<string, number>
  reverbs: Map<string, number>
}

// Verified byte offsets within the flat Patch image (docs/air-format-notes.md).
const O = {
  name:    0,                                             // 16 ASCII
  booster: { sw: 48, type: 49, drive: 50, tone: 52, level: 55 },
  fx1:     { sw: 192, type: 193 },
  fx2:     { sw: 460, type: 461 },
  delay:   { sw: 736, type: 737, time: 738, feedback: 740, level: 742 }, // time = 2 bytes @738..739
  reverb:  { sw: 784, type: 785, time: 786, level: 792 },
} as const

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : Math.round(v))
const knob = (v: number) => clamp(v, 0, 100)

function put(s: SectionMap, offset: number, value: number): void {
  const arr = s.get('Patch')
  if (!arr) throw new Error('Air Patch block not found')
  if (offset < 0 || offset >= arr.length) throw new RangeError(`Air offset ${offset} out of range (${arr.length}B)`)
  arr[offset] = clamp(value, 0, 127)
}

/** DELAY TIME is 2 bytes, 7 bits each, MSB-first: ms 1..2000 → [ms>>7, ms&0x7f]. */
function putDelayTime(s: SectionMap, ms: number): void {
  const v = clamp(ms, 1, 2000)
  put(s, O.delay.time + 0, (v >> 7) & 0x7f)
  put(s, O.delay.time + 1, v & 0x7f)
}

/** Resolve an effect name to its Air byte, or undefined if Air has no such effect. */
function lookup(map: Map<string, number>, name: string): number | undefined {
  return map.get(name)
}

/** Set one mod slot (FX1/FX2): type + switch. Off (or no equivalent) → SW 0. */
function writeFx(s: SectionMap, slot: { sw: number; type: number }, fx: ModFx | undefined, fxMap: Map<string, number>): void {
  if (!fx?.on) { put(s, slot.sw, 0); return }
  const b = lookup(fxMap, fx.type)
  if (b === undefined) { put(s, slot.sw, 0); return } // no counterpart → leave off
  put(s, slot.sw, 1)
  put(s, slot.type, b)
}

/** Build an Air-family flat Patch image from tone intent, overlaid on the model's
 *  template. Effects only — the amp is not stored (see airAmpSettings). */
export function buildAirImage(patch: TonePatch, model: AirModel): SectionMap {
  const s = model.template()

  // Patch name — 16 ASCII at offset 0.
  writeName16(s.get('Patch')!, patch.name)

  // Booster / OD (ODDS block).
  const bst = lookup(model.boosters, patch.booster.type)
  if (patch.booster.on && bst !== undefined) {
    put(s, O.booster.sw, 1)
    put(s, O.booster.type, bst)
    put(s, O.booster.drive, knob(patch.booster.drive))
    put(s, O.booster.tone, knob(patch.booster.tone))   // 0..100 → Air TONE −50..+50 (stored 0..100)
    put(s, O.booster.level, knob(patch.booster.level))
  } else {
    put(s, O.booster.sw, 0)
  }

  // Mod slots: fx1 → FX1, fx2 → FX2.
  writeFx(s, O.fx1, patch.fx1, model.fx)
  writeFx(s, O.fx2, patch.fx2, model.fx)

  // Delay.
  const dly = lookup(model.delays, patch.delay.type)
  if (patch.delay.on && dly !== undefined) {
    put(s, O.delay.sw, 1)
    put(s, O.delay.type, dly)
    putDelayTime(s, patch.delay.timeMs)
    put(s, O.delay.feedback, knob(patch.delay.feedback))
    put(s, O.delay.level, knob(patch.delay.level))
  } else {
    put(s, O.delay.sw, 0)
  }

  // Reverb.
  const rev = lookup(model.reverbs, patch.reverb.type)
  if (patch.reverb.on && rev !== undefined) {
    put(s, O.reverb.sw, 1)
    put(s, O.reverb.type, rev)
    put(s, O.reverb.time, clamp(patch.reverb.timeS * 10, 0, 99))
    put(s, O.reverb.level, knob(patch.reverb.level))
  } else {
    put(s, O.reverb.sw, 0)
  }

  return s
}

/** KATANA:AIR model — the reference Air device. */
export const KATANA_AIR_MODEL: AirModel = {
  meta: AIR_META,
  template: templateSections,
  boosters: AIR_BOOSTER_BY_NAME,
  fx: AIR_FX_BY_NAME,
  delays: AIR_DELAY_BY_NAME,
  reverbs: AIR_REVERB_BY_NAME,
}

/** Build the KATANA:AIR flat Patch image (effects only). */
export function buildAirSections(patch: TonePatch): SectionMap {
  return buildAirImage(patch, KATANA_AIR_MODEL)
}

/** Build a .tsl liveset object for one patch of any Air-family model. */
export function writeAirFamilyTsl(patch: TonePatch, model: AirModel): object {
  return toTsl(buildAirImage(patch, model), { ...model.meta, name: patch.name })
}

/** Build the KATANA:AIR .tsl liveset object for one patch (effects only). */
export function writeAirTsl(patch: TonePatch): object {
  return writeAirFamilyTsl(patch, KATANA_AIR_MODEL)
}

export interface AirAmpSettings {
  type: string        // one of AIR_AMP_TYPES
  gain: number
  volume: number
  bass: number
  middle: number
  treble: number
  presence: number
}

/** Map the intent's amp to Air's 5 panel voices + knob values, for the
 *  hand-dial INSTRUCTIONS shown on the tone card. Not part of the .tsl. When the
 *  AI targets Air it already picks an Air voice; anything else falls back to CLEAN. */
export function airAmpSettings(patch: TonePatch): AirAmpSettings {
  const t = patch.ampA.type.toUpperCase()
  const type = (AIR_AMP_TYPES as readonly string[]).includes(t) ? t : 'CLEAN'
  return {
    type,
    gain: knob(patch.ampA.gain),
    volume: knob(patch.ampA.level),
    bass: knob(patch.ampA.bass),
    middle: knob(patch.ampA.middle),
    treble: knob(patch.ampA.treble),
    presence: knob(patch.ampA.presence),
  }
}
