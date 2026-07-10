// Golden init template for the MkII (V2) writer.
//
// The earlier writer built sections from zeros against a hand-transcribed table.
// A ground-truth liveset (data/fixtures) showed that produced a structurally
// wrong file — missing the "UserPatch%" key prefix, carrying V1-only sections,
// with Eq(2) misplaced — that BOSS Tone Studio would reject. The robust fix is
// to clone a REAL patch's section map (exact keys, order, lengths, and factory
// default bytes) and overlay only the fields the tone controls.
//
// template.json holds that real section map (keys WITHOUT the "UserPatch%"
// prefix; tsl.ts adds it on emit). See mk2/template.json _meta for provenance.

import type { SectionMap } from '../tsl'
import templateData from './template.json'

interface TemplateFile {
  order: string[]
  sections: Record<string, number[]>
}

const TEMPLATE = templateData as unknown as TemplateFile

/** The section keys in their canonical emit order (bare, no "UserPatch%"). */
export const TEMPLATE_ORDER: readonly string[] = TEMPLATE.order

/** A fresh clone of the golden template as a SectionMap, in canonical order.
 *  Every generated patch starts here, so unset params inherit real factory
 *  defaults instead of zeros and the structure matches a genuine export. */
export function templateSections(): SectionMap {
  const m: SectionMap = new Map()
  for (const key of TEMPLATE.order) {
    m.set(key, Uint8Array.from(TEMPLATE.sections[key]))
  }
  return m
}
