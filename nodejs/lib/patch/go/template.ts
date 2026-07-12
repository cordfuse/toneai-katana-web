// Golden template for the KATANA:GO (guitar mode) writer.
//
// Like mk2/mk3, GO uses a multi-block SECTION MAP (keyPrefix "PATCH%", 30
// blocks). We clone a real guitar-mode patch's full block map and overlay only
// the fields the tone intent controls, so untouched blocks (BA_COMP, SOLO,
// CONTOUR, PEDAL FX, EQ, NS, SEND/RETURN, FX_DETAIL, …) keep genuine factory
// values and the export matches a real BOSS Tone Studio file.
//
// template.json holds the block map with bare keys (no "PATCH%" prefix; tsl.ts
// adds it on emit). Provenance in template.json _meta. Device string
// "KATANA:GO_guitarmode", formatRev "0000", key prefix "PATCH%".

import type { SectionMap } from '../tsl'
import templateData from './template.json'
import bassTemplateData from './template-bass.json'

interface TemplateFile {
  order: string[]
  sections: Record<string, number[]>
}

const TEMPLATE = templateData as unknown as TemplateFile
const BASS_TEMPLATE = bassTemplateData as unknown as TemplateFile

/** The guitar block keys in canonical emit order (bare, no "PATCH%"). */
export const TEMPLATE_ORDER: readonly string[] = TEMPLATE.order

function clone(t: TemplateFile): SectionMap {
  const m: SectionMap = new Map()
  for (const key of t.order) m.set(key, Uint8Array.from(t.sections[key]))
  return m
}

/** A fresh clone of the guitar golden template (real "SLICE CLEAN" patch). */
export function templateSections(): SectionMap {
  return clone(TEMPLATE)
}

/** A fresh clone of the bass golden template (real "MONO SLOW PAD" patch). */
export function bassTemplateSections(): SectionMap {
  return clone(BASS_TEMPLATE)
}
