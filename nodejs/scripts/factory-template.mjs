#!/usr/bin/env node
/**
 * factory-template.mjs
 *
 * Neutralize a device's donor template into a FACTORY-DEFAULT template.
 *
 * The writers clone `template.json` and overlay tone intent. When that template
 * is a donor patch, every parameter the writer doesn't set inherits a stranger's
 * tone. This rewrites the template so those inherited values are the amp's own
 * factory defaults instead — the compressor, EQ, noise gate, reverb tail, and
 * contour a fresh patch ships with.
 *
 * Mechanism (deliberately minimal and safe): keep the donor's exact byte
 * structure — section keys, lengths, multi-byte layouts, everything already
 * verified by the round-trip tests — and overwrite ONLY single-byte (INTEGER1x7)
 * parameters with their factory value (`init + ofs`, clamped to a 7-bit byte).
 * Multi-byte params (name, delay/reverb time) are left as-is; the writer sets
 * the audible ones from intent, and the rest are inert when their effect is off.
 *
 * A model section `PATCH_FOO` maps to every template key `FOO` / `FOO(n)`.
 *
 * Usage: node scripts/factory-template.mjs <model.json> <donor-template.json> <out-template.json>
 */

import { readFileSync, writeFileSync } from 'node:fs'

const [, , modelPath, donorPath, outPath] = process.argv
if (!modelPath || !donorPath || !outPath) {
  console.error('usage: factory-template.mjs <model.json> <donor-template.json> <out.json>')
  process.exit(2)
}

const model = JSON.parse(readFileSync(modelPath, 'utf8'))
const donor = JSON.parse(readFileSync(donorPath, 'utf8'))

// The template stores sections either at the top level or under `.sections`.
const hasWrapper = donor.sections && typeof donor.sections === 'object'
const S = hasWrapper ? donor.sections : donor
const templateKeys = Object.keys(S).filter((k) => Array.isArray(S[k]))

const clamp7 = (n) => (n < 0 ? 0 : n > 127 ? 127 : n)

// Section names differ by device family — screaming-snake `PATCH_REVERB`,
// snake `prm_patch_comp_limiter`, or the flat `prm_prop_patch`. Normalize both
// sides deterministically: drop the known prefix, the `(n)` instance suffix, and
// every separator, then compare case-insensitively. `PATCH_FX_DETAIL`,
// `prm_patch_fx_detail`, and `FxDetail` all collapse to `fxdetail`. This is exact
// matching on a canonical form, not fuzzy — a miss maps nothing rather than guess.
const flatten = (s) =>
  s
    .replace(/\(\d+\)$/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
const canon = (s) => {
  const stripped = flatten(s.replace(/^(PATCH_?|prm_patch_|prm_prop_|prm_)/i, ''))
  // If the prefix WAS the whole word (e.g. the flat section literally named
  // "Patch"), stripping leaves nothing — fall back to the full name.
  return stripped || flatten(s)
}

function matchKeys(sectionName) {
  const want = canon(sectionName)
  return templateKeys.filter((k) => canon(k) === want)
}

// ONLY these sections are neutralized. They carry inherited TONE — the compressor,
// EQ, reverb/delay tail, noise gate, contour, and effect sub-parameters a writer
// never sets, which is where a donor's tone bleeds through. Everything else —
// signal-chain routing (OTHER/CHAIN), effect on/off (SW, the writer's job), pedal
// and knob ASSIGNMENTS, colour, solo routing — is STRUCTURAL and must stay exactly
// as the verified real export had it. Overwriting chain routing reorders the signal
// path; overwriting assignments rebinds the pedals. Neither is "tone".
const TONE_SECTIONS = new Set([
  'amp', 'booster', 'bacomp', 'comp', 'complimiter', 'drive', 'blend',
  'fxdetail', 'delay', 'reverb', 'eq', 'eqeach', 'eqpeq', 'eqge10',
  'ns', 'contour',
  // KATANA Bass names its tone tails differently — `prm_patch_delay_detail`,
  // `reverb_detail`, `ns_detail`, and a two-band `low_mid`/`high_mid` EQ instead
  // of the guitar amps' `EQ_EACH`/`EQ_PEQ`/`EQ_GE10`. Same tone categories, so
  // they belong on the same allowlist. (Bass has no per-patch AMP section in its
  // model — its preamp voicing IS the drive + these EQ bands.)
  'delaydetail', 'reverbdetail', 'nsdetail', 'lowmid', 'highmid',
])

// This tool ONLY handles section-keyed devices (go, gen3, bass), where a param's
// address IS its byte offset inside its `.tsl` section. The flat AIR family
// (KATANA:AIR, WAZA-AIR, WAZA-AIR BASS) stores the whole patch as one packed
// 2335-byte blob, and its model addresses are the device's SPARSE memory
// addresses — they run to ~4600 with gaps the `.tsl` packs out, so `addr` is NOT
// the blob offset. Writing factory bytes at `addr` there would land them on the
// wrong parameters and corrupt the patch. A flat model is refused, not guessed.
// If the AIR family ever needs factory neutralization, it needs the verified
// address→offset packing map (a handful of anchors live in writers/air.ts), not
// this script.
function assertSectionKeyed(model) {
  // Signature of a flat model: one dominant section whose addresses overrun any
  // plausible section length. Bail before writing a single byte.
  const sizes = Object.values(model.sections).map((p) => p.length)
  const biggest = Math.max(...sizes)
  const flatSection = Object.entries(model.sections).find(([, p]) => p.length === biggest)
  const maxAddr = Math.max(...flatSection[1].map((p) => p.addr))
  if (biggest > 200 && maxAddr > 2000) {
    throw new Error(
      `${flatSection[0]} looks like a FLAT patch image (${biggest} params, addr up to ${maxAddr}). ` +
        `This script only handles section-keyed devices — the flat AIR family needs the ` +
        `address→offset packing map, not raw device addresses. Refusing to write a corrupt template.`,
    )
  }
}

assertSectionKeyed(model)

let changed = 0
const mapped = []
const skippedStructural = []
const unmapped = []

for (const [sectionName, params] of Object.entries(model.sections)) {
  if (!TONE_SECTIONS.has(canon(sectionName))) {
    skippedStructural.push(sectionName)
    continue
  }
  const keys = matchKeys(sectionName)
  if (keys.length === 0) {
    unmapped.push(sectionName)
    continue
  }
  mapped.push(`${sectionName}->${keys.join(',')}`)
  for (const key of keys) {
    const bytes = S[key]
    for (const p of params) {
      if (p.size !== 'INTEGER1x7') continue // single-byte only
      if (p.addr >= bytes.length) continue // guard: addr outside this instance
      const factory = clamp7(p.init + p.ofs)
      if (bytes[p.addr] !== factory) changed++
      bytes[p.addr] = factory
    }
  }
}

writeFileSync(outPath, JSON.stringify(donor, null, 1) + '\n', 'utf8')
console.log(
  `${outPath.split('/').pop()}: ${changed} bytes set to factory across ${mapped.length} tone sections ` +
    `(${skippedStructural.length} structural/control sections left untouched)`,
)
if (unmapped.length) console.log(`  tone sections with no template key: ${unmapped.join(', ')}`)
