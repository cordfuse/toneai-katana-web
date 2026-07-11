# KATANA Air — `.tsl` format notes

Status: **format recon in progress.** The `.tsl` envelope is confirmed from a
real export; the parameter address map is **not yet extracted** — no writer
should emit an Air patch until it is (the confidence guard keeps `air` at
`unextracted`, same discipline as pre-verified Gen 3).

Reference sample (gitignored, not redistributed):
`data/fixtures/katana-air-rock-legend-vol1.tsl` — a ToneCentral "Rock Legend
Vol.1" bank of 8 patches.

## Envelope (confirmed)

```
{
  "name": "ROCK LEGEND 1",
  "formatRev": "0000",
  "device": "KATANA-AIR",
  "data": [ [ patch0, patch1, … patch7 ] ]     // a BANK OF 8, not one patch
}
```

- **device string:** `KATANA-AIR` (hyphenated — not "KATANA Air").
- **formatRev:** `0000` (same rev string as Gen 3, different layout).
- **liveset shape:** `data[0]` is an array of **8 patches**. Every sample bank
  carries a full 8 slots. Open question below.

### Per-patch

```
{
  "memo": "{\"memo\":\"\",\"isToneCentralPatch\":true}",   // JSON STRING, Air-specific
  "paramSet": { "User%Patch": [ <2335 hex-string bytes> ] }
}
```

- **key prefix:** `User%`; a patch is a **single flat block** `User%Patch`.
  This is a FLAT PARAMETER IMAGE (like MkI), **not** the multi-block section map
  MkII (`UserPatch%…`) and Gen 3 (`PATCH%…`) use.
- **block length:** 2335 bytes, values are hex strings (`"48"`, `"45"`, …),
  same encoding as the other generations.
- **patch name:** offset **0**, 16 ASCII bytes. Confirmed by decoding all 8
  names (HERE WE ARE NOW, EXIT LIGHT, SWEET CHILD, …).
- **memo:** a JSON *string* (double-encoded), carrying `isToneCentralPatch`.
  A user-authored patch likely differs here — confirm when we have the app.

## CRITICAL: Air patches do NOT store the amp

Extracted the full patch parameter model from the Air editor app
(`config/address_map.js`, nibble-addressed → `lib/patch/air/param-table.json`,
478 params, block length **2335 bytes — exact match to the fixture**, offsets
verified against the real bank).

The patch block (`prm_prop_patch`) carries **only the effects chain**:

| Block | What | Options |
|---|---|---|
| ODDS | booster / overdrive / distortion | 25 types |
| FX1, FX2 | two mod/FX slots | 37 types each |
| DLY | delay | 7 types |
| REVERB | reverb | 5 types |
| EQ, NS1, SEND, MASTER, CHAIN, … | EQ, noise gate, routing | — |

There is **no amp / preamp block in the patch.** The amp voicing —
AMP TYPE (5 voices), GAIN, VOLUME, BASS, MIDDLE, TREBLE, PRESENCE — lives in the
**System** block as `PRM_SYS_KNOB_POS_*`: those are the physical panel-knob
positions, global to the amp, **not saved per patch.**

**Product consequence:** an Air `.tsl` tone is the effects/booster/EQ/delay/
reverb chain only. The amp character is set by the player's front-panel knobs and
cannot be baked into the file. A generated Air tone must deliver the amp settings
as **instructions** ("set Type to Crunch, Gain ~7, …"), not bytes. This reshapes
the tone-intent → Air mapping (the `ampA` section becomes guidance, not payload).

## NOT yet known (blocks a verified writer)

1. **Parameter address map** — which offsets in the 2335-byte image hold amp
   type, gain, EQ (bass/mid/treble/presence), booster/OD, the two mod/FX slots,
   delay, reverb, and their switches. Source: the **KATANA Air editor app**
   ("BOSS Tone Studio for KATANA:AIR"), the same way Gen 3's map came from its
   app's `AddressMap`.
2. **Enum orderings** — Air's amp list and effect lists (Air has a reduced set
   vs the full KATANA line; needs its own vocab entry in `lib/patch/vocab.ts`).
3. **Verification ground truth** — 1–2 Air exports with *known* settings, to
   prove decoded offsets (the Air analogue of Gen 3's EVH→BROWN check).

## Open questions

- **Single patch vs full bank.** Every sample is a bank of 8. Does Air's BTS
  import accept a 1-patch liveset (`data[0] = [[patch]]`), or must we always
  emit 8 slots (pad the other 7)? Decides how a single generated tone is
  delivered. Test once a writer exists.
- **`memo` for a generated patch.** Is `isToneCentralPatch:true` required, or
  do user patches use a different memo shape? Grab a user-exported patch.

## Build plan (once the app + samples land)

1. Extract the address map + enums from the Air app → `lib/patch/mk*`-style
   `param-table.json` + `air/enums.ts`.
2. Golden template from a real patch → `air/template.ts` (single `Patch`
   section, `keyPrefix: 'User%'`), round-trip test vs the fixture.
3. `writers/air.ts` — flat-image overlay (closer to `writers/mk1` than mk2/mk3),
   wrapped through `toTsl` with the `User%` prefix + bank handling.
4. Vocab entry, `generations.ts` `air` profile → `verified`, wire the schema/
   prompt/convert path, flip the device to selectable.
