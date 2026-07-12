// Katana generations — one logical patch, four byte layouts.
//
// The Librarian app writes the SAME parameter set to four addressings (see
// docs/kat-format.md § Per-generation addressing). This registry records, per
// generation, how the bytes are addressed and — crucially — whether that
// addressing is VALIDATED against a real sample or merely recoverable from
// bytecode. That confidence flag is load-bearing: the writer refuses to emit a
// downloadable patch from an unvalidated layout (writer.ts).

import type { KatanaDevice } from '@/lib/storage'

export type Generation = 'mk1' | 'mk2' | 'mk3' | 'go' | 'gobass' | 'air'

export type Confidence =
  /** Writer validated against real sample files (round-trip byte-identical). */
  | 'verified'
  /** Section+offset recovered from bytecode, never round-tripped. Guessable but
   *  unproven — must be gated behind a warning and never the default. */
  | 'derived'
  /** Addressing fields exist in the bytecode but the offset TABLE has not been
   *  extracted yet. Cannot write at all. */
  | 'unextracted'

export interface GenerationProfile {
  id: Generation
  label: string
  /** The `device` string written into the .tsl liveset. */
  deviceString: string
  /** Librarian binary extension for a single patch. */
  fileExt: '.kat' | '.kat2' | '.kat3' | '.katgo' | '.katair'
  /** Device selector index from the app (MK1=1, MK2=2, MK3=3, GO=4). Air is a
   *  separate app (BOSS Tone Studio for KATANA:AIR), not the guitar Librarian —
   *  index 5 marks it as out-of-band rather than a Librarian slot. */
  selectorIndex: 1 | 2 | 3 | 4 | 5
  confidence: Confidence
  /** Human note on how offsets are addressed, for the writer + docs. */
  addressing: string
}

// Only MkI is verified — 20 factory .kat samples, round-trippable. Everything
// else is honest about its state. MkII/MkIII carry populated section+offset
// fields in the bytecode but no extracted table and no sample; GO likewise.
export const GENERATIONS: Record<Generation, GenerationProfile> = {
  mk1: {
    id: 'mk1',
    label: 'KATANA MkI',
    deviceString: 'KATANA',
    fileExt: '.kat',
    selectorIndex: 1,
    confidence: 'verified',
    addressing: 'raw addr f5439j → file offset z.c(f5439j); flat 2797-byte image',
  },
  mk2: {
    id: 'mk2',
    label: 'KATANA MkII',
    deviceString: 'KATANA MkII',
    fileExt: '.kat2',
    selectorIndex: 2,
    // SECTION-addressed (PATCH_0/PATCH_1/DELAY_1/FX_1/FX_2/…), not a flat image.
    // The writer (writers/mk2.ts) builds from a golden template — a real MkII V2
    // liveset (data/fixtures/tsr-katana-mk2-v2-pack.tsl) — and overlays the tone.
    // 'verified': round-tripped against that ground-truth export — section keys/
    // order/lengths are byte-identical, amp/effect indices decode correctly
    // (Crunch=11, Clean-Var=29), knobs store raw 0–100, and the 2-byte delay TIME
    // encoding reproduces exactly (391 ms → [3,7]). Residual approximation: reverb
    // TIME uses a linear seconds→byte map (one sample per reverb type).
    confidence: 'verified',
    addressing: 'golden-template overlay (mk2/template.ts) + within-section offsets (mk2/sections.ts); .tsl formatRev 0002, verified vs data/fixtures/',
  },
  mk3: {
    id: 'mk3',
    label: 'KATANA Gen 3',
    deviceString: 'KATANA Gen3', // confirmed from a real BOSS Tone Exchange export
    fileExt: '.kat3',
    selectorIndex: 3,
    // 'verified': param model, golden template, and enum orderings all confirmed
    // against real exports; the mk3 template round-trips a genuine patch
    // byte-for-byte and the writer overlay is byte-checked (docs/gen3-format-notes.md).
    confidence: 'verified',
    addressing: 'golden-template overlay (mk3/template.ts) + PATCH% block offsets (mk3/param-table.json); .tsl formatRev 0000, verified vs data/fixtures/ Gen 3 exports',
  },
  go: {
    id: 'go',
    label: 'KATANA:GO',
    deviceString: 'KATANA:GO_guitarmode', // guitar mode; bass mode is a separate device string
    fileExt: '.katgo',
    selectorIndex: 4,
    // 'verified': param model extracted from the GO editor app, enum orderings
    // cross-checked against the app's own Gen 3 → GO conversion map, and the
    // golden template round-trips a real guitar-mode export byte-for-byte
    // (go/__tests__, docs/go-format-notes.md). GO is a Gen 3-style PATCH% section
    // map; the amp IS stored in-patch (unlike Air). GO is dual-mode — the same
    // app + block layout serves guitar and bass, split only by the .tsl device
    // string (_guitarmode / _bassmode) and patch-slot range. Guitar mode ships
    // first; bass mode is built on the same GO app (no bass profile yet).
    confidence: 'verified',
    addressing: 'golden-template overlay (go/template.ts) + PATCH% block offsets (go/param-table.json); .tsl formatRev 0000, verified vs data/fixtures/ GO guitar export',
  },
  gobass: {
    id: 'gobass',
    label: 'KATANA:GO Bass',
    deviceString: 'KATANA:GO_bassmode',
    fileExt: '.katgo',
    selectorIndex: 4,
    // 'verified': GO bass uses the SAME 30-block PATCH% layout as GO guitar, and
    // now has its OWN golden template cloned from a real bass-mode export
    // (go/template-bass.json — "MONO SLOW PAD") that round-trips byte-for-byte,
    // plus bass enums cross-checked against the app. Confirmed: bass amp voices
    // decode at bytes 5–7, bass chain routing is genuine. Same app as guitar.
    confidence: 'verified',
    addressing: 'golden-template overlay (go/template-bass.json, real bass export) + PATCH% block offsets; .tsl formatRev 0000, _bassmode device string, verified vs data/fixtures/ GO bass export',
  },
  air: {
    id: 'air',
    label: 'KATANA:AIR',
    deviceString: 'KATANA-AIR', // hyphenated, confirmed from a real ToneCentral export
    fileExt: '.katair',
    selectorIndex: 5,
    // 'verified': the 2335-byte flat image param model (air/param-table.json,
    // 478 params) is extracted from the Air editor app and the golden template
    // round-trips a real bank byte-for-byte (air/__tests__). Effect offsets are
    // verified; the writer emits the effects chain ONLY — an Air patch stores no
    // amp (global panel state), so amp is surfaced as instructions. Residual
    // unknowns needing hardware: delay-TIME encoding on-device and single-patch
    // vs full 8-slot bank import (docs/air-format-notes.md § Open questions).
    confidence: 'verified',
    addressing: 'golden-template overlay (air/template.ts) + flat User%Patch offsets (air/param-table.json); .tsl formatRev 0000, effects-only, verified vs data/fixtures/ Air bank',
  },
}

/**
 * Map a UI device id (lib/storage KatanaDevice) to its generation.
 *
 * Derived from the id suffix so a new cabinet variant (e.g. another `-mk2`)
 * needs no change here. The bass GO is treated as `go` for addressing, though
 * KATANA Bass is a separate amp family and must be blocked at generate time —
 * that guard lives with the gear/amp-enum logic, not here.
 */
export function generationForDevice(device: KatanaDevice): Generation {
  if (device.endsWith('-mk1')) return 'mk1'
  if (device.endsWith('-mk2')) return 'mk2'
  if (device.endsWith('-mk3')) return 'mk3'
  if (device.startsWith('katana-air')) return 'air'
  if (device === 'katana-go-bass') return 'gobass'  // before the katana-go prefix
  if (device.startsWith('katana-go')) return 'go'
  // Defensive default: unknown suffix → mk1, the only verified layout. Better
  // to target the safe writer than to guess an unvalidated one.
  return 'mk1'
}

export function profileForDevice(device: KatanaDevice): GenerationProfile {
  return GENERATIONS[generationForDevice(device)]
}
