// Golden template for the KATANA Air writer.
//
// Air is a FLAT single-block format (unlike the mk2/mk3 section maps): a patch is
// one 2335-byte image keyed "User%Patch". We clone a real patch's full image and
// overlay only the effect fields the tone controls, so unset params keep genuine
// factory defaults and the structure matches a real BOSS Tone Studio export.
//
// template.json holds that image with the bare key "Patch" (no "User%" prefix;
// tsl.ts adds it on emit). Provenance in template.json _meta. Air uses device
// string "KATANA-AIR", formatRev "0000", key prefix "User%".
//
// NOTE: an Air patch stores ONLY the effects chain — the amp voicing is a global
// panel-knob state, not per-patch (docs/air-format-notes.md). The writer emits
// effects and surfaces the amp as instructions.

import type { SectionMap } from '../tsl'
import templateData from './template.json'

interface TemplateFile {
  order: string[]
  sections: Record<string, number[]>
}

const TEMPLATE = templateData as unknown as TemplateFile

/** The block keys in canonical emit order (bare, no "User%"). Air has one. */
export const TEMPLATE_ORDER: readonly string[] = TEMPLATE.order

/** A fresh clone of the golden template as a SectionMap. */
export function templateSections(): SectionMap {
  const m: SectionMap = new Map()
  for (const key of TEMPLATE.order) {
    m.set(key, Uint8Array.from(TEMPLATE.sections[key]))
  }
  return m
}
