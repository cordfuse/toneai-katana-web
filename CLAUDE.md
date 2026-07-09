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

**Blocked on:** a ground-truth `.tsl` exported from BOSS Tone Studio for the
target KATANA. Until one lands in `data/fixtures/`, the patch writer is guesswork.

## KATANA generations

`device: "KATANA MkII"` appears in the format. Do not assume MkI / MkII / Gen 3 /
Artist share a schema until proven against real exports from each.

## Sibling projects

`cordfuse/toneai-nux-cli` and `cordfuse/toneai-nux-imprint` target the NUX
MightyAmp and deliver tones via QR code. KATANA has no QR-import path — the file
is the delivery mechanism. Pull shared agent markdown from `cordfuse/agent-assets`
rather than copying it here.
