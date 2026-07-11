// Golden template for the Gen 3 writer.
//
// Same approach as mk2/template.ts: clone a REAL patch's full block map (exact
// keys, order, lengths, factory-default bytes) and overlay only the fields the
// tone controls, so unset params inherit real defaults and the structure matches
// a genuine BOSS Tone Studio / Tone Exchange export.
//
// template.json holds that block map with bare keys (no "PATCH%" prefix; tsl.ts
// adds it on emit). See template.json _meta for provenance. Gen 3 uses PATCH%
// block keys and device string "KATANA Gen3", formatRev "0000".

import type { SectionMap } from '../tsl'
import templateData from './template.json'

interface TemplateFile {
  order: string[]
  sections: Record<string, number[]>
}

const TEMPLATE = templateData as unknown as TemplateFile

/** The block keys in canonical emit order (bare, no "PATCH%"). */
export const TEMPLATE_ORDER: readonly string[] = TEMPLATE.order

/** A fresh clone of the golden template as a SectionMap, in canonical order. */
export function templateSections(): SectionMap {
  const m: SectionMap = new Map()
  for (const key of TEMPLATE.order) {
    m.set(key, Uint8Array.from(TEMPLATE.sections[key]))
  }
  return m
}
