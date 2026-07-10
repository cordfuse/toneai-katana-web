<!-- parent: librarian -->
# toneai-katana-web — Claude Instructions

## What This Repo Is

AI-generated tone patches for the BOSS KATANA amplifier line. The user describes
a song, artist, or sound; the app emits a `.tsl` liveset for import via BOSS Tone
Studio.

**Attribution:** Steve Krisjanovs, Cordfuse

**Status: pre-scaffold.** Architecture and format research only. No runtime code.

---

## Stack (decided)

- **Next.js 15** + Docker + Caddy vhost, mirroring `cordfuse/mighty-ai-qr-web`.
- **Do NOT copy that repo's `--experimental-sqlite` flag.** No experimental Node
  flags in this repo — use stable tooling.
- Node + TypeScript. No Python.

## The one rule that matters most

**Never emit a `.tsl` from model output directly.**

The model selects tone *intent* against a constrained schema (amp type, gain, EQ,
effects chain). A deterministic writer converts intent → liveset JSON. A patch the
amp rejects is worse than no patch at all.

## Before writing any patch code

Read [docs/tsl-format.md](docs/tsl-format.md). It distinguishes what is verified
from what is assumed. In particular: the only published BOSS LiveSet JSON Schema
was derived from **SY-300** presets, not KATANA. Do not treat it as authoritative
for this device.

**MkII: verified.** A ground-truth MkII V2 liveset was round-tripped against the
writer (the `.tsl` itself is kept locally under `data/fixtures/`, which is
gitignored — third-party community pack, not redistributed). The derived, checked-in
artifact is the golden template `lib/patch/mk2/template.ts` (+ `template.json`),
cloned from that liveset. The MkII writer builds from it and round-trips
byte-clean: section keys/order/lengths match, amp/effect indices decode correctly
(Crunch=11, Clean-Var=29), knobs store raw 0–100, and the 2-byte delay TIME
reproduces exactly (391 ms → [3,7]). Reverb TIME is still a linear approximation
(one sample per reverb type).

**Still blocked:** MkI (`.kat` samples exist, verified separately), Gen 3, and
GO have no ground-truth `.tsl` — their writers stay unextracted/guesswork until
a real export for each lands in `data/fixtures/`.

## KATANA generations

`device: "KATANA MkII"` appears in the format. MkII is now proven against a real
export; do not assume MkI / Gen 3 / Artist share its schema until each is proven
against its own real export.

## Sibling projects

`cordfuse/toneai-nux-cli` and `cordfuse/toneai-nux-imprint` target the NUX
MightyAmp and deliver tones via QR code. KATANA has no QR-import path — the file
is the delivery mechanism. Pull shared agent markdown from `cordfuse/agent-assets`
rather than copying it here.
