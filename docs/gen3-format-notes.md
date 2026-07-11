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

## CONFIRMED from a real BTX export (2026-07-11)

Ground-truth patch from BOSS Tone Exchange staged at gitignored
`data/fixtures/gen3-tri-stereo-chorus.tsl` (third-party community patch, NOT
redistributed, same policy as the MkII fixture). It pins the envelope:

- **`.tsl` device string: `"KATANA Gen3"`** (exact spelling; the writer's mk3
  `deviceString`). The `KATANA-50` / `KATANA-100` names in `model_info.js` are
  UI model labels, not the liveset device field.
- **`"formatRev": "0000"`** (MkII is `"0002"`).
- Envelope shape identical to MkII: `{name, formatRev, device,
  data:[[{memo:"", paramSet:{...}}]]}`; `paramSet` maps `PATCH%<BLOCK>` to an
  array of hex-byte strings.
- **80 blocks, 2649 bytes total.** Block families + byte lengths (per instance):
  COM 16, OTHER 3, COLOR 5, PATCH_KNOB_READONLY 5, AMP 10, SW 6,
  BOOSTER(1..3) 8, FX(1..6) 1, FX_DETAIL(1..6) 225, DELAY(1..6) 17,
  REVERB(1..3) 13, SOLO_COM 2 / SOLO_EQ 10 / SOLO_DELAY 14,
  CONTOUR_COM 1 / CONTOUR(1..3) 2, PEDALFX_COM 3 / PEDALFX 15,
  EQ_EACH(1..2) 3, EQ_PEQ(1..2) 11, EQ_GE10(1..2) 11, NS 3, SENDRETURN 5,
  and the ASSIGN / GAFC banks (ASSIGN_KNOBS 34, ASSIGN_EXPPDL_* , and
  ASSIGN_GAFCEXPPDL1..3 _FUNC/_DETAIL 34/_MIN 49/_MAX 49 each ×2).
- This real patch IS the golden template for `mk3` (round-trip target), the way
  the real MkII liveset was for `mk2`.

## Enum name lists (from config/resource.js, index order)

Text lists are in selector order; **byte value = index — VERIFIED** against a
second ground-truth pack (`data/fixtures/gen3-studio-rats-pack.tsl`, 8 patches):
patch "TSR Clean"→CLEAN(1), "TSR Pushed"→PUSHED(2), "TSR Crunch"→CRUNCH(3),
"TSR EVH"→BROWN(5, the Van Halen brown sound); effect side "Pushed Trem"→TREMOLO,
"LOW Oct"→OCTAVE. The resource-text ordering holds across amp/FX/delay/reverb.

- **Amp type** (`PATCH%AMP` byte 7, 0–5): ACOUSTIC, CLEAN, PUSHED, CRUNCH, LEAD, BROWN
- **MOD/FX type** (31): T.WAH, AUTO WAH, PEDAL WAH, COMP, LIMITER, GRAPHIC EQ,
  PARAMETRIC EQ, GUITAR SIM, SLOW GEAR, WAVE SYNTH, OCTAVE, PITCH SHIFTER,
  HARMONIST, AC.PROCESSOR, PHASER, FLANGER, TREMOLO, ROTARY, UNI-V, SLICER,
  VIBRATO, RING MOD, HUMANIZER, CHORUS, AC.GUITAR SIM, PHASER 90E, FLANGER 117E,
  WAH 95E, DC-30, HEAVY OCTAVE, PEDAL BEND
- **Delay type** (8): DIGITAL, PAN, STEREO, ANALOG, TAPE ECHO, REVERSE, MODULATE, SDE-3000
- **Reverb type** (5): PLATE, ROOM, HALL, SPRING, MODULATE
- **Booster type** (SMALL, MEDIUM, BRIGHT, POWER ... plus the pedal-fx families)
- **Chain block order**: BOOSTER, MOD, FX, DELAY, DELAY2, REVERB, SOLO, CONTOUR,
  PEDAL FX, EQ, EQ2, NS, SEND/RETURN, ASSIGN

## Status (2026-07-11)

VERIFIED: param model (`mk3/param-table.json`), golden template, and a full
byte-for-byte round-trip of a real export (`mk3/template.ts` + test). The
serialization/envelope path is proven.

NEXT (writer overlay): `mk3/sections.ts` offset slots for the controlled params
(from param-table), `writers/mk3.ts` (mirror mk2), map the tone intent onto
Gen 3's blocks (amp -> PATCH%AMP, booster -> BOOSTER(1), fx1/fx2 -> FX(n)+
FX_DETAIL(n), delay -> DELAY(1), reverb -> REVERB(1)), wire `generations.ts` +
`index.ts`, and a device-aware AI schema so the model picks Gen-3 amp/effect
names. **Do not flip `katana-mk3` to supported until the enum index->name
orderings are confirmed against ground truth** (the resource-text order is a
strong default, not proven; verify with the app's selector logic or a couple more
sample patches with known amp/effect). Until then it stays a gated "derived"
layout — same posture MkII held before its enums were verified.

## Chain routing + writer offsets (verified from the pack)

- `PATCH%SW` (6 bytes) = chain on/off: `[0]BOOSTER [1]MOD [2]FX [3]DELAY [4]DELAY2 [5]REVERB`.
- `PATCH%FX(1)` = MOD-position type, `PATCH%FX(2)` = FX-position type (1 byte each);
  `FX(3..6)` are extra slot capacity, inactive in normal 2-effect patches.
  ("Pushed Trem" → MOD_SW=1, FX(1)=TREMOLO confirms FX(1)=MOD.)
- Writer offset slots (all verified):
  - AMP: gain@0, volume(level)@1, bass@2, mid@3, treble@4, presence@5, type@7
  - BOOSTER(1): type@0, drive@1, tone@3, effect_level@6
  - DELAY(1): type@0, time@1 (2-byte ms), feedback@5, effect_level@7
  - REVERB(1): type@0, time@2, effect_level@10

## Remaining implementation (writer + AI integration)

The format is fully cracked and verified. Two coding chunks remain:
1. **Writer** — `mk3/sections.ts` (the slots above + Gen 3 enums) and
   `writers/mk3.ts` overlaying the tone intent onto the golden template (amp,
   booster, fx1->MOD, fx2->FX, delay, reverb; set the SW flags). Wire
   `generations.ts` + `index.ts`. Testable byte-for-byte against the fixtures.
2. **Device-aware AI intent** — the model currently emits MkII amp/effect NAMES
   (`enums.ts`), but Gen 3's sets differ (BROWN, PUSHED, SDE-3000, etc.). For
   Gen 3 to actually generate valid tones, the intent schema/prompt must be
   device-aware so the model picks Gen-3 names. This is the design boundary: the
   `AmpName`/`FxName` unions are MkII-specific today; Gen 3 needs its own
   vocabulary (and this same per-device vocab feeds the future convert feature).

`katana-mk3` stays `supported: false` until both land and round-trip verifies.

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
