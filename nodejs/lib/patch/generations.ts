// Katana generations — one logical patch, four byte layouts.
//
// The Librarian app writes the SAME parameter set to four addressings (see
// docs/kat-format.md § Per-generation addressing). This registry records, per
// generation, how the bytes are addressed and — crucially — whether that
// addressing is VALIDATED against a real sample or merely recoverable from
// bytecode. That confidence flag is load-bearing: the writer refuses to emit a
// downloadable patch from an unvalidated layout (writer.ts).

import type { KatanaDevice } from '@/lib/storage'

export type Generation = 'mk1' | 'mk2' | 'mk3' | 'go'

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
  fileExt: '.kat' | '.kat2' | '.kat3' | '.katgo'
  /** Device selector index from the app (MK1=1, MK2=2, MK3=3, GO=4). */
  selectorIndex: 1 | 2 | 3 | 4
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
    // TABLE EXTRACTED 2026-07-10 (mk2/param-table.json) — 1486 params parsed
    // from the Librarian bytecode (h.java method A(), l.b sections + f5441l
    // offsets). MkII is SECTION-addressed (PATCH_0/PATCH_1/DELAY_1/FX_1/FX_2/…),
    // not a flat image. Still 'unextracted' from the WRITER's view because no
    // writer consumes the table yet AND it's never been round-tripped against a
    // ground-truth .tsl. Flip to 'derived' when the writer emits; to 'verified'
    // when a real export round-trips. Remaining to build the writer: section
    // byte sizes + multi-byte encodings, the .tsl JSON wrapper (g.java), and
    // per-gen enum stored values.
    confidence: 'unextracted',
    addressing: 'section f5440k (l.b) + offset f5441l — table extracted, see mk2/param-table.json',
  },
  mk3: {
    id: 'mk3',
    label: 'KATANA Gen 3',
    deviceString: 'KATANA MkII', // observed; Gen-3 device string unconfirmed
    fileExt: '.kat3',
    selectorIndex: 3,
    confidence: 'unextracted',
    addressing: 'section f5442m (m.b) + offset f5444o — TABLE NOT YET EXTRACTED',
  },
  go: {
    id: 'go',
    label: 'KATANA:GO',
    deviceString: 'KATANA:GO',
    fileExt: '.katgo',
    selectorIndex: 4,
    confidence: 'unextracted',
    addressing: 'section f5446q (a.b) + offset f5447r — TABLE NOT YET EXTRACTED',
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
  if (device.startsWith('katana-go')) return 'go'
  // Defensive default: unknown suffix → mk1, the only verified layout. Better
  // to target the safe writer than to guess an unvalidated one.
  return 'mk1'
}

export function profileForDevice(device: KatanaDevice): GenerationProfile {
  return GENERATIONS[generationForDevice(device)]
}
