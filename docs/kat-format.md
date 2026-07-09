# The `.kat` format — KATANA MkII binary patch

Reverse-engineered from the BOSS Katana Librarian Android app: 20 factory `.kat`
sample patches (`assets/patches/`) diffed byte-for-byte, cross-referenced against
the parameter/enum name strings in the app's `classes.dex`. No decompiler was
used, so **enum ordinals are unresolved** (see the gap at the end).

This is the **ground-truth companion** to [tsl-format.md](tsl-format.md).
`.tsl` is the JSON liveset; `.kat` is the binary single-patch image of the same
parameters. Build the patch model against **this** file, not the SY-300-derived
schema.

---

## Record shape

Fixed **2797 bytes**:

```
[0..15]   patch name — ASCII, space-padded (0x20) to 16 bytes
[16]      0x07        — constant marker in all 20 patches (format/record type)
[17..31]  0x00        — reserved
[32..2796] parameter payload — fixed-offset, one 7-bit MIDI data byte per param
```

**The payload is an unframed SysEx temp-patch image.** Every byte at offset ≥16
is ≤ `0x7F`; there is no `F0`/`F7` framing and no manufacturer/address header. So
`.kat` is the raw parameter memory region a Katana "temporary patch" SysEx would
carry — each parameter is one 7-bit data byte. `0x32` (50) is the pervasive
default; `0x64` (100), `0x78` (120), `0x7F` (127) appear as maxima.

662 of 2797 offsets vary across the 20 samples (16 are the name). The payload is
sparse: long default runs punctuated by short variable clusters — the expected
profile for a fixed parameter map mostly sitting at defaults.

## Offset map

Confidence is explicit. HIGH = proven by diff + DEX. MED/LOW = positional
inference pending a decompile of the app's offset table.

| Offset | Parameter | Range | Conf. | Evidence |
|---|---|---|---|---|
| 0–15 | Patch name | ASCII | **HIGH** | direct read |
| 16 | Format marker `0x07` | const | **HIGH** | constant across all 20 |
| 48 | `PREAMP_A` on/off or gain-sw | 0/1 | MED | boolean, precedes type |
| **49** | **`PREAMP_A_TYPE`** (amp model) | 1–16 seen | **HIGH** | DEX param; diverges from B on ACDC |
| **50** | **`PREAMP_A_GAIN`** | 0–120 | MED-HIGH | only amp byte reaching 120 |
| 51 | `PREAMP_A_BASS` | 0–100 | MED | 39–82 across patches |
| 52 | `PREAMP_A_MIDDLE` | 0–100 | MED | 26–60 |
| 54 | `PREAMP_A_TREBLE` | 0–100 | LOW-MED | near-default |
| 55 | `PREAMP_A_PRESENCE`/`LEVEL` | 0–100 | LOW | 40–100 |
| 1073–1305 | **8× ASSIGN slots, 32-byte stride** | — | **HIGH** | `…7E 7F…` block repeats ×8; enable at 1081+n·32 |
| 1344–1596 | GEQ curve / large EQ-or-graphics block (253 B) | — | LOW-MED | contiguous variance; DEX 10-band GEQ |
| 2064–2340 | Preamp B block (mirrors A) | — | MED | shape mirrors 48–103 |
| **2305** | **`PREAMP_B_TYPE`** (amp model, channel B) | 1–16 seen | **HIGH** | DEX param; A=1/B=10 on ACDC |
| 2464–2540 / 2592–2668 / 2720–2796 | 3× 128-byte chain/level tables `(00,level)` | level 0–100 | MED | stride-128; default level 100; DEX `CHAIN_DATA` |

`PREAMP_A_TYPE` observed per factory patch (offset 49): Katana Clean=10,
Demo1/2=14, Demo3/4=1, ACDC=1, Fusion Lead=11, FusionCrunch=10, GMoore Clean=12,
GMoore Solo=16, Green Day=11, Hardwire=12, Metal Rhythm/Solo=12, Octa Fuzz=9,
Pink Floyd=12, S-H Jazz=12, Soft Lead=12, Sweet Strat=1, Tele Edge=1.

The Katana has **two independent preamp channels** (A and B), proven by ACDC
carrying A=1, B=10. A patch model must represent both.

## Enum tables (names from DEX; ordering NOT authoritative)

The value each `*_TYPE` byte indexes. Names are the DEX enum constants — but the
DEX string pool is stored **alphabetically**, so this is the *set*, not the
*order*. Do not assume index N = the Nth name here.

- **Amp / preamp models:** Natural Clean, Acoustic, Clean(+Var), Crunch(+Var),
  Lead(+Var), Brown(+Var), JC-120, Clean Twin, Pro Crunch, Tweed, Deluxe Crunch,
  VO Drive, VO Lead, Match Drive, BG Lead, BG Drive, Combo/Stack Crunch,
  HiGain Stack, Power Drive, Extreme Lead, Core Metal, MS1959 I/II, T-Amp Lead,
  SLDN, Bogner Uber, Clean Boost. (`*_VAR` variants confirmed.)
- **Booster / OD-DS:** Mid/Clean/Treble Boost, Crunch, Natural/Warm OD, Fat/Metal
  DS, OD-1, Turbo OD, Blues Drive/OD, Distortion, Guv DS, Metal Zone, Centa OD,
  T-Scream, Metal Core, Metal 1/2, Sustain.
- **MOD / FX:** T-Wah, Auto Wah, Sub Wah, Chorus, Flanger, Phaser, Tremolo,
  Vibrato, Rotary, Uni-V, Slicer, Ring Mod, Pitch Shifter, Octave, Wave Synth,
  Graphic/Parametric EQ, Guitar Sim, AC Guitar Sim, Limiter, Overtone, Pedal Bend.
- **Delay:** Digital, Analog, Tape, Reverse, Stereo, Modulate.
- **Reverb:** Ambience, Room, Hall, Plate, Spring, Modulate.
- **EQ:** Parametric (`EQ_PEQ_*`, low/high-mid freq/Q/gain) or 10-band Graphic
  (`EQ_GEQ_31HZ … 16KHZ`, `EQ_GEQ_LEVEL`).

Other confirmed payload blocks: `BOOSTER_SW/SOLO`, `NS_*` (noise suppressor),
`FX1_*`/`FX2_*` (two FX slots), `DELAY_*`/`DELAY2_*` (two delays), `CHAIN_DATA`,
`PREAMP_*_SP_TYPE`/`MIC_TYPE` (cab/mic sim).

## The remaining gap — one decompile away

Everything above is enough to *read and write* patches structurally, but not yet
to *name* an amp: observed byte 10 → which model? Two DEX artifacts would close it:

1. **The enum classes' `<clinit>` array init order** — gives true ordinals for
   every `*_TYPE`, so index→name becomes definitive.
2. **The app's offset/param-map class** — converts every MED/LOW row above into a
   proven offset and labels the whole 2780-byte payload.

Both require a jadx (or baksmali) decompile of `classes.dex`, which is not
installed on this host. Until then: **offsets are trustworthy; index→name is not.**

## Design consequence (unchanged)

The model still never emits raw bytes. It selects tone intent against a
constrained schema; a deterministic writer places values at these fixed offsets
and produces a valid 2797-byte `.kat`. This spec is what that writer targets.
