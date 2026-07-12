# KATANA MkI (original 2019 KATANA) — liveset format notes

Status: **verified.** The writer round-trips a real export param-for-param
(`lib/patch/mk1/__tests__`, `lib/patch/writers/__tests__/mk1-liveset.test.ts`).

MkI is the odd one out. Every other device in this app writes the modern
hex byte-section `.tsl`; **MkI does not.** Its liveset is the older Roland
**"GT" format**, and it is structurally different at every level.

Reference sample (gitignored, not redistributed):
`data/fixtures/katana-mk1-blues-collection.tsl` — a 7-patch "Blues Collection 1"
pack. The golden template is cloned from patch 0, "FAT LEAD".

Source of the model: the Katana Librarian assets
(`data/re/gen3-assets/.../librarian/ktn_mk1_model.js`, `liveset_converter.js`) —
there is no mobile BOSS Tone Studio app for the original KATANA.

## How different from the modern `.tsl`

| | Modern `.tsl` (MkII / Gen3 / GO / Air / Bass) | MkI "GT" liveset |
|---|---|---|
| Envelope | `{ formatRev, device, name, data:[[{memo, paramSet}]] }` | `{ device:"GT", version:"1.0.0", liveSetData:{…}, patchList:[…] }` |
| Patch body | `paramSet`: `UserPatch%Block` → array of **hex byte strings** | `params`: **named decimal params** (`preamp_a_gain: 70`) |
| Param count | per-block byte arrays | ~1505 flat named params per patch |
| Name | bytes in `PatchName` block | top-level `name` + `logPatchName` (`"KATANA:…"`) fields |
| Enum values | device byte value | **contiguous option index** of the name list |

So the writer has its own shape — no `SectionMap` / `toTsl`. It clones a real
patch's `params` map (golden template) and overlays only the intent fields by
name, wrapping them in the GT envelope with a single-entry `patchList`.

## Envelope (confirmed)

```
{
  "device": "GT",
  "version": "1.0.0",
  "liveSetData": { "url", "name", "image", "path", "id", "orderNumber" },
  "patchList": [
    { "patchNo", "orderNumber", "id", "liveSetId", "logPatchName", "patchID",
      "tcPatch", "note", "category", "name",
      "params": { "preamp_a_type": 11, "preamp_a_gain": 54, … } }
  ]
}
```

- `device` is **"GT"**, not "KATANA" — the original KATANA reports the GT device
  tag in this format. (The Librarian's `KtnMk1LivesetModel` keys off `device == 'GT'`.)
- `version` is a semver string `"1.0.0"`, not a `formatRev` code.
- The patch name lives in `name` and `logPatchName` (the latter prefixed
  `"KATANA:"`), NOT in the params.

## Enum orderings — two different tables for one device

MkI has **two** encodings, and their enum orderings differ:

- The flat **`.kat`** single-patch image (writers/mk1.ts) uses the byte values in
  `lib/patch/enums.ts` `*_BY_NAME` (proven vs 20 factory `.kat` samples).
- The **GT liveset** stores each enum as the **contiguous option index** of the
  name list (`*_NAMES.indexOf(name)`), which diverges from the `.kat` byte value
  for FX and reverb.

Verified against the real export:

| param | value | = names index |
|---|---|---|
| `preamp_a_type` | 11 | `AMP_NAMES[11]` = Crunch |
| `od_ds_type` | 1 | `OD_DS_NAMES[1]` = Clean Boost |
| `fx1_fx_type` | 20 | `FX_NAMES[20]` = Uni-V |
| `reverb_type` | 3 | `REVERB_NAMES[3]` = Spring |

(`REVERB_BY_NAME.get('Spring')` is 5 — the `.kat` byte value — which is why the
liveset writer uses the name-list index, not the byte map.)

## Overlaid params (writer-relevant)

| Intent | → param(s) |
|---|---|
| name | `name`, `logPatchName` (`"KATANA:"+name`), `liveSetData.name` |
| ampA type/gain/EQ | `preamp_a_type/_gain/_bass/_middle/_treble/_presence/_level` |
| booster | `od_ds_on_off/_type/_drive/_tone/_effect_level` |
| fx1 / fx2 | `fx1_on_off/_fx_type`, `fx2_on_off/_fx_type` (type only) |
| delay | `delay_on_off/_type`, `delay_delay_time_h/_l` (2-byte 7-bit), `delay_f_back`, `delay_effect_level` |
| reverb | `reverb_on_off/_type/_time/_effect_level` |

## Known limitations / open questions

- **Preamp B / dual-amp.** MkI has two preamp channels; the writer overlays A only
  and leaves B + channel routing at the template's genuine values (same scope as
  the `.kat` writer). Single-amp is the overwhelming factory default.
- **FX sub-parameter trees** (per-effect knobs) stay at the template's genuine
  values — only the FX type + on/off are overlaid.
- **Reverb TIME** uses a linear seconds→value approximation (one sample per type).
- **Delay TIME** encoding (`_h*128 + _l`) is assumed from the 2-byte split; not
  yet cross-checked against a delay-on export patch.
- **Single-patch vs full-bank import** on real hardware is unconfirmed (as with
  every device here).
