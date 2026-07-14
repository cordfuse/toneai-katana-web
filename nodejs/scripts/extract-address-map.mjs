#!/usr/bin/env node
/**
 * extract-address-map.mjs
 *
 * Turn a Roland BOSS Tone Studio WebView `config/address_map.js` (+ its
 * `config/resource.js` enum lists) into a normalized JSON parameter model:
 * every parameter's section, address, size, display offset, and — the reason
 * this exists — its factory `init`, `min`, and `max`.
 *
 * WHY: the writers used to clone a donor patch and inherit ~150 params from a
 * stranger's tone (a rock preset's compressor riding under a clean surf patch).
 * The amp's OWN factory defaults are right here in its editor's source. With
 * these, a writer can synthesize the factory patch and set only what tone intent
 * controls — no donor, no inheritance, no surprise.
 *
 * The RE source (data/re/**) is gitignored and NOT redistributed; this script
 * reads it at dev time and emits the normalized table into the repo. The table
 * is derived facts (offsets + factory defaults), not the third-party source.
 *
 * Usage: node scripts/extract-address-map.mjs <address_map.js> <resource.js> <out.json>
 */

import { readFileSync, writeFileSync } from 'node:fs'

const [, , addrPath, resPath, outPath] = process.argv
if (!addrPath || !resPath || !outPath) {
  console.error('usage: extract-address-map.mjs <address_map.js> <resource.js> <out.json>')
  process.exit(2)
}

const addrSrc = readFileSync(addrPath, 'utf8')
const resSrc = readFileSync(resPath, 'utf8')

// ── Parameter rows ────────────────────────────────────────────────────────────
//
// Each row in the source looks like (whitespace varies):
//   { addr:0x0000000C, size:INTEGER1x7, ofs:0, init:3, min:0, max:7, name:'PRMID_PATCH_AMP_TYPE' },
// grouped inside `var SECTION_NAME = [ ... ];` blocks. We keep the section
// grouping because the .tsl format is section-addressed.

const SECTION_RE = /var\s+([A-Za-z_0-9]+)\s*=\s*\[([\s\S]*?)\];/g
const ROW_RE =
  /\{\s*addr:\s*(0x[0-9a-fA-F]+)\s*,\s*size:\s*([^,]+?)\s*,\s*ofs:\s*(-?\d+)\s*,\s*init:\s*(-?\d+)\s*,\s*min:\s*(-?\d+)\s*,\s*max:\s*(-?\d+)\s*,\s*name:\s*'([^']*)'\s*\}/g

const sections = {}
let sm
let paramCount = 0
while ((sm = SECTION_RE.exec(addrSrc))) {
  const [, sectionName, body] = sm
  const rows = []
  let rm
  ROW_RE.lastIndex = 0
  while ((rm = ROW_RE.exec(body))) {
    const [, addr, size, ofs, init, min, max, name] = rm
    rows.push({
      addr: parseInt(addr, 16),
      size: size.trim(),
      ofs: Number(ofs),
      init: Number(init),
      min: Number(min),
      max: Number(max),
      name,
    })
    paramCount++
  }
  if (rows.length) sections[sectionName] = rows
}

// ── Enum lists ────────────────────────────────────────────────────────────────
//
// resource.js holds `{ text: "NAME1, NAME2, ..." }` rows where the array index
// of each name IS its byte value. Lists are SPARSE — an empty slot ("A, , B")
// is a real reserved byte and MUST keep its position. We index them by position
// in the file so callers can pick the list a given device/param uses; the byte
// meaning is positional, so we return arrays (empty string = reserved slot).

const enumLists = []
const TEXT_RE = /\{\s*text:\s*(['"])([\s\S]*?)\1\s*\}/g
let em
while ((em = TEXT_RE.exec(resSrc))) {
  const items = em[2].split(',').map((s) => s.trim())
  // Heuristic: keep lists that look like enum option sets (mostly non-empty,
  // >1 entry). Skip help paragraphs (single long sentence, no commas).
  if (items.length > 1) enumLists.push(items)
}

const out = {
  _meta: {
    what: 'Normalized KATANA parameter model — factory init/min/max per param + enum byte lists',
    source: `${addrPath.split('/data/re/')[1] ?? addrPath} + resource.js`,
    extracted_by: 'scripts/extract-address-map.mjs',
    note:
      'Derived facts (offsets + factory defaults) from the device editor. init = factory default; ' +
      'enum list index = byte value; enum lists are sparse (empty string = reserved byte).',
    section_count: Object.keys(sections).length,
    param_count: paramCount,
    enum_list_count: enumLists.length,
  },
  sections,
  enumLists,
}

writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n', 'utf8')
console.log(
  `${outPath.split('/').pop()}: ${Object.keys(sections).length} sections, ${paramCount} params, ${enumLists.length} enum lists`,
)
