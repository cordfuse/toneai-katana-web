# toneai-katana-web

AI-generated tone patches for the BOSS KATANA amplifier line.

Describe a song, artist, or sound. The app generates a `.tsl` patch file you
import with BOSS Tone Studio.

**Status:** pre-scaffold. Architecture and format research only — no runtime code yet.

---

## How it works

```
"Master of Puppets, rhythm tone"
        ↓
  model selects amp type, gain, EQ, and the
  booster / mod / fx / delay / reverb chain
        ↓
  emit a KATANA liveset  →  patch.tsl
        ↓
  import in BOSS Tone Studio  →  amp
```

Unlike the NUX MightyAmp (see `cordfuse/toneai-nux-cli`), the KATANA has no
QR-import path. The patch file is the delivery mechanism.

## Sibling projects

| Repo | Amp | Delivery |
|---|---|---|
| `cordfuse/toneai-nux-cli` | NUX MightyAmp | QR code |
| `cordfuse/toneai-nux-imprint` | NUX MightyAmp | conversational agent |
| `cordfuse/toneai-katana-web` | BOSS KATANA | `.tsl` file |

## Format

`.tsl` is JSON. See [docs/tsl-format.md](docs/tsl-format.md) for what is known,
what is assumed, and what still needs a ground-truth sample.

## Licence

MIT — Cordfuse.
