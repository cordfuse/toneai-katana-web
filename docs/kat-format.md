# The `.kat` format — KATANA MkI binary patch

Reverse-engineered from the BOSS Katana Librarian Android app. **Now decompiled**
(jadx), so this supersedes the earlier diff-only draft — including two offset
corrections and full enum ordinals. Cross-checked against 20 factory `.kat`
samples (`assets/patches/`).

This is the **ground-truth companion** to [tsl-format.md](tsl-format.md).
`.tsl` is the JSON liveset; `.kat` is the binary single-patch image of the same
parameter bytes. Build the patch model against **this** file.

---

## Two corrections to the earlier draft

The pre-decompile draft (diff + string-pool only) got two things wrong. Both are
now proven from bytecode:

1. **`.kat` is the MkI format, not MkII.** `g.java:126` maps `.kat → KATANA_MK1`;
   MkII is `.kat2`, MkIII `.kat3`. All 20 samples are 2797-byte **MkI** images
   (`g.s()` returns 2797 for MK1). We have no MkII/MkIII sample files.
2. **Amp type is at offset 81, not 49.** Offset **49 is `OD_DS_TYPE`** (the
   overdrive/distortion booster). Reading 49 as the amp was reading the pedal
   slot. Channel-B amp is at **129**, not 2305 (2304 is `CHAIN_PTN` routing).

Smoking gun: the "Octa Fuzz" patch has offset 49 = 9 = **Oct Fuzz** (the OD name
literally matches the patch), and every patch's offset-81 amp voicing matches its
musical intent (table below). The prior "ACDC amp = 1" etc. were OD_DS values.

## Record shape

Fixed **2797 bytes** — a flat, unframed temp-patch parameter image:

```
[0..15]   patch name — ASCII, space-padded (0x20) to 16 bytes
[16..]    parameter payload — one or two 7-bit MIDI data bytes per param,
          placed at fixed file offsets. No F0/F7 framing, no address header.
```

Every parameter is read/written by direct byte index. The file is exactly the
data region a Katana "temporary patch" SysEx (DT1 to `0x60000000`) would carry.
`g.w()` reads the file then `Arrays.copyOf(bytes, 2797)` forces the length.

## How offsets are derived (this is now exact, not inferred)

Each parameter is an `h` descriptor (`h.java`) carrying a raw Roland 7-bit-packed
SysEx address in field `f5439j`. The **file byte offset** is `z.c(f5439j)`
(`common/z.java:13`), which de-packs the address into a linear index:

```java
z.c(i) = ((byte)(i>>>24))*2097152 + ((byte)(i>>>16))*16384
       + ((byte)(i>>>8))*128     + (byte)i
```

For raw addresses < 128 this is the identity (amp A raw 81 → offset 81); above
128 it re-bases (amp B raw 0x101 → 1*128+1 = **129**). The maximum `z.c(f5439j)`
over all 1340 MkI params is **2796** = file size − 1 — independent proof the whole
file is this flat image. The full 1340-param map is reproducible by parsing
`h.java` (name from `new h("…")`, offset from `z.c(f5439j)`).

Amp name/effect labels are **not** in the `h` descriptors — they live in the
`k1.*` model enums (§ Enum tables). The APK's `resources.arsc` has no amp
strings; everything is hard-coded in those enums, so this spec is self-contained.

## Offset map (channel A shown; 2797-byte MkI `.kat`)

| off | param | off | param |
|----|-------|----|-------|
| 0–15 | PATCH_NAME (16 ASCII) | 129 | **PREAMP_B_TYPE** |
| 16 | OUTPUT_SELECT | 130–138 | PREAMP_B gain…level (mirror of A) |
| 32 | COMP_ON_OFF | 141/142 | PREAMP_B_SP_TYPE / MIC_TYPE |
| 33 | COMP_TYPE | 176 | EQ_ON_OFF |
| 34–37 | COMP sustain/attack/tone/level | 177–187 | EQ low-cut…level (parametric) |
| 48 | OD_DS_ON_OFF | 192 | FX1_ON_OFF |
| **49** | **OD_DS_TYPE** | **193** | **FX1_FX_TYPE** |
| 50–56 | OD drive/bottom/tone/solo/… | 194+ | FX1 sub-params (per type) |
| 57–62 | OD_DS_CUSTOM_* | 460 | FX2_ON_OFF |
| 80 | PREAMP_A_ON_OFF | **461** | **FX2_FX_TYPE** |
| **81** | **PREAMP_A_TYPE** | 736 | DELAY_ON_OFF |
| 82 | PREAMP_A_GAIN | **737** | **DELAY_TYPE** |
| 83 | PREAMP_A_T_COMP | 738–746 | DELAY time/f-back/hi-cut/level/mix |
| 84 | PREAMP_A_BASS | 784 | REVERB_ON_OFF |
| 85 | PREAMP_A_MIDDLE | **785** | **REVERB_TYPE** |
| 86 | PREAMP_A_TREBLE | 786–794 | REVERB time/predelay/cuts/density/level |
| 87 | PREAMP_A_PRESENCE | 816–819 | FOOT_VOLUME curve/min/max/level |
| 88 | PREAMP_A_LEVEL | 853–857 | SEND_RETURN on/mode/levels |
| 89 | PREAMP_A_BRIGHT | 867–870 | NS1 on/threshold/release/detect |
| 90–92 | gain-sw / solo-sw / solo-lvl | 872–875 | NS2 on/threshold/release/detect |
| 93 | PREAMP_A_SP_TYPE | 913–921 | MASTER_EQ + BPM/key/beat |
| 94–98 | mic type/dist/pos/lvl/mix | 928–947 | FX_CHAIN_POSITION1..20 |
| 99–111 | PREAMP_A_CUSTOM_* (cab @111) | 2180–2191 | EQ_TYPE + Graphic-EQ bands |
| 128 | PREAMP_B_ON_OFF | 2304 | CHAIN_PTN (routing, not amp B) |

Multi-byte params use `v`-enum encoding (`INTEGER_2x7` etc.) and occupy 2 file
bytes. The Katana has **two independent preamp channels** (A @ 81, B @ 129); a
patch model must represent both. B is 0 (Natural Clean / unused) in 18/20 samples
— single-amp patches leave it off.

## Enum tables (value → name, all verified from bytecode)

MkI uses the enum constructor's **2nd argument** as the stored value. These are
the definitive index→name maps — no longer alphabetical guesses.

**PREAMP_A_TYPE / PREAMP_B_TYPE — amp model** (`k1.c.b`, offsets 81 / 129):

| val | name | val | name | val | name |
|----|------|----|------|----|------|
| 0 | Natural Clean | 11 | Crunch | 21 | R-Fire Modern |
| 1 | Acoustic | 12 | Deluxe Crunch | 22 | T-Amp Lead |
| 2 | Combo Crunch | 13 | VO Drive | 23 | Brown |
| 3 | Stack Crunch | 14 | VO Lead | 24 | Lead |
| 4 | Hi-Gain Stack | 15 | Match Drive | 25 | Custom |
| 5 | Power Drive | 16 | BG Lead | 26 | Bogner Uber |
| 6 | Extreme Lead | 17 | BG Drive | 27 | Orange Rocker |
| 7 | Core Metal | 18 | MS1959 I | 28–32 | Acoustic/Clean/Crunch/ |
| 8 | Clean | 19 | MS1959 I+II | | Lead/Brown (Variation) |
| 9 | Clean Twin | 20 | R-Fire Vintage | | |
| 10 | Pro Crunch | | | | |

**OD_DS_TYPE — booster/OD/DS** (`k1.l.b`, offset 49):

```
0 Mid Boost   1 Clean Boost  2 Treble Boost  3 Crunch OD  4 Natural OD
5 Warm OD     6 Fat DS       8 Metal DS      9 Oct Fuzz   10 Blues Drive
11 Overdrive  12 T-Scream    13 Turbo OD     14 Distortion 15 Rat
16 Guv DS     17 DST Plus    18 Metal Zone   19 '60s Fuzz  20 Muff Fuzz
21 HM-2       22 Metal Core  23 Centa OD
```
(The Katana "Booster" *is* this OD/DS slot — there is no separate booster enum on
MkI.)

**FX1/FX2 type** (`k1.a0.b`, offsets 193 / 461):

```
0 T.Wah  1 Auto Wah  2 Pedal Wah  3 Comp  4 Limiter  5 Sub OD/DS  6 Graphic EQ
7 Parametric EQ  8 Tone Modify  9 Guitar Sim  10 Slow Gear  12 Wave Synth
14 Octave  15 Pitch Shifter  16 Harmonist  18 AC Processor  19 Phaser
20 Flanger  21 Tremolo  22 Rotary  23 Uni-V  25 Slicer  26 Vibrato  27 Ring Mod
28 Humanizer  29 Chorus  31 AC Guitar Sim  33 Tera Echo  34 Overtone
35 Phaser 90E  36 Flanger 117E  37 Wah 95E  38 DC-30  39 Heavy Octave  40 Pedal Bend
```

**DELAY_TYPE** (`k1.t.d`, offset 737):
```
0 Digital  1 Pan  2 Stereo  6 Reverse  7 Analog  8 Tape Echo  9 Modulate  10 SDE-3000
```

**REVERB_TYPE** (`k1.q0.c`, offset 785):
```
1 Room  3 Hall  4 Plate  5 Spring  6 Modulate
```

## Cross-check — all 20 samples decode coherently

| patch | amp A (81) | OD (49) | delay (737) | reverb (785) |
|---|---|---|---|---|
| Katana Clean | Clean (8) | Blues Drive | Digital | Plate |
| ACDC | Crunch (11) | Clean Boost | Tape Echo | Plate |
| Metal Rhythm | Brown (23) | T-Scream | Tape Echo | Plate |
| Metal Solo | Brown (23) | T-Scream | Tape Echo | Plate |
| Fusion Lead | Lead (24) | Overdrive | Digital | Plate |
| GMoore Solo | Lead (24) | Guv DS | Digital | Plate |
| GMoore Clean | Clean (8) | T-Scream | Digital | Plate |
| Octa Fuzz | Crunch (11) | **Oct Fuzz** | Modulate | Hall |
| Green Day | Brown (23) | Overdrive | Tape Echo | Room |
| Pink Floyd | Crunch (11) | T-Scream | Digital | Modulate |

Every voicing matches patch intent. Confidence: **very high**.

## Per-generation addressing (MkII / MkIII / GO)

The same `h` descriptors carry per-device address fields, so the app writes one
logical patch to four byte layouts:

- **MkI** → `f5439j` (raw addr) → file offset `z.c(f5439j)`. **This file.**
- **MkII** → section `f5440k` (`l.b`) + offset `f5441l`. File ext `.kat2`.
- **MkIII** → section `f5442m` (`m.b`) + offset `f5444o`. File ext `.kat3`.
- **KATANA:GO** → section `f5446q` (`a.b`) + offset `f5447r`.

Device selector index: `MK1=1, MK2=2, MK3=3, GO=4`. So MkII/MkIII layouts are
**recoverable from the same bytecode** (the section+offset fields are populated),
but we have **no MkII/MkIII sample files** to validate a writer against yet. The
value→name enum tables above are shared across generations (the 2nd/3rd/4th
constructor args give the per-gen stored value).

### MkII table extracted (2026-07-10)

The MkII section+offset table is now **pulled from the bytecode** — 1486 params
parsed from `h.java` method `A()` (`l.b` section in `f5440k`, offset in
`f5441l`). Persisted at `nodejs/lib/patch/mk2/param-table.json`
(APK sha256 recorded in its `_meta`). Confidence is **derived**: recovered from
bytecode, **not yet round-tripped** against a ground-truth `.tsl`.

Key structural finding: **MkII is section-addressed, not a flat image.** Each
param lives at an offset *within* a named section, and those sections are the
`.tsl` keys. Core layout:

| section | holds | example offsets |
|---------|-------|-----------------|
| `PATCH_NAME` | 16-byte patch name | 0–15 |
| `PATCH_0` | OD/booster, preamp A (+mic/cab), EQ | OD_DS 0–14 · PREAMP_A 16–47 · EQ 48–71 |
| `PATCH_1` | reverb, pedal FX | REVERB 0–11 · PEDAL_FX 16+ |
| `PATCH_2` | further per-patch params | — |
| `DELAY_1` / `DELAY_2` | the two delay blocks | DELAY_TYPE @1 |
| `FX_1` / `FX_2` | the two MOD/FX blocks | FX_TYPE @1 |
| `EQ_2`, `STATUS`, `CHAIN_DATA`, `*ASGN` | EQ2, status, chain routing, assigns | — |

Two divergences from MkI worth noting: **reverb is a first-class block** in
`PATCH_1` (MkII names it `REVERB_*`), and there is **no `PREAMP_B`** — this MkII
build is single-amp, so a patch model's channel B is unused for MkII.

Still needed for a byte-accurate writer: per-section byte sizes + multi-byte
(`v`-enum) encodings, the `.tsl` JSON wrapper (`g.java` import/export), the
per-generation enum stored values (`k1.*`), and finally a ground-truth `.tsl`
export to round-trip against.

## `.kat` ↔ SysEx ↔ `.tsl`

- **`.kat`** = the flat parameter image, no framing. Writing to the amp wraps it
  in a DT1 SysEx at `0x60000000 + z.g(offset)` (`h.n`).
- **`.tsl`** = BOSS Tone Studio JSON (`liveSetData`/`patchList`, or
  `data[].paramSet`). Import (`g.v`) matches JSON section keys (`UserPatch%Patch_0`,
  `Fx(1)`, …) and copies hex byte strings into the same byte[] at `section+i`. So
  `.tsl` and `.kat` carry **identical parameter bytes** — JSON-per-section vs.
  flat-binary.

## Remaining gaps

- **Speaker/mic-type label strings** are assembled inline in the UI (`b.java`),
  not fully enumerated; the numeric params/offsets (93/94) are known, the human
  labels less so.
- **Amp Variation storage:** enum values 28–32 encode "(Variation)" voicings, but
  MkI hardware also has a separate `SW_VARIATION` switch; the stored-value vs.
  switch interaction on real hardware isn't fully traced.
- **No MkII/MkIII/GO sample files** — those layouts are derivable from bytecode
  but unvalidated against real exports.

## Design consequence (unchanged)

The model never emits raw bytes. It selects tone intent against a constrained
schema; a deterministic writer places values at these fixed offsets and produces
a valid patch. This spec is what that writer targets — per generation, keyed off
the device selector.

Source files: `h.java` (param registry + addressing), `common/z.java` (address
codec), `k1/c.java` (amps), `k1/l.java` (OD/DS), `k1/a0.java` (FX/MOD),
`k1/t.java` (delay), `k1/q0.java` (reverb), `g.java` (file I/O + `.tsl`),
`l.java`/`k.java` (section maps + device defs).
