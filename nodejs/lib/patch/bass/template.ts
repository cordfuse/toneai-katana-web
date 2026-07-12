// Golden template for the KATANA BASS writer.
//
// KATANA BASS uses a 34-block section map (keyPrefix "UserPatch%") — like the
// guitar MkII/Gen3 shape, but with a bass-specific block set (Knob, SelColorSw,
// Drive/Blend/CompLimiter/Fx1/Fx2/LowMid/HighMid each in three "color" variations,
// plus Delay/Reverb/Ns detail). We clone a real patch's full block map and overlay
// only the fields the tone intent controls, so the effect variations, comp, blend
// and EQ scaffolding stay genuine, importable bytes.
//
// template.json holds the block map with bare keys (no "UserPatch%"; tsl.ts adds
// it on emit). Device string "KATANA BASS", formatRev "0000".

import type { SectionMap } from '../tsl'
import templateData from './template.json'

interface TemplateFile {
  order: string[]
  sections: Record<string, number[]>
}

const TEMPLATE = templateData as unknown as TemplateFile

/** The block keys in canonical emit order (bare, no "UserPatch%"). */
export const TEMPLATE_ORDER: readonly string[] = TEMPLATE.order

/** A fresh clone of the golden template as a SectionMap. */
export function templateSections(): SectionMap {
  const m: SectionMap = new Map()
  for (const key of TEMPLATE.order) {
    m.set(key, Uint8Array.from(TEMPLATE.sections[key]))
  }
  return m
}
