// Golden template for the KATANA MkI (original 2019 KATANA) writer.
//
// MkI is a DIFFERENT ANIMAL from every other generation here. Its liveset is NOT
// the hex byte-section `.tsl` the modern amps use — it's the older "GT" liveset
// (device "GT", version "1.0.0") whose patches store parameters as a flat map of
// ~1500 NAMED decimal params (`preamp_a_gain: 70`), not `UserPatch%` byte arrays.
// See docs/mk1-format-notes.md.
//
// So there's no SectionMap / toTsl path here. We clone a real MkI patch's full
// params object as the golden template and overlay only the intent fields; the
// long tail (comp, EQ, per-FX sub-trees, expression assigns) stays genuine —
// exactly the same philosophy as the other writers, different container.
//
// template.json is cloned from a real export (data/fixtures/, gitignored):
// "Blues Collection 1", patch 0. Identity fields (id/name/…) are blanked and
// filled per emit.

import templateData from './template.json'

/** One MkI patch: named-parameter map plus its liveset scaffolding. */
export interface Mk1Patch {
  patchNo: number | null
  orderNumber: number
  id: string
  liveSetId: string
  logPatchName: string
  patchID: number | null
  tcPatch: boolean
  note: string | null
  category: string
  name: string
  params: Record<string, number>
}

interface Mk1Template {
  device: string          // 'GT'
  version: string         // '1.0.0'
  liveSetData: { url: string; name: string; image: string; path: string; id: string; orderNumber: number }
  patch: Mk1Patch
}

const TEMPLATE = templateData as unknown as Mk1Template

/** The GT envelope constants (device + version). */
export const MK1_DEVICE = TEMPLATE.device
export const MK1_VERSION = TEMPLATE.version

/** A fresh deep clone of the golden patch (params + scaffolding). */
export function templatePatch(): Mk1Patch {
  return structuredClone(TEMPLATE.patch)
}

/** A fresh clone of the liveSetData scaffold. */
export function templateLiveSetData() {
  return structuredClone(TEMPLATE.liveSetData)
}
