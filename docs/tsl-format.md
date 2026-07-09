# The `.tsl` format — what we know

Research notes, gathered before scaffolding. **Read this before writing a patch
writer.** It separates verified fact from assumption, because most of what is
published about `.tsl` is about a *different device*.

---

## Verified

- `.tsl` is **JSON**. "TSL" = Tone Studio Librarian. BOSS Tone Studio imports and
  exports them as *livesets* — a liveset is a collection of patches, not a single
  patch.
- Characteristic top-level / nested keys observed in the wild: `device`,
  `name`, `patchList`, `orderNumber`, `image`, `liveSetData`, `path`, `data`,
  `formatRev`, `memo`, `paramSet`, `PatchName`, `UserPatch`, and the device
  string `KATANA MkII`.
- **A patch's amp model lives in `preamp_a_type`**, an integer index.
- Amp type indices run **0–27** (28 amp types). Example: `DELUXE CRUNCH` is TSL
  value `12`, SysEx `0x0C`. The TSL index and the SysEx value are *not always the
  same number* — do not assume they are interchangeable.
- The count of `preamp_a_type` occurrences in a liveset equals the number of
  patches in it. Useful as a cheap structural assertion when parsing.
- Editing `preamp_a_type` by hand is the community's documented route to the
  "hidden" amp types that BOSS Tone Studio's UI does not expose.

Sources: [katana-dev/docs](https://github.com/katana-dev/docs) (amp-type table at
`tables/amp-types.md`), [Roland KATANA MkII liveset export
docs](https://support.roland.com/hc/en-us/articles/4413139434907-KATANA-MkII-How-to-export-LIVESETS-in-BOSS-Tone-Studio-for-Katana-MkII).

## NOT verified — do not build on these

- **The only published JSON Schema for the BOSS LiveSet format
  ([scottvr/BOSS_LiveSet_Schema](https://github.com/scottvr/BOSS_LiveSet_Schema))
  was generated from SY-300 factory presets, not KATANA.** Its author states it is
  "a first stab" and is unsure which properties are optional. Its claim of ~2,327
  named params per patch, 37 of which are byte arrays, plus chain params for
  effects order, describes the *family* shape — treat KATANA specifics as unknown.
- Whether `formatRev` must match a specific value for Tone Studio to accept an
  import.
- How patch names are actually stored (`PatchName` as a string? a byte array of
  ASCII, as many BOSS formats do?).
- The parameter names and value ranges for gain, EQ, booster, mod, fx, delay,
  reverb.
- Whether the KATANA generations (MkI / MkII / Gen 3 / Artist) share one schema
  or need per-device output. `device: "KATANA MkII"` suggests they do not.

## The blocking unknown

**We need a ground-truth sample: a real liveset exported from BOSS Tone Studio
for the target KATANA.**

Everything downstream — the patch writer, the validator, the AI's output schema —
is guesswork until a known-good `.tsl` exists to diff against. A patch file the
amp rejects is worse than no patch file.

Plan once a sample exists:

1. Commit it to `data/fixtures/` as the reference.
2. Derive a real schema from it (not from the SY-300 schema).
3. Round-trip test: parse → re-emit → byte-identical.
4. Only then let the model populate parameters.

## Design consequence

The AI does **not** write JSON. It selects tone *intent* — amp type, gain
staging, EQ curve, effects chain — against a constrained schema. A deterministic
writer turns that intent into a valid liveset. This keeps invalid patches
impossible by construction, rather than hoping the model emits 2,000 correct
fields.
