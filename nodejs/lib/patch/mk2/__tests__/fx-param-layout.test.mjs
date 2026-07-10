// Guard: FX_PARAM_LAYOUT offsets must match the amp's real parameter addresses.
//
// The offsets in sections.ts are the within-Fx byte addresses of each modelled
// mod-effect knob (e.g. FX1_PHASER_RATE). They were once wrong for every effect
// except Comp — silently writing rate/depth/level into a neighbouring effect's
// bytes — because they were eyeballed from a mis-indexed table. This test pins
// them to the authoritative map in fx-param-offsets.json (extracted from the
// KATANA Librarian descriptor tables) so they cannot drift again.
//
// It parses the layout out of sections.ts as text rather than importing the TS
// module, so it runs under plain `node --test` with no TS loader.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const truth = JSON.parse(readFileSync(join(here, '..', 'fx-param-offsets.json'), 'utf8'))
const src = readFileSync(join(here, '..', 'sections.ts'), 'utf8')

/** Pull the ordered offset list for one effect out of the FX_PARAM_LAYOUT source. */
function layoutOffsets(effect) {
  const block = src.match(new RegExp(`${effect}:\\s*\\[([\\s\\S]*?)\\]`))
  assert.ok(block, `FX_PARAM_LAYOUT missing effect: ${effect}`)
  return [...block[1].matchAll(/knob:\s*'(\w+)',\s*offset:\s*(\d+)/g)].map((m) => ({
    knob: m[1],
    offset: Number(m[2]),
  }))
}

// Single-band effects: each knob maps 1:1 to a named authoritative offset.
for (const effect of ['Comp', 'Phaser', 'Flanger', 'Tremolo', 'Vibrato']) {
  test(`${effect} sub-param offsets match the amp`, () => {
    for (const { knob, offset } of layoutOffsets(effect)) {
      assert.equal(offset, truth[effect][knob], `${effect}.${knob}`)
    }
  })
}

// Chorus drives the 2x2 engine's LOW then HIGH bands from the same knob names,
// so the six entries are [low rate,depth,level, high rate,depth,level].
test('Chorus (2x2) dual-band offsets match the amp', () => {
  const got = layoutOffsets('Chorus').map((e) => e.offset)
  const t = truth.Chorus
  assert.deepEqual(got, [t.low_rate, t.low_depth, t.low_level, t.high_rate, t.high_depth, t.high_level])
})
