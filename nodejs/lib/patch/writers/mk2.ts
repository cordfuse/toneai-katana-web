// MkII writer — STUB. Structurally the real writer, but it cannot emit yet.
//
// Why a stub and not a byte writer: docs/kat-format.md § Per-generation
// addressing. MkII addresses parameters by section (f5440k / l.b) + offset
// (f5441l), and those fields ARE populated in the Librarian bytecode — but the
// table has not been extracted, and there is NO ground-truth .kat2/.tsl to
// validate a writer against. Writing guessed offsets would produce a file the
// amp may reject, which the repo's one hard rule forbids.
//
// This file is registered so MkII is a first-class, discoverable generation.
// The confidence guard in writer.ts (mk2 = 'unextracted') means writePatchImage
// throws LayoutNotExtractedError before writeImage is ever reached — so the
// throw below is a belt-and-braces backstop, not the primary gate.
//
// TO PROMOTE THIS TO A REAL WRITER:
//   1. Extract the MkII section+offset table by parsing the `h` descriptors'
//      f5440k/f5441l fields from the bytecode (the same way MkI's z.c(f5439j)
//      map was built). Land it as MK2_OFF below, mirroring mk1.ts's OFF.
//   2. Flip generations.ts mk2.confidence 'unextracted' → 'derived'.
//   3. Get one real .tsl exported from BOSS Tone Studio for a MkII into
//      data/fixtures/, round-trip it (parse → re-emit → byte-identical), then
//      flip 'derived' → 'verified'.
// The enum value→name tables (enums.ts) are shared across generations, so only
// the OFFSETS are unknown — step 1 is the whole job.

import type { TonePatch } from '../intent'
import { type PatchWriter, type PatchImage, registerWriter, LayoutNotExtractedError } from '../writer'

// MkII single-patch image size (.kat2) is not confirmed — MkI is 2797. Left at
// 0 deliberately: it must come from g.s()/MK2 in the bytecode, not a guess.
const MK2_IMAGE_SIZE = 0

// const MK2_OFF = { … }  ← the extracted section+offset table goes here, same
// shape as mk1.ts OFF. Empty until step 1 above is done.

class Mk2Writer implements PatchWriter {
  readonly generation = 'mk2' as const
  readonly imageSize = MK2_IMAGE_SIZE

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  writeImage(_patch: TonePatch): PatchImage {
    throw new LayoutNotExtractedError('mk2')
  }
}

registerWriter(new Mk2Writer())

export {}
