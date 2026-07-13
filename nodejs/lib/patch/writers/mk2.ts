// MkII writer — section-based, emits a .tsl liveset.
//
// Unlike MkI (a flat 2797-byte image), MkII is SECTION-ADDRESSED: each param
// lives at an offset inside a named section, and those sections are the .tsl
// `paramSet` keys.
//
// The writer clones a GOLDEN TEMPLATE (mk2/template.ts — a real MkII V2 patch's
// full section map: exact keys, order, lengths, and factory-default bytes) and
// overlays only the fields the tone intent controls. So every generated patch is
// structurally identical to a genuine export; unset params keep real defaults
// rather than zeros.
//
// CONFIDENCE: field offsets (amp, OD, FX type + sub-params, delay incl. 2-byte
// TIME, reverb) and amp/effect index numbering are all round-trip verified
// against data/fixtures/tsr-katana-mk2-v2-pack.tsl. Remaining approximation:
// reverb TIME uses a linear seconds->byte map (single ground-truth patch per
// type; unit not pinned), and per-effect model sub-selectors (e.g. comp model)
// inherit the template default.

import { defaultNoiseSuppressor, type TonePatch, type ModFx } from '../intent'
import { AMP_BY_NAME, OD_DS_BY_NAME, FX_BY_NAME, DELAY_BY_NAME, REVERB_BY_NAME } from '../enums'
import { MK2_OFFSETS, FX_PARAM_LAYOUT } from '../mk2/sections'
import { templateSections } from '../mk2/template'
import { type SectionMap, toTsl } from '../tsl'
import { writePatchName as writeName16 } from '../writer'

const MK2_META = { formatRev: '0002', device: 'KATANA MkII', name: '' }

type Slot = { section: string; offset: number }

/** MkII stores knobs at their raw 0–100 UI value — verified against ground truth
 *  (knob bytes top out around 100, not 127). No 0–127 scaling, unlike the MkI
 *  flat image. */
const knob = (v: number): number => (v < 0 ? 0 : v > 100 ? 100 : Math.round(v))

function enumByte(map: Map<string, number>, name: string, kind: string): number {
  const v = map.get(name)
  if (v === undefined) throw new Error(`unknown ${kind}: "${name}"`)
  return v
}

/** Place a single 7-bit byte at a section offset, guarding the bounds. */
function put(sections: SectionMap, slot: Slot, value: number): void {
  const arr = sections.get(slot.section)
  if (!arr) throw new Error(`MkII section not found: ${slot.section}`)
  if (slot.offset < 0 || slot.offset >= arr.length) {
    throw new RangeError(`MkII offset ${slot.offset} out of range in ${slot.section} (${arr.length}B)`)
  }
  arr[slot.offset] = value < 0 ? 0 : value > 127 ? 127 : Math.round(value)
}

/** Write one FX slot onto the template: on flag, and — when on — type plus every
 *  modelled sub-param for that type. A param the model set is used as-is; one it
 *  left unset gets the effect's musical default. When off, only the on flag is
 *  cleared (the template's block bytes stay, but inactive). */
function writeFx(sections: SectionMap, section: string, onSlot: Slot, typeSlot: Slot, fx: ModFx | undefined): void {
  if (!fx?.on) { put(sections, onSlot, 0); return }
  put(sections, onSlot, 1)
  put(sections, typeSlot, enumByte(FX_BY_NAME, fx.type, 'FX type'))
  const layout = FX_PARAM_LAYOUT[fx.type]
  if (!layout) return
  for (const { knob: field, offset, def } of layout) {
    const v = fx[field]
    put(sections, { section, offset }, knob(typeof v === 'number' ? v : def))
  }
}

/** Reverb TIME (single byte, offset 2). The exact seconds->byte unit isn't
 *  pinned from one patch per type, so map linearly (10 s -> 100) and clamp. */
function reverbTimeByte(timeS: number): number {
  return Math.max(1, Math.min(100, Math.round(timeS * 10)))
}

/** Build the MkII section map from tone intent, overlaid on the golden template.
 *  On-bytes are ALWAYS written (0 or 1) because the template ships with blocks
 *  enabled — a slot the intent leaves off must be cleared, not inherited. */
export function buildMk2Sections(patch: TonePatch): SectionMap {
  const s = templateSections()
  const O = MK2_OFFSETS

  // Patch name — 16 ASCII, space-padded. Reuse the flat-image name writer.
  writeName16(s.get(O.patchName.section)!, patch.name)

  // Preamp A (this MkII build is single-amp; no channel B).
  put(s, O.ampOn, 1)
  put(s, O.ampType, enumByte(AMP_BY_NAME, patch.ampA.type, 'amp type'))
  put(s, O.ampGain, knob(patch.ampA.gain))
  put(s, O.ampBass, knob(patch.ampA.bass))
  put(s, O.ampMid, knob(patch.ampA.middle))
  put(s, O.ampTreb, knob(patch.ampA.treble))
  put(s, O.ampPres, knob(patch.ampA.presence))
  put(s, O.ampLevel, knob(patch.ampA.level))

  // OD / booster.
  put(s, O.odOn, patch.booster.on ? 1 : 0)
  if (patch.booster.on) {
    put(s, O.odType, enumByte(OD_DS_BY_NAME, patch.booster.type, 'OD/DS type'))
    put(s, O.odDrive, knob(patch.booster.drive))
    put(s, O.odTone, knob(patch.booster.tone))
    put(s, O.odLevel, knob(patch.booster.level))
  }

  // Mod/FX — on/off always set; type + modelled sub-params when on. Effect types
  // outside FX_PARAM_LAYOUT write type-only, which is correct.
  writeFx(s, 'Fx(1)', O.fx1On, O.fx1Type, patch.fx1)
  writeFx(s, 'Fx(2)', O.fx2On, O.fx2Type, patch.fx2)

  // Delay — TIME is a 2-byte big-endian 7-bit value (ms = hi*128 + lo).
  put(s, O.delayOn, patch.delay.on ? 1 : 0)
  if (patch.delay.on) {
    put(s, O.delayType, enumByte(DELAY_BY_NAME, patch.delay.type, 'delay type'))
    const ms = Math.max(1, Math.min(2000, Math.round(patch.delay.timeMs)))
    put(s, O.delayTimeHi, Math.floor(ms / 128))
    put(s, O.delayTimeLo, ms % 128)
    put(s, O.delayFback, knob(patch.delay.feedback))
    put(s, O.delayLevel, knob(patch.delay.level))
  }

  // Reverb — TIME single byte (approximate seconds->byte map).
  put(s, O.revOn, patch.reverb.on ? 1 : 0)
  if (patch.reverb.on) {
    put(s, O.revType, enumByte(REVERB_BY_NAME, patch.reverb.type, 'reverb type'))
    put(s, O.revTime, reverbTimeByte(patch.reverb.timeS))
    put(s, O.revLevel, knob(patch.reverb.level))
  }

  // ── Playability. Every byte below was previously INHERITED from the donor. ────
  //
  // The donor is a clean patch, so these arrived on a gain-85 metal tone as: gate
  // OFF, a stranger's contour EQ ON, and solo/level bytes nobody chose. The patch
  // loaded fine and was unplayable. Set them all, on every patch, every time.

  // The gate. The model chooses it (it knows a djent chug from a jazz clean); if it
  // didn't, derive one from the gain rather than leaving it to chance.
  const ns = patch.noiseSuppressor ?? defaultNoiseSuppressor(patch)
  put(s, O.nsOn, ns.on ? 1 : 0)
  put(s, O.nsThreshold, knob(ns.threshold))
  put(s, O.nsRelease, knob(ns.release))

  // Output level. Unity unless the model says otherwise, so tones sit at a
  // consistent volume against each other.
  put(s, O.patchLevel, knob(patch.patchLevel ?? 100))

  // All three solo boosts OFF. A patch that arrives with a hidden boost engaged is
  // simply louder than the tone it claims to be. Loudness is the amp level's job.
  put(s, O.odSoloSw, 0)
  put(s, O.odSoloLevel, 50)
  put(s, O.ampSoloSw, 0)
  put(s, O.ampSoloLevel, 50)
  put(s, O.prmSoloSw, 0)
  put(s, O.prmSoloLevel, 50)

  // Contour and bright OFF. Both stack extra EQ on top of the amp's own tone
  // stack. With them on, the bass/mid/treble/presence the model dialled aren't
  // what the player hears — which makes every EQ decision a lie.
  put(s, O.contourSw, 0)
  put(s, O.contourSelect, 0)
  put(s, O.ampBright, 0)

  // Gain range: MID (1), written explicitly. Same value the donor carried, so this
  // changes nothing today — but it is now a decision instead of an inheritance.
  // Unverified: if a real amp reports the gain range is wrong, suspect this first.
  put(s, O.ampGainSw, 1)

  return s
}

/** Build the MkII .tsl liveset object for one patch. */
export function writeMk2Tsl(patch: TonePatch): object {
  return toTsl(buildMk2Sections(patch), { ...MK2_META, name: patch.name })
}
