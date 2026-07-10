// MkII writer — section-based, emits a .tsl liveset.
//
// Unlike MkI (a flat 2797-byte image), MkII is SECTION-ADDRESSED: each param
// lives at an offset inside a named section (mk2/sections.ts), and those
// sections are the .tsl `paramSet` keys. The writer allocates every section,
// places the intent's values, and hands the section map to toTsl().
//
// CONFIDENCE: derived. The section table, offsets, and .tsl shape are all taken
// from the Katana Librarian app (so the structure matches what it writes), but
// this has NOT been round-tripped against a ground-truth export yet. Two known
// assumptions, both flagged for validation:
//   1. Amp/OD/FX/delay/reverb STORED VALUES reuse the documented KATANA indices
//      (enums.ts). The .tsl amp index (preamp_a_type, 0–27) is the documented
//      cross-generation standard, but MkII renumbering isn't re-proven here.
//   2. Multi-byte params (delay/reverb TIME) are left at default — placing them
//      needs the 2×7 encoding + exact ranges, not yet pinned. On/off, type, and
//      the 0–100 knobs (all single-byte) are placed.

import type { TonePatch } from '../intent'
import { AMP_BY_NAME, OD_DS_BY_NAME, FX_BY_NAME, DELAY_BY_NAME, REVERB_BY_NAME } from '../enums'
import { MK2_SECTIONS, MK2_OFFSETS } from '../mk2/sections'
import { type SectionMap, toTsl } from '../tsl'
import { scaleKnob, writePatchName as writeName16 } from '../writer'

const MK2_META = { formatRev: '0002', device: 'KATANA MkII', name: '' }

type Slot = { section: string; offset: number }

function enumByte(map: Map<string, number>, name: string, kind: string): number {
  const v = map.get(name)
  if (v === undefined) throw new Error(`unknown ${kind}: "${name}"`)
  return v
}

/** Build every MkII section, zero-filled. */
function freshSections(): SectionMap {
  const m: SectionMap = new Map()
  for (const s of MK2_SECTIONS) m.set(s.key, new Uint8Array(s.length))
  return m
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

/** Build the MkII section map from tone intent. */
export function buildMk2Sections(patch: TonePatch): SectionMap {
  const s = freshSections()
  const O = MK2_OFFSETS

  // Patch name — 16 ASCII, space-padded. Reuse the flat-image name writer.
  writeName16(s.get(O.patchName.section)!, patch.name)

  // Preamp A (this MkII build is single-amp; no channel B).
  put(s, O.ampOn, 1)
  put(s, O.ampType, enumByte(AMP_BY_NAME, patch.ampA.type, 'amp type'))
  put(s, O.ampGain, scaleKnob(patch.ampA.gain))
  put(s, O.ampBass, scaleKnob(patch.ampA.bass))
  put(s, O.ampMid, scaleKnob(patch.ampA.middle))
  put(s, O.ampTreb, scaleKnob(patch.ampA.treble))
  put(s, O.ampPres, scaleKnob(patch.ampA.presence))
  put(s, O.ampLevel, scaleKnob(patch.ampA.level))

  // OD / booster.
  put(s, O.odOn, patch.booster.on ? 1 : 0)
  if (patch.booster.on) {
    put(s, O.odType, enumByte(OD_DS_BY_NAME, patch.booster.type, 'OD/DS type'))
    put(s, O.odDrive, scaleKnob(patch.booster.drive))
    put(s, O.odTone, scaleKnob(patch.booster.tone))
    put(s, O.odLevel, scaleKnob(patch.booster.level))
  }

  // Mod/FX — type only for now (sub-param trees per type not yet modelled).
  if (patch.fx1?.on) { put(s, O.fx1On, 1); put(s, O.fx1Type, enumByte(FX_BY_NAME, patch.fx1.type, 'FX type')) }
  if (patch.fx2?.on) { put(s, O.fx2On, 1); put(s, O.fx2Type, enumByte(FX_BY_NAME, patch.fx2.type, 'FX type')) }

  // Delay — TIME is multi-byte (2×7); left at default until pinned.
  put(s, O.delayOn, patch.delay.on ? 1 : 0)
  if (patch.delay.on) {
    put(s, O.delayType, enumByte(DELAY_BY_NAME, patch.delay.type, 'delay type'))
    put(s, O.delayFback, scaleKnob(patch.delay.feedback))
    put(s, O.delayLevel, scaleKnob(patch.delay.level))
  }

  // Reverb — TIME multi-byte; left at default.
  put(s, O.revOn, patch.reverb.on ? 1 : 0)
  if (patch.reverb.on) {
    put(s, O.revType, enumByte(REVERB_BY_NAME, patch.reverb.type, 'reverb type'))
    put(s, O.revLevel, scaleKnob(patch.reverb.level))
  }

  return s
}

/** Build the MkII .tsl liveset object for one patch. */
export function writeMk2Tsl(patch: TonePatch): object {
  return toTsl(buildMk2Sections(patch), { ...MK2_META, name: patch.name })
}
