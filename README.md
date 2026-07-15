# ToneAI Kat

**AI tone patches for the BOSS KATANA.** Describe a song, an artist, or just a
vibe — ToneAI Kat designs the tone and hands you a ready-to-import `.tsl` patch
for BOSS Tone Studio.

> **Work in progress — testers wanted.** This is under active development and
> community feedback drives it. Only the KATANA MkII is verified on real hardware
> (it's the amp we own). If you play any other KATANA, generate a tone, load it,
> and tell us how it went — working or broken, that report is the most useful
> thing you can contribute.

<p align="center">
  <img src="docs/screenshots/02-home.png" width="30%" alt="Home" />
  <img src="docs/screenshots/03-chat.png" width="30%" alt="Chat with a generated tone" />
  <img src="docs/screenshots/04-tone-modal.png" width="30%" alt="Tone detail" />
</p>

---

## What it does

- **Plain-English tone design.** "Gilmour's *Comfortably Numb* second solo" →
  a full amp / cab / effects chain, dialled and explained.
- **Real, importable patches.** Every tone downloads as a `.tsl` liveset you
  open in BOSS Tone Studio and send to the amp. The KATANA has no QR-import
  path — the file *is* the delivery mechanism.
- **Grounded in real references.** Live web search pulls actual artist and song
  tone write-ups while the model designs.
- **Your gear, remembered.** Save your instruments in *My Gear* (make, model,
  pickups) and the model tailors tones to what you actually play — guitar or
  bass, neck/bridge/both.
- **My Tones.** Every patch you generate is saved to revisit, rename, and
  re-download.
- **Free daily tier, or bring your own key.** Start free — **10 tones a day per
  device, under a 100/day pool shared by everyone** (both visible under
  **⋮ → Usage**). Add your own Anthropic API key in Settings for unlimited use
  and your pick of model, including Opus. Your key is sent per-request and never
  stored or logged. Full guide: **[BYOK.md](BYOK.md)**.
- **Themes, OLED by default.** A true-black UI out of the box, plus an
  amp-inspired palette (tweed, amber, British, oxblood, and more).

## The one rule that matters

**The model never writes a `.tsl` directly.** It fills in a constrained
tone-intent schema (amp type, gain, EQ, the booster / mod / fx / delay / reverb
chain), and a **deterministic writer** converts that intent into the liveset —
building on each amp's own **factory-default** patch, so every parameter the tone
doesn't set stays neutral instead of inheriting a stranger's tone. The result
round-trips byte-clean against a reference export. A patch the amp rejects is
worse than no patch at all.

```
"Comfortably Numb, second solo"
        ↓
  model selects amp, gain, EQ, and the
  booster / mod / fx / delay / reverb chain   (constrained intent schema)
        ↓
  deterministic writer  →  KATANA MkII liveset  →  patch.tsl
        ↓
  import in BOSS Tone Studio  →  amp
```

### Booster selection (0.12.2)

The tone designer chose the amp and effects well but had no guidance on the
booster / overdrive, so it reached for a boost on tones that don't need one and
defaulted to the same overdrive across very different songs. It now matches the
booster to how the record was made: amp-driven rock and metal take their gain from
the amp (booster off, or a light mid push), while transparent boosts — Centa, clean,
treble — are reserved for their real jobs: pushing a cranked amp, brightening, a solo
lift. If the amp voice already carries the tone, the booster stays off.

### No more dropped turns (0.12.1)

A tone request could come back as an error instead of a patch: when the model
returned an incomplete response, the writer assumed the amp block was always present
and threw, taking down the whole turn. Incomplete patches are now set aside quietly —
the rest of the answer still reaches you, and you get your tone.

### Faithful defaults (0.12.0)

Every writer used to build a patch by cloning one real "donor" patch and overlaying
only the ~15 parameters the tone chose. The other ~135 — compressor, EQ, noise gate,
reverb tail, contour — silently carried that donor's tone into **every** patch,
regardless of what you asked for. Ask for clean surf with a touch of reverb and you
still got a stranger's boomy, washed-out reverb underneath it.

The writers now start from each device's **factory defaults**, pulled from the amp's
own editor, so untouched parameters are neutral. Signal-chain routing, switch enables,
and pedal/knob assignments still match a real export byte-for-byte; only the inherited
tone tail is reset. Separately, the KATANA MkI had a selector-encoding bug where the
reverb type was written as a list index rather than the amp's native value — asking
for *Spring* decoded as *Hall*. Both are fixed.

## Supported devices

The `.tsl` format is **generation-scoped**: the 50 / 100 / Head / Artist
variants within a generation write a byte-identical patch — they differ in
hardware (wattage, speaker, cab), not patch data. So the picker lists **one
entry per generation**.

All nine amps in the lineup have a writer, and every writer round-trips byte-clean
against a reference liveset. **That is not the same as an amp accepting the patch**,
and it would be dishonest to present it as if it were.

**Only the KATANA MkII is verified on real hardware.** It is the amp the maintainer
owns, so it is the only one where a generated patch has actually been loaded and
played. Every other writer is built from format research and proven against
reference files — which is real work, and is *not* a substitute for a physical amp
saying yes.

The picker offers all nine, deliberately. The writers are our best honest attempt
and they may well be correct; we simply cannot promise it. **If you own anything
other than a MkII, generating a tone and telling us what happened is the single
most useful contribution you can make** — working or broken, that is the missing
information. [Open an issue](https://github.com/cordfuse/toneai-katana-web/issues).

| Device | Instrument | Status |
|---|---|---|
| **KATANA MkII** | Guitar | **Verified on hardware** ([docs](docs/tsl-format.md)) |
| **KATANA Gen 3** | Guitar | Writer built; unverified on hardware ([docs](docs/gen3-format-notes.md)) |
| **KATANA MkI** | Guitar | Writer built; unverified on hardware — the original 2019 KATANA; its own "GT" named-parameter liveset ([docs](docs/mk1-format-notes.md)) |
| **KATANA:AIR** | Guitar | Writer built; unverified on hardware — effects-only; amp delivered as hand-dial instructions ([docs](docs/air-format-notes.md)) |
| **KATANA:GO** | Guitar | Writer built; unverified on hardware ([docs](docs/go-format-notes.md)) |
| **KATANA:GO Bass** | Bass | Writer built; unverified on hardware ([docs](docs/go-format-notes.md)) |
| **KATANA Bass** | Bass | Writer built; unverified on hardware — desktop 110 / 210 / Head ([docs](docs/katana-bass-format-notes.md)) |
| **WAZA-AIR** | Guitar | Writer built; unverified on hardware — wireless headphone amp, effects-only ([docs](docs/waza-air-format-notes.md)) |
| **WAZA-AIR Bass** | Bass | Writer built; unverified on hardware — wireless headphone amp, effects-only ([docs](docs/waza-air-format-notes.md)) |

Within a generation the 50 / 100 / Head / Artist variants write a byte-identical
patch — they differ in hardware (wattage, speaker, cab), not patch data — so the
picker lists one entry per generation, not per cabinet.

### Guitar and bass are separate

The amp you pick sets the patch **format**; the instrument in *My Gear* sets the
**voicing**. A guitar amp is universal — play a guitar or a bass through it and
the tone is voiced accordingly. A bass amp only voices bass, so pairing it with a
guitar is blocked rather than producing a patch that makes no sense.

### Convert between amps

A tone designed for one amp can be **converted to another you own** — open it,
and if it targets a different KATANA than you play, convert it for your amp.
Conversion stays within an instrument: guitar-to-guitar or bass-to-bass, never
across (a guitar tone isn't re-voiced for a bass rig). Knobs carry across
unchanged; amp and effect names are remapped to the target's vocabulary (Gen 3's
six amp characters vs. MkII's larger set), and an effect with no counterpart is
dropped rather than written as something the amp would reject. The converted
patch is saved to *My Tones* as its own entry.

## Screenshots

| Welcome | Settings | About |
|---|---|---|
| <img src="docs/screenshots/01-welcome.png" width="240" alt="Welcome" /> | <img src="docs/screenshots/06-settings.png" width="240" alt="Settings" /> | <img src="docs/screenshots/07-about.png" width="240" alt="About" /> |

| My Tones | My Gear | Tone detail |
|---|---|---|
| <img src="docs/screenshots/05-tones-library.png" width="240" alt="My Tones" /> | <img src="docs/screenshots/08-gear.png" width="240" alt="My Gear" /> | <img src="docs/screenshots/04-tone-modal.png" width="240" alt="Tone detail" /> |

## Stack

- **Next.js 15** (App Router) + **React 19**, TypeScript
- **Vercel AI SDK** with **`@ai-sdk/anthropic`** — Anthropic-only; tone design
  runs on Claude, with Anthropic's native web search
- **`node:sqlite`** (`DatabaseSync`, Node 24+, no experimental flags) for device
  auth, the daily quota, and diagnostics — no external database
- Stateless **device JWT** auth
- Docker (standalone build) behind Caddy

## Run it locally

```bash
cd nodejs
npm install
cp .env.example .env.local     # set JWT_SECRET and ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
npm test                        # node:test suite
```

Node 24+ is required (`node:sqlite`).

## Deploy (Docker)

Three compose files under `docker/`, pick the one that matches your host:

| File | Use |
|---|---|
| `docker-compose.yml` | Direct port exposure (`localhost:3008`), no proxy |
| `docker-compose.prod.yml` | Caddy edge with automatic HTTPS for a public domain |
| `docker-compose.internal-caddy.yml` | Join an existing host reverse proxy on a shared network |

```bash
cd docker
cp .env.example .env            # fill in secrets
docker compose up -d --build
```

The build context is the repo root and the Dockerfile lives at
`docker/Dockerfile` (so `.tsl` config and `VERSION` resolve). On a
platform-managed deploy (e.g. Render), set **Dockerfile Path** to
`./docker/Dockerfile` and leave the root directory blank.

### Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `JWT_SECRET` | **yes** | — | Signs device tokens. `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` | for free tier | — | Powers the shared free daily quota. Unset = BYOK only |
| `FREE_DAILY_LIMIT` | no | `100` | Global daily free-tier ceiling, shared by everyone — **this is the budget cap**. A served tone costs ~$0.035, so 100/day ≈ $3.50/day. Resets midnight UTC. `unlimited` = no cap; `0` = no free tier (BYOK only) |
| `FREE_DEVICE_DAILY_LIMIT` | no | `10` | What one device may take from that pool per day — the fairness cap, so one visitor can't drain the day for everyone. Kept at 10% of the pool. Same `unlimited` / `0` values |

> **`0` means NO free requests. It does not mean unlimited.** Write the word
> `unlimited` for that. `0` is how you'd naturally express "none" — an operator
> switching the free tier off types `0` and must get zero, not an unbounded bill.
> Every guard here fails closed; a sentinel you can hit by accident wouldn't.
> `unlimited` is a word precisely because a word can't be typed by mistake.
| `TONEAI_WEB_SEARCH_MAX_USES` | no | `2` | Max web searches per response (clamped 1–10). Search always-on; this is the per-request cost cap |
| `QUOTA_RESET_DATE` | no | — | One-shot goodwill reset. Set to **today's UTC date** (`YYYY-MM-DD`) and redeploy: today's global + per-device counters are zeroed once, at boot. **Self-disarms at midnight UTC** — a stale value is inert. It's a date rather than a flag because a flag would re-fire on every restart and silently remove your daily cap |
| `TONEAI_MODEL` | no | `claude-haiku-4-5` | Free-tier tone-design model. Operator-only — a free-tier client cannot pick a model (it spends this key). **BYOK users can**, from the `config/providers.yaml` allow-list, since their own key pays |
| `TONEAI_TEMPERATURE` | no | `1.0` | Sampling temperature. Operator-only — there is no per-chat override |
| `ADMIN_TOKEN` | no | — | Unlocks `GET /api/admin/logs` (see below). **Unset → the route 404s and the admin surface does not exist.** Use a long random value: `openssl rand -base64 36` |
| `DB_PATH` | no | `data/katana.db` | SQLite path. **On a platform host this must point at the persistent disk** (e.g. `/app/data/katana.db`) — anywhere else and every deploy wipes the quota, the logs, and every device's auth |
| `TONEAI_CONFIG_DIR` | no | bundled | Where branding / themes config is read from |

The SQLite DB holds device auth, the quota counters, and the diagnostic log. On an
ephemeral-filesystem host, mount a persistent volume at `/app/data` and point
`DB_PATH` at it, so all three survive a deploy.

See [`docker/.env.example`](docker/.env.example) for the full annotated list.

### Operator telemetry

Every request logs what it cost, which model ran, **whose key paid** (`keyOwner`:
the operator's or a BYOK user's), and **what the model actually dialled** — not
just the tone's name:

```
[chat] stream <id> done model=claude-haiku-4-5 (server) key=server in=35136 (billed 10096)
       out=785 cacheR=10516 cacheW=14524 searches=1 est=$0.0432 (OURS)
[chat]   patch: Rebel Rebel — Clean Twin g45 b35 m55 t75 p70 · OD Treble Boost d50 t75 ·
       FX1 Comp · Delay off · Reverb Room 1.2s
```

Refusals are logged too (`429` quota, `503` missing key), because **the requests
you turn away are the signal that tells you whether the limits are right** — the
served ones only tell you what they cost.

With `ADMIN_TOKEN` set, the same data is queryable across all users and survives
the platform's log window (30-day retention on the persistent disk):

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" \
  "https://<host>/api/admin/logs?summary=1"          # rollups: spend by who paid,
                                                     # refusals by cause, amp mix
curl -H "x-admin-token: $ADMIN_TOKEN" \
  "https://<host>/api/admin/logs?event=chat.rejected" # who got turned away, and why
curl -H "x-admin-token: $ADMIN_TOKEN" \
  "https://<host>/api/admin/logs?days=7&prompts=1"    # a week, including prompt text
```

**User prompt text is withheld unless you pass `prompts=1`.** The default response
is safe to paste into an issue or a screenshot. The token goes in a **header, never
a querystring** — a URL-borne secret leaks into access logs, browser history, and
`Referer`. It is compared in constant time, and bad tokens are logged with the
caller's IP.

The **amp mix** in the summary is the quality signal worth watching: if one amp
becomes most of the output, the model has collapsed onto a favourite and the tones
are going samey — a regression invisible in cost and latency.

## Format docs

- [docs/kat-format.md](docs/kat-format.md) — the `.kat` binary format, per
  generation, and what's verified vs. assumed
- [docs/tsl-format.md](docs/tsl-format.md) — the `.tsl` liveset JSON envelope
- [docs/settings.md](docs/settings.md) — parameter map behind the tone intent

## Sibling projects

| Repo | Amp | Delivery |
|---|---|---|
| `cordfuse/toneai-katana-web` | BOSS KATANA | `.tsl` file |
| `cordfuse/toneai-nux-cli` | NUX MightyAmp | QR code |
| `cordfuse/toneai-nux-imprint` | NUX MightyAmp | conversational agent |

## Licence

MIT — Steve Krisjanovs, Cordfuse.
