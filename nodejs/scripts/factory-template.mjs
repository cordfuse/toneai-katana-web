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
])

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
