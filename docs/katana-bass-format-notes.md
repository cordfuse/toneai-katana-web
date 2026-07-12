# KATANA BASS (desktop head/combo line) — `.tsl` format notes

Status: **verified.** The param model is extracted from the KATANA BASS editor
app and the golden template round-trips a real export byte-for-byte
(`lib/patch/bass/__tests__`). The writer emits at confidence `verified`.

This is the **desktop bass line** — KATANA BASS 110 / 210 / Head. It is a
distinct product from the KATANA:GO in bass mode: different app, different
architecture, different `.tsl` block set. All three cabinets share one
`device` string, `"KATANA BASS"` (wattage/speaker are hardware, not patch data).

Reference sample (gitignored, not redistributed):
`data/fixtures/katana-bass-alex-hutchings.tsl` — a 6-patch pack ("Classic Bass",
"Chorus Bass", "Billys Bass", "Delay Riff", "Oct Defretter", "BASS synth Main").
The golden template is cloned from patch 0, "Classic Bass".

## What makes this device different

Unlike every guitar KATANA, the bass rig does **not** map one-to-one onto the
guitar tone shape. Three structural differences drive the writer's mapping:

1. **No amp block.** The "amp" is the front-panel **Knob** block. `KNOB TYPE` is
   the preamp voice (VINTAGE / OFF / MODERN), plus GAIN, VOLUME and a **4-band
   EQ** (BASS / LOW-MID / HIGH-MID / TREBLE) — wider than the guitar 3-band.
2. **Colour variations.** Each effect block is stored in **three "colour"
   variations** — `Drive(1..3)`, `Fx1(1..3)`, `Fx2(1..3)`, `Blend`, `CompLimiter`,
   `LowMid`, `HighMid`. The active variation is selected by COLOUR bytes in the
   `SelColorSw` block (0 = green / variation 1). The writer overlays **variation
   1** and points `SelColorSw` at it.
3. **Combined Fx2 slot.** `Fx2` is ONE slot that runs **mod-2 OR delay OR reverb
   — only one at a time**, selected by `Fx2` byte 0 (`0 = fx, 1 = delay,
   2 = reverb`). The writer fills it by priority **delay > reverb > fx2**, so the
   most defining time effect wins. (Confirmed via fixture patch 3 "Delay Riff",
   which sets the Fx2 slot select to delay.)

## Envelope (confirmed)

```
{
  "name": "...",
  "formatRev": "0000",
  "device": "KATANA BASS",
  "data": [ [ p0..p5 ] ]
}
```

- **key prefix:** `UserPatch%` (like MkII/MkI, **not** the GO/Gen 3 `PATCH%`).
- a patch is a **34-block section map**:
  `PatchName, Knob, SelColorSw, PedalFunction, CompLimiter(1..3), Drive(1..3),
  Blend(1..3), Fx1(1..3), Fx2(1..3), LowMid(1..3), HighMid(1..3), Chain,
  PedalFxDetail, FxDetail(1..2), DelayDetail, ReverbDetail, NsDetail, SendReturn,
  Master`.
- **memo:** empty string `""`.
- Values are hex-string bytes, same encoding as the other generations.

## Verified offsets (writer-relevant blocks)

Extracted from the app `config/address_map.js` (nibble-addressed → byte offset),
block lengths confirmed against the fixture (`lib/patch/writers/bass.ts`).

| Block | Field | Offset | Notes |
|---|---|---|---|
| PatchName | NAME | 0 | 16 ASCII, space-padded |
| Knob | TYPE 2, GAIN 3, VOLUME 4, BASS 6, LOW-MID 7, HIGH-MID 8, TREBLE 9 | | the amp; TYPE = preamp voice |
| SelColorSw | DRIVE SW 2 / COL 3, FX1 SW 12 / COL 13, FX2 SW 14 / COL 15 | | per-block enable + active colour |
| Drive(1) | TYPE 0, DRIVE 1, TONE 3, LEVEL 4 | | booster → drive stage, variation 1 |
| Fx1(1) | TYPE 0 | | mod slot 1, variation 1 |
| Fx2(1) | SEL 0, FX TYPE 1, DELAY TYPE 2, REVERB TYPE 3 | | combined slot (SEL picks which) |
| DelayDetail | TIME 0 (2-byte 7-bit), FEEDBACK 2, LEVEL 4 | | `hi*128 + lo` ms |
| ReverbDetail | TIME 0 (−1 offset), LEVEL 6 | | linear seconds→byte approximation |

Delay TIME uses the MkII-style **2-byte 7-bit pair** (`hi = ms >> 7`,
`lo = ms & 0x7f`) — NOT the GO/Gen 3 4-nibble encoding.

## Enum orderings (extracted)

From `config/resource.js`:

- **Preamp voice** (`Knob` TYPE, `_[96]`): VINTAGE = 0, OFF = 1, MODERN = 2. The
  tone vocab exposes the two voiced options (VINTAGE / MODERN).
- **Drive** (`_[7]`, 0–12): BLUES OD, NATURAL, GUV DS, METAL ZONE, MUFF FUZZ,
  BOOSTER, BASS OD, BASS DS, BASS MT, BASS FUZZ, HIBAND DRV, BASS DRV, BASS DI.
- **Mod / FX** (`_[8]`, 0–23): CHORUS, FLANGER, PHASER, UNI-V, TREMOLO, VIBRATO,
  ROTARY, RING MOD, SLOW GEAR, T. WAH, GRAPHIC EQ, PARAMETRIC EQ, OCTAVE, PITCH
  SHIFTER, HARMONIST, HUMANIZER, ENHANCER, BASS SIMULATOR, DEFRETTER, BASS SYNTH,
  AUTO WAH, (reserved 21), HEAVY OCTAVE, SLICER.
- **Delay** (`_[9]`, 0–5): DIGITAL, ANALOG, TAPE ECHO, REVERSE, MODULATE,
  SDE-3000.
- **Reverb** (`_[10]`, 0–4): PLATE, ROOM, HALL, SPRING, MODULATE.

## Amp mapping (guitar intent → bass Knob panel)

The device-agnostic tone intent carries a guitar-shaped 3-band EQ + presence. It
maps to the bass 4-band as:

| intent | → Knob field |
|---|---|
| `ampA.gain` | GAIN |
| `ampA.level` | VOLUME |
| `ampA.bass` | BASS |
| `ampA.middle` | LOW-MID |
| `ampA.presence` | HIGH-MID |
| `ampA.treble` | TREBLE |

## Open questions (need hardware)

- **Single-patch vs full-bank import.** As with every device here, whether a
  one-entry `data[0]` imports to a single slot or is rejected in favour of a
  full bank is unconfirmed without an amp to import to.
- **Reverb TIME.** Uses a linear seconds→byte map (one sample per type), same
  approximation as MkII. Fine for musical values; not byte-exact per-type.
- **Colour variations 2/3.** The writer only ever overlays variation 1; the other
  two stay at their genuine template bytes. A future feature could expose the
  colour system, but the tone-intent shape has no slot for it today.
