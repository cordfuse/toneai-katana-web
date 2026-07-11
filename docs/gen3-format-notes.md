# KATANA Gen 3 format notes (work in progress)

Initial structural map of the Gen 3 `.tsl` / patch format, sourced from the
official BOSS KATANA Gen 3 app (staged locally under gitignored
`data/fixtures/katana-gen3.apk`, extracted assets in `data/re/gen3-assets/`).
Same working method as the MkII notes in `kat-format.md`.

## What the app is

A WebView / JavaScript app (Roland `quattro` framework, same family as the bass
editor). The whole parameter model lives in readable JS + JSON under
`assets/html/js/businesslogic/`, not obfuscated Java. Far more tractable than the
MkII bytecode extraction.

## Confirmed structural facts

- **SysEx base is shared with the rest of the KATANA line:** `ADDRESS.TEMPORARY
  = 0x60000000` (`address_const.js`).
- **Gen 3 is its OWN liveset format, not a MkII clone.** Block IDs are `PATCH%…`
  (for example `PATCH%COM`, `PATCH%AMP`), where MkII uses `UserPatch%…`. A
  separate `writers/mk3.ts` + template is required; do not fork mk2.
- **Richer feature set than MkII.** Blocks seen in the golden template:
  - `PATCH%AMP`
  - `PATCH%FX_DETAIL(1..4)` — FOUR FX slots (MkII has two)
  - `PATCH%EQ_PEQ(1..2)` and `PATCH%EQ_GE10(1..2)` — parametric AND 10-band graphic EQ
  - `PATCH%REVERB(1)`, `PATCH%DELAY(1)`, `PATCH%DELAY(4)`, `PATCH%SOLO_DELAY`
  - `PATCH%SOLO_EQ`, `PATCH%PEDALFX`
  - `PATCH%ASSIGN_*` — GAFC expression-pedal assigns (MIN/MAX/DETAIL per pedal)
  - `SYSTEM%GLOBAL_PEQ`, `SYSTEM%GLOBAL_GE10`, `SYSTEM%MIDI_CC`, `SYSTEM%MIDI_PC`
- **Golden template present:** `assets/html/export/item.json` (407 KB) holds the
  full default patch across every block — the mk3 equivalent of the MkII golden
  template.
- **Device / model strings** (`ktn/model_info.js`): `KATANA-50`, `KATANA-100`,
  `KATANA-100/212`, plus Head and Artist variants (`ModelConfigKtn*Gen3`). The
  exact string written into the `.tsl` `device` field still needs pinning down
  (find where the liveset export sets it).

## Still to extract (the build)

1. Per-block byte offsets, sizes, and multi-byte encodings (from the JS model +
   `item.json`) → `lib/patch/mk3/param-table.json`.
2. The `.tsl` `device` field value(s) for Gen 3.
3. The amp-type and effect-type enum vocabularies (Gen 3 specific; `ktn3` amp
   images suggest its own amp set).
4. `lib/patch/mk3/template.ts` golden template from `item.json`, and
   `writers/mk3.ts` mirroring the mk2 writer.
5. Gen 3 tone-intent schema (amp/effect names the model may pick).
6. Round-trip against a real Gen 3 `.tsl` export to reach "verified", then flip
   `katana-mk3` to `supported: true`. Until then it stays a gated "derived"
   layout, same as the current "Soon" state.
