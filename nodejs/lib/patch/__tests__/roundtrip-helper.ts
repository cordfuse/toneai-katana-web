// Shared golden-template round-trip assertion.
//
// The section-keyed templates (go, gen3, bass) are no longer verbatim clones of
// their donor export: their TONE tail — amp, compressor, EQ, delay/reverb tail,
// noise gate, contour, effect detail — is neutralized to the amp's own factory
// defaults (scripts/factory-template.mjs, from each device's address_map). So a
// template can no longer be asserted byte-identical to the donor patch.
//
// What still MUST hold, and is what these tests now prove:
//   1. Envelope + serialization — same block keys, same order, same prefix. This
//      is the writer/tsl.ts contract the round-trip test existed to guard.
//   2. Layout — every block is the same length as the donor's. Factory-izing may
//      not resize a block.
//   3. No structural corruption — every STRUCTURAL block (signal-chain routing,
//      switch enables, pedal/knob ASSIGN bindings, colour) is still byte-for-byte
//      the donor's. Neutralization is only ever allowed to touch tone bytes.
//
// The tone blocks are expected to diverge from the donor (that is the whole
// point), so their bytes are not compared here — the factory values themselves
// are guarded by factory-template.mjs's idempotent regeneration against the
// checked-in model.

import assert from 'node:assert/strict'

/** Strip the `PREFIX%` and the `(n)` instance suffix from a block key → base name. */
function baseName(key: string): string {
  const afterPrefix = key.includes('%') ? key.slice(key.indexOf('%') + 1) : key
  return afterPrefix.replace(/\(\d+\)$/, '')
}

/**
 * Assert an emitted paramSet reproduces the donor's structure, with tone blocks
 * allowed to carry factory defaults instead of the donor's tone.
 *
 * @param emitted     paramSet from the writer/template
 * @param golden      paramSet from the real donor export
 * @param toneBlocks  base names (no prefix, no `(n)`) of the TONE blocks
 */
export function assertStructurePreserved(
  emitted: Record<string, string[]>,
  golden: Record<string, string[]>,
  toneBlocks: Set<string>,
): void {
  assert.deepEqual(Object.keys(emitted), Object.keys(golden), 'same block keys, same order')
  for (const k of Object.keys(golden)) {
    assert.equal(emitted[k].length, golden[k].length, `block ${k} same length`)
    if (!toneBlocks.has(baseName(k))) {
      // Structural block — must be byte-identical; neutralization must not reach it.
      assert.deepEqual(emitted[k], golden[k], `structural block ${k} bytes unchanged from donor`)
    }
  }
}

/** Tone-block base names shared by the guitar section-keyed devices (GO, Gen 3). */
export const GUITAR_TONE_BLOCKS = new Set([
  'AMP', 'BOOSTER', 'BA_COMP', 'FX_DETAIL', 'DELAY', 'REVERB',
  'CONTOUR', 'EQ_EACH', 'EQ_PEQ', 'EQ_GE10', 'NS',
])

/** Tone-block base names for KATANA Bass (its own naming). */
export const BASS_TONE_BLOCKS = new Set([
  'CompLimiter', 'Drive', 'Blend', 'FxDetail',
  'LowMid', 'HighMid', 'DelayDetail', 'ReverbDetail', 'NsDetail',
])
