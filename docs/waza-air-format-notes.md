# WAZA-AIR + WAZA-AIR BASS — `.tsl` format notes

Status: **verified** (both). Each writer round-trips a real export byte-for-byte
(`lib/patch/writers/__tests__/waza.test.ts`, `waza/__tests__`, `waza-bass/__tests__`).

These are BOSS's **wireless headphone amps** — a separate product family from
KATANA:AIR, with a **separate app for each** (BOSS Tone Studio for WAZA-AIR, and
for WAZA-AIR BASS). WAZA-AIR (guitar) is `instrument: guitar`; WAZA-AIR Bass is
`instrument: bass`.

Reference samples (gitignored, not redistributed):
- `data/fixtures/waza-air-classic-rock.tsl` — "Classic Rock Tones" (6 patches)
- `data/fixtures/waza-air-bass-rock.tsl` — "Rock Bass Tones" (6 patches)

Golden templates are cloned from patch 0 of each.

## Same shape as KATANA:AIR — one code path

Both WAZA apps write the **exact same flat image** as KATANA:AIR:

- envelope `{ name, formatRev: "0000", device, data:[[{memo, paramSet}]] }`
- one block, key `User%Patch`, **2335 bytes**
- and — verified — the **same effect byte offsets** (booster @48/49, fx1 @192/193,
  fx2 @460/461, delay @736.. with a 2-byte 7-bit time, reverb @784..).

Diffing the two WAZA apps against KATANA:AIR, the address maps differ only in
**system/control params** (USB level, transmitter sleep, EV-1-WL functions) and
the **voices** — never the patch layout. So all three (KATANA:AIR, WAZA-AIR,
WAZA-AIR BASS) are just `AirModel` configs on one config-driven builder
(`writers/air.ts` → `buildAirImage`).

Device strings (as written): **`WAZA-AIR`** and **`WAZA-AIR BASS`**.

## Effects-only — the amp is panel state (as KATANA:AIR)

A WAZA patch stores ONLY the effects chain. The amp (AMP TYPE + gain/EQ) is a
global front-panel setting, never per-patch, so the writer does **not** write it.
`wazaAmpSettings` / `wazaBassAmpSettings` map the intent's amp to a panel voice +
knob values for the hand-dial INSTRUCTIONS the tone card shows.

## Voices

**WAZA-AIR (guitar)** — booster / mod-FX / delay / reverb voices are **identical
to KATANA:AIR** (the app's ODDS/FX/DELAY/REVERB resource lists match, and the real
bank decodes the same: booster 11=OVERDRIVE, fx 29=CHORUS, reverb 3=HALL). So the
writer reuses `air/enums.ts` for those. Only the **amp panel voices** differ:

| index | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| KATANA:AIR | ACOUSTIC | CLEAN | CRUNCH | LEAD | BROWN |
| **WAZA-AIR** | **FLAT** | CLEAN | CRUNCH | LEAD | BROWN |

**WAZA-AIR BASS** — bass-specific amp / booster / mod-FX; **delay + reverb reuse
the shared Air voices**. Cross-checked against the real bank (booster 12=BASS DRV,
1=BASS OD, 8=BASS FUZZ; fx 9=COMPRESSOR, 21=BASS SYNTH).

- **Amp voices:** SUPER FLAT, FLAT, VINTAGE, MODERN, DRIVE
- **Booster (0–13):** BOOSTER, BASS OD, BLUES OD, NATURAL, BASS DS, GUV DS,
  BASS MT, METAL ZONE, BASS FUZZ, MUFF FUZZ, HiBAND DRV, AB-DIST, BASS DRV, BASS DI
- **Mod/FX (0–21):** CHORUS, FLANGER, PHASER, UNI-V, TREMOLO, VIBRATO, ROTARY,
  RING MOD, SLOW GEAR, COMPRESSOR, LIMITER, T. WAH, GRAPHIC EQ, PARAMETRIC EQ,
  OCTAVE, PITCH SHIFTER, HARMONIST, HUMANIZER, ENHANCER, BASS SIMULATOR,
  DEFRETTER, BASS SYNTH

## Open questions (need hardware)

- **GYRO / spatial ambience** (the "amp in the room" RSS AMBIENCE params) live in
  the image but aren't in the tone-intent model — they stay at the template's
  genuine values. A future feature could expose them.
- **Delay TIME** (2-byte `hi*128+lo`) and **reverb TIME** (linear seconds) follow
  the Air conventions; the sample banks don't exercise every delay type, so the
  upper delay indices are unverified on-device.
- **Single-patch vs full-bank import** on real hardware is unconfirmed.
