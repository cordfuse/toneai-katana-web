# KATANA:GO (guitar mode) — `.tsl` format notes

Status: **verified (guitar mode).** The param model is extracted from the GO
editor app, the enum orderings are cross-checked against the app's own Gen 3 → GO
conversion map, and the golden template round-trips a real guitar-mode export
byte-for-byte (`lib/patch/go/__tests__`). The writer emits at confidence
`verified`.

Reference sample (gitignored, not redistributed):
`data/fixtures/katana-go-rock-tones.tsl` — a "KATANA:GO Rock Tones" pack.

## Dual-mode device — guitar vs bass

GO is a **single app with two modes** (`ProductSetting.defaultMode` 0 = guitar,
1 = bass). Both modes share ONE `.tsl` block layout; they are distinguished by
the **device string suffix**:

- guitar → `device: "KATANA:GO_guitarmode"`
- bass → `device: "KATANA:GO_bassmode"` (separate branch — not built here)

The librarian holds 30 guitar patches (slots 1–30) and 30 bass patches (36–65).
Both modes are built from **this one GO app** (there is no separate GO bass app).
Guitar mode ships first; bass mode is added on the same branch.

The device-string function in the app (`businesslogic/mode/mode_info.js`) makes
this explicit: `APP_MODE == MODE.GTR ? 'guitarmode' : 'bassmode'` — one binary,
two `.tsl` device strings.

## Envelope (confirmed)

```
{
  "name": "KATANA:GO Rock Tones",
  "formatRev": "0000",
  "device": "KATANA:GO_guitarmode",
  "data": [ [ p0..p4 ], [ p5..p9 ] ]     // sample pack: 2 groups of 5
}
```

- **key prefix:** `PATCH%`; a patch is a **30-block section map** (COM, OTHER,
  AMP, SW, BOOSTER, BA_COMP, FX(1), FX(2), FX_DETAIL(1..2), DELAY(1..2), REVERB,
  SOLO_*, CONTOUR_*, PEDALFX_*, EQ_EACH/PEQ/GE10, NS, SENDRETURN). This is the
  same section-map shape as MkII/Gen 3, **not** the flat image Air/MkI use.
- **memo:** empty string `""` (simpler than Air's JSON-string memo).
- Values are hex-string bytes, same encoding as the other generations.

Structurally GO guitar is a **Gen 3 sibling**: PATCH% keys, the same SW-block
chain (`[booster, mod, fx, delay, delay2, reverb, comp]` where MOD = FX(1) and
FX = FX(2)), and the same 4-nibble delay TIME. Unlike Air, **the amp IS stored
in the patch** (`PATCH%AMP`), so no hand-dial instructions are needed.

## Verified offsets (writer-relevant blocks)

Extracted from the app `config/address_map.js` (nibble-addressed → byte offset)
into `lib/patch/go/param-table.json`, block lengths confirmed against the fixture.

| Block | Field | Offset | Notes |
|---|---|---|---|
| COM | NAME | 4 | 16 ASCII (NOT offset 0 — GROUP@0, CHANNEL@2 precede it) |
| AMP | GAIN 0, VOLUME 1, BASS 3, MIDDLE 4, TREBLE 5, PRESENCE 10, **TYPE 12** | | wider than Gen 3; LOW/HIGH-MID + freqs + SHAPE left at template default |
| SW | booster 0, mod 1, fx 2, delay 3, delay2 4, reverb 5, comp 6 | | per-effect chain switches |
| BOOSTER | TYPE 0, DRIVE 1, TONE 3, EFFECT_LEVEL 6 | | TONE centered (−50..50, stored 0..100) |
| FX(1) / FX(2) | TYPE 0 | | one type byte; sub-params in FX_DETAIL (left default) |
| DELAY(1) | TYPE 0, TIME 1–4, FEEDBACK 5, EFFECT_LEVEL 7 | | TIME = 4 nibble-bytes, big-endian, 1..2000 ms |
| REVERB | TYPE 0, TIME 2, EFFECT_LEVEL 10 | | TIME single byte, **−1 display offset** |

## Enum orderings — verified

`config/resource.js` provides the display lists; the app's Gen 3 → GO librarian
conversion map (`businesslogic/librarian/ktn_gen3_model.js` `ampType` /
`boosterType` / `fxType`) provides the byte values. Inverting that map — its
comments are the known Gen 3 names, its values GO indices — reproduces the
`resource.js` ordering exactly, so the byte assignments are **proven**.

- **Amps (5):** ACOUSTIC, CLEAN, CRUNCH, LEAD, BROWN (same 5-voice model as Air).
- **Boosters (23, guitar):** CLEAN BOOST … CENTA OD. The byte field runs to 35,
  but 23+ are bass drives / duplicates, excluded from the guitar vocabulary.
- **FX (28):** CHORUS(0) … DC-30(27).
- **Delays (8):** DIGITAL, PAN, STEREO, ANALOG, TAPE ECHO, REVERSE, MODULATE, SDE-3000.
- **Reverbs (5):** PLATE, ROOM, HALL, SPRING, MODULATE (GO puts PLATE first —
  distinct from Gen 3/Air).

## Approximations (flagged)

- **FX detail params.** The writer sets the FX slot TYPE + switch but leaves the
  245-byte FX_DETAIL block at the template's values (the template patch's SLICER
  detail). An effect set to a different type still imports and is on, but its
  fine parameters aren't tuned to that type — same limitation as Gen 3.
- **Reverb TIME** uses a linear `seconds*10` map (one degree of freedom), with
  the −1 display offset applied. As on the other generations, reverb decay is the
  least-verified continuous parameter.

## Open questions (need hardware)

- **Single patch vs multi-patch liveset.** The sample is 2 groups of 5; the
  writer emits a single-patch liveset (`data:[[patch]]`). Whether GO's BTS import
  accepts a 1-patch guitarmode liveset is untested — low risk (the section map
  and device string are exact), but confirm on a device.
