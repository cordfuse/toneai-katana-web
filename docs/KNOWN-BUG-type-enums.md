# Known bug: effect/amp TYPE enums are mis-encoded (all devices)

**Status:** documented, not fixed. Discovered 2026-07-16. Not a regression — this
has been latent since the writers were first built.

## Symptom

A generated patch loads into the amp / BOSS Tone Studio with the WRONG effect or
amp *type* selected, while switches, knobs, and routing are correct. Confirmed on
MkII from a screenshot: an intent of `booster: Metal DS` displayed as **Centa OD**;
`reverb: Room` displayed as **Plate**. The tone still plays and is usable, but it is
not the effect that was designed.

## Root cause (as far as verified)

Two compounding problems in the per-device enum tables (`lib/patch/enums.ts` and the
per-device `*/enums.ts`):

1. **Wrong enum ordering.** `OD_DS_TYPES` carries a spurious gap at index 7 and runs
   to 23; the amp's native OD/DS list has no gap and tops out at 22 (every name after
   "Fat DS" is shifted +1). `REVERB_TYPES` is scrambled vs the native order
   (`0=Plate,1=Room,2=Hall,3=Spring,4=Modulate`).
2. **Possible version-shifted TYPE offset.** The decompiled BTS model marks the OD/DS
   and FX TYPE parameters with a `Ver200` note, implying the type moved out of the
   inline block on current firmware. The empirical evidence (our byte-8 write
   displayed as Centa OD, which is byte 8 in *no* source table) could not be
   reconciled against the decompiled sources — they are internally contradictory
   (resource.js line 34 has a gap at 7; line 114 has none), suggesting the assets in
   `data/re/` are a different app version than the field app, or the real display
   table was not located.

## Why it is not fixed

The fix cannot be *verified* from source alone, because the decompiled sources
contradict each other and reality. Shipping a blind rewrite of the format layer to
the one hardware-"verified" device (MkII) risks replacing a bounded problem
("effect name slightly off") with an unbounded one ("wrong amp loads"), with no way
to self-certify before it reaches users.

## The 5-minute fix, if ground truth ever appears

One real export from the field app resolves it completely:

1. In the field app, on any patch, set **Booster = Metal DS** and **Reverb = Room**,
   export the liveset.
2. Byte-diff that file against a file this project generates for the same intent
   (`tool/cli.js write` / the web writer). The differing bytes reveal the true TYPE
   offset AND the true native enum id simultaneously.
3. Apply the corrected offsets/enum ids per device. The same method fixes all nine
   devices; each needs its own export to confirm, but the MkII export validates the
   method.

Authoritative-ish source tables live in
`data/re/gen3-assets/assets/html/js/businesslogic/librarian/ktn_mk2_model.js` and the
sibling `ktn_*_model.js` files, plus `config/resource.js` — but treat them as leads,
not truth, until an export corroborates.
