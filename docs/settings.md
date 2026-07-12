# Settings — schema and organizing principle

> Status: design, pre-scaffold. Companion to [kat-format.md](kat-format.md)
> (byte layouts) and [tsl-format.md](tsl-format.md) (liveset JSON).

## The organizing principle

**Some settings change the bytes in the emitted file. Some only bias the model.
They are different kinds of thing and must not share a section.**

| Tier | Kind | Effect | Wrong value causes |
|------|------|--------|--------------------|
| 1 | **Target device** | selects the byte layout | a file the amp rejects |
| 2 | **Gear** | biases tone intent | a patch that sounds wrong |
| 3 | **App** | none | an annoyed user |

Tier 1 is the primary key of the whole app. Tier 2 never touches a byte — it
only steers what the model *asks* the writer to build. Tier 3 is cosmetic.

---

## Tier 1 — Target device

The Katana line is **four byte layouts**, not one device with variants
(`kat-format.md` § Per-generation addressing). The picker selects which writer
runs.

```ts
type Generation = 'mk1' | 'mk2' | 'mk3' | 'go'

type Confidence =
  | 'verified'   // writer validated against real sample files
  | 'derived'    // section+offset recovered from bytecode, never round-tripped

interface DeviceProfile {
  id: Generation
  label: string           // "KATANA MkII"
  deviceString: string    // the `device` value written into the .tsl
  fileExt: '.kat' | '.kat2' | '.kat3'
  selectorIndex: 1 | 2 | 3 | 4   // MK1=1, MK2=2, MK3=3, GO=4
  confidence: Confidence
}
```

**Launch scope (decided 2026-07-09): all generations, MkII+ marked
experimental.** MkI is `verified` (20 factory samples); MkII / MkIII / GO ship
`derived`, surfaced in the UI as *experimental* with a plain-language warning.

Why this is defensible despite the "no rejected patches" rule: the deliverable
is `.tsl`, which is **section-addressed JSON**, and the MkII/MkIII descriptors
carry exactly a section (`f5440k`) + offset (`f5441l`) pair. The `.tsl` path is
the addressing those fields encode. Risk is confined to the per-generation
section+offset table, not the writer or the tone model. A `derived` layout that
is wrong is wrong in one table, and a single ground-truth export promotes it to
`verified`.

**Required guards for `derived` layouts:**

1. Structural assertion before download — patch count must equal the
   `preamp_a_type` occurrence count (`tsl-format.md` § Verified).
2. The export dialog states the layout is unvalidated, once, non-blocking.
3. `derived` is never the default selection. MkI is.

---

## Tier 2 — Gear

Gear is **model bias only**. Nothing here reaches the writer.

Two different lifetimes are tangled in the phrase "gear", and separating them is
the whole design:

- **Instrument** — persistent. You own it. Stored.
- **Pickup position** — per-request. You switch it per song, not per instrument.

Storing pickup position on the instrument would mean opening settings to play
the neck pickup. So: the instrument stores its pickup *configuration*; the
generate screen exposes the *selector*, defaulted from the active instrument.

```ts
type PickupType = 'humbucker' | 'single-coil' | 'p90' | 'active' | 'piezo'

interface Instrument {
  id: string
  name: string                 // user's label: "the '59", "my 7-string"
  kind: 'guitar' | 'bass'

  // What the model actually reasons about. An archetype carries body wood,
  // scale, and voicing conventions that `pickups` alone throws away:
  // a bridge humbucker in a Les Paul is a different tone problem than the
  // same pickup in a superstrat.
  archetype?: string           // "Les Paul", "Stratocaster", "Telecaster", "SG"

  pickups: PickupType[]        // position order: neck → bridge
}

// Dropped 2026-07-10: strings, tuning, scaleLength, stringGauge. They describe
// what you play, not how the amp is voiced — the amp does not know your tuning.
// Keeping them meant maintaining fields that never earned their place in the
// prompt.

interface GearState {
  instruments: Instrument[]
  activeInstrumentId: string
}
```

Multiple instruments → a **gear management modal** (list, add, edit, delete, set
active), not inline fields. One active instrument at a time.

### What reaches the model

The instrument plus the per-request pickup position compose into one descriptor,
which is the *only* thing gear contributes to the prompt:

```ts
// Instrument { archetype: 'Les Paul', pickups: ['humbucker','humbucker'] }
//   + position 'bridge'
//   → "Les Paul, bridge humbucker"
function describeRig(i: Instrument, position: PickupPosition): string
```

`archetype` is a free-text field with suggestions, not a closed enum — the model
resolves "Jazzmaster" or "Danelectro" fine, and a fixed list would be a
maintenance treadmill that still excludes someone's guitar. If it's empty, fall
back to the electrical description ("bridge humbucker").

### Bass is not a checkbox

`kind: 'bass'` is a UI affordance, not a capability claim. **KATANA Bass is a
separate device family with a different amp enum**, and nothing in
`kat-format.md` covers it. Until a ground-truth Bass export exists, bass
instruments should either be blocked at generate time or explicitly warned
about. Do not let `kind: 'bass'` silently emit a guitar-amp patch.

---

## Tier 3 — App

```ts
interface AppSettings {
  theme: 'system' | 'light' | 'dark'
  apiKey: string | null         // Anthropic; localStorage only
  persistHistory: boolean
  namingConvention: string      // template; see cap below
}
```

**State where the key lives, in the panel.** BYOK apps that don't say
"stored in your browser, never sent to our server" get distrusted, correctly.

---

## Providers and the free tier (decided 2026-07-09)

**This app is Anthropic-only.** Not multi-provider. Two modes:

| Mode | Key | Model | Limit |
|------|-----|-------|-------|
| **Free** | server's key | Haiku 4.5, fixed — the client's `model` is ignored outright, because it would be spending the operator's key | **10 tones/device/day**, under a **100/day global pool** shared by everyone |
| **BYOK** | user's Anthropic key | **user's choice** from the `providers.yaml` allow-list (incl. Opus) — their key pays, so their call | unbounded; never touches either counter |

### The numbers are a budget, and they were measured

A served tone costs **~$0.03** — measured, not estimated (usage is logged on every
request; see `lib/server/usage.ts`). So the global pool IS the bill:
100/day ≈ **$3/day, ~$90/month** at full draw, and only if the pool is drained
every day.

It defaulted to **1000/day** for months, which at the model in use then (~$0.09/tone)
was a **~$90/day** ceiling nobody had chosen. That is how a $20 day happened.

Keep the per-device cap at **10% of the pool**. 10-of-100 and 5-of-50 are the same
fairness guarantee — it is the *ratio*, not the absolute, that decides how many
people a full pool can serve.

Where the ~$0.03 goes on a tone that runs one web search:

| | share |
|---|---|
| Cache writes (the search results, re-cached each request) | ~45% |
| Billed input (mostly the search results themselves) | ~20% |
| Output (the write-up) | ~12% |
| The web-search fee itself ($10/1,000 searches) | ~33% of the *floor* |
| Cache reads | ~4% |

**Everything below is a measured dead end. Read it before "optimising" the cost.**

- **The search payload is not optional, and the obvious remedy backfires.** Search
  results bill as input tokens. The documented fix — the web-search tool's
  *dynamic filtering* — was measured here and made it about **2x worse**: it runs
  the search inside code execution, and that wrapper costs more than the filtering
  saves when a request makes ~1 search.
- **A 1-hour cache TTL is worse, not better.** The theory is that the ~15.7k system
  prefix keeps expiring and being rewritten. It does not — `cacheR` logs a constant
  ~15.7k, so at the default 5m TTL it is already a reliable hit. The ~10k written
  per request is the *search results*, which nothing reads back in a single-turn
  conversation. A 1h TTL doesn't remove that write, it just reprices it 1.25x → 2x:
  $0.033 became $0.051 per tone. Reverted.
- **`maxUses` is insurance, not a saving.** Across 10 measured requests — including
  deliberately obscure prompts — the model used exactly **one** search every time,
  and zero on an abstract mood request. The ceiling is never reached.
- **The search fee is a hard floor.** $10/1,000 searches is model-independent. No
  model choice gets a researched tone below ~$0.016.
- **Both limits are needed; they do different jobs.** The global cap is the
  BUDGET. The per-device cap is FAIRNESS — without it one visitor drains the whole
  day, spending the budget *and* denying everyone else. `device_id` is a
  client-generated UUID, so the device cap is a speed bump, not a wall.

### Whose key, whose model — the logs must say

Every log line (server console, `slog`, and the client diagnostics download)
carries two independent facts:

| field | meaning |
|---|---|
| `keyOwner` | `server` = **we** pay. `user` = their key pays, and the `est$` is **their** bill |
| `modelPicker` | `server` = our `TONEAI_MODEL` default. `user` = they chose it in Settings |

**Any spend rollup must filter on `keyOwner`** or it will bill the operator for
tones users paid for themselves. A BYOK Opus tone costs ~$0.30 — without the flag
that reads as a hole in the budget rather than someone else's invoice.

Consequences, in the order they'll bite:

### The inherited provider stack — dropped (done)

The fork arrived with **nine `@ai-sdk/*` providers** from the scaffold (bedrock,
cohere, google, groq, mistral, openai, openai-compatible, perplexity, anthropic),
defaulting to Google Gemini. All eight non-Anthropic providers are gone, along
with the provider row in settings and the provider pill in the composer.

The scaffold's **local**-provider support (Ollama / LM Studio / llama.cpp — a
baseURL, a live `/v1/models` probe, "is the server running?" error handling) is
also gone. It was unreachable from the day the registry dropped to one cloud
provider, but it survived as dead code for months and read as a supported
direction. It isn't one: `ProviderCategory` is now `'cloud'` and nothing else.

### Provider and model are SERVER decisions

Neither is the client's to choose, and the request body's `provider` and `model`
are ignored outright. This is a **cost** boundary, not just a tidiness one: on
the free tier the model spends the operator's key, so a client-chosen model is a
client-chosen bill. A hand-crafted request could otherwise select Opus (2.5x
Sonnet per token) and charge it to us.

Operators pick the model with `TONEAI_MODEL`, validated against the allow-list in
`config/providers.yaml`. Opus is deliberately **not** in that list — Sonnet is
more than capable of tone design.

The same rule covers **temperature** (`TONEAI_TEMPERATURE`, operator-only) and
the **system prompt**, which is built server-side per request and cannot be
overridden. The scaffold exposed both as per-conversation user settings; those
chains lingered here as dead code — the client sent a `systemPrompt` the server
never even read — and are now removed.

### The per-device sub-cap — built (2026-07-12)

A single global counter meant **one script exhausted the day's budget for
everyone** — "free mode" was a denial-of-service switch any visitor could flip.
This sat unbuilt for months while the global limit was 1000.

Free requests are now gated on a per-device daily cap (`FREE_DEVICE_DAILY_LIMIT`,
default 5) *underneath* the global pool, keyed on the `device_id` from the
inherited JWT device auth (`app/api/auth/device/route.ts`).

The device cap is checked **first**, so a user who has had their share stops
drawing on the pool — that is the entire point. If the device passes but the pool
is dry, the device increment is rolled back: we refused the request, so it must
not cost the user a slot. Both counters surface in the Usage modal (kebab →
Usage), and the two refusals are worded differently — "you've used your share" and
"the pool everyone shares is empty" are not the same message.

### The sibling's quota increment races — do not copy it verbatim

`mighty-ai-qr-web/lib/server/quota.ts` does a `SELECT`, compares, then a
separate `UPDATE`. Two concurrent requests at count 999 both read 999, both pass
the check, and both increment: the cap over-serves. Make it one atomic
statement:

```sql
UPDATE daily_quota SET count = count + 1
 WHERE date = ? AND count < ?
RETURNING count;
```

No row returned → quota exhausted. One statement, no window.

### Storage: `node:sqlite`, but bump the base image

The sibling reaches SQLite via `node:sqlite` behind `--experimental-sqlite` —
**forbidden here** (CLAUDE.md; no experimental flags). Verified 2026-07-09:
`node:sqlite` imports with **no flag** on current Node. The Dockerfile is pinned
to `node:22-alpine`, which still requires the flag.

**Bump `docker/Dockerfile` to `node:24-alpine`** and use `node:sqlite` flagless.
This gets a stable, dependency-free store — no `better-sqlite3` native addon, no
Postgres for a single integer per day.

The counter is one row per UTC date. Reset boundary is midnight UTC — say so in
the UI, next to the remaining count.

### Surface the remaining count

Free mode without a visible budget is a mystery failure at request 1001. Show
`remaining / 1000` and the reset time. `mighty-ai-qr-web` already exposes this
shape at `app/api/quota/route.ts` — that route is worth copying, the increment
underneath it is not.

### Inference is server-side (decided 2026-07-09)

The browser never calls Anthropic. Both modes hit our route; the only difference
is **which key that route uses**:

```
free  → server's ANTHROPIC_API_KEY   → quota checked + incremented
byok  → key from the request         → quota untouched
```

Consequences:

- **The system prompt and the tone-intent schema stay server-side.** They are
  the product; the browser never sees them. This is the main reason the choice
  is right.
- **A BYOK key is a transient credential, never stored server-side.** It arrives
  on the request, is passed to the SDK, and is dropped. Never written to a
  table, never put in a log line, never included in an error response. Scrub it
  from SDK error objects before surfacing them — provider errors echo request
  context.
- **It stays in browser `localStorage`** (Tier 3), sent per request over TLS.
  Say this in the settings panel verbatim.
- **BYOK still consumes our compute**, so it bypasses the *quota*, not the
  *rate limit*. Keep the per-device throttle on both paths, otherwise BYOK is an
  unmetered proxy to Anthropic that anyone can point a script at.
- The mode is derived, not stored: `apiKey ? 'byok' : 'free'`. No mode toggle in
  settings — presence of a key *is* the toggle.

---

## Settings that were missing, and belong here

These came out of reading the format spec, not the UI sketch.

### Output destination — the highest-value omission

`OUTPUT_SELECT` is **offset 16**: a real parameter, in the file. Whether the
signal is going to the amp's own speaker, headphones, or a line/DI feed changes
what the *correct patch* is — not merely how it sounds. This is Tier 1-adjacent
(it changes bytes) but is set per-session like a preference.

### Playing context / volume

Bedroom vs stage. The power-amp level interacts with the entire gain structure;
a patch voiced at stage volume sounds thin at bedroom level. Model bias, Tier 2.

### Liveset accumulation

**A `.tsl` is a collection, not a single patch** ("a liveset is a collection of
patches" — `tsl-format.md`). The natural product shape is therefore: generate
several patches into a working liveset, export once. That is a main-screen flow
decision, not a settings toggle, but the *defaults* live here — working-liveset
size, auto-add vs manual add.

Decide this before the UI is built. It changes the primary screen.

### Patch naming

`PATCH_NAME` is **16 ASCII bytes, space-padded** (offset 0–15). A hard cap, not
a guideline. Enforce at generation; a naming template that can exceed 16 chars
must truncate deterministically, not fail at export.

### About = capability disclosure

Not just a version string. State which layouts are `verified` and which are
`derived`. It is the honest surface for the MkI-only reality and the place MkII
graduates when a sample lands.

---

## Open

- Where does **output destination** live — Tier 1 (it's a byte) or a session
  control (it changes per-context)? Leaning: a persistent setting with a
  per-generate override, same pattern as instrument → pickup position.
- **Liveset accumulation.** A `.tsl` is a collection. Generate-many-export-once
  reshapes the main screen. Decide before the UI is built.
- **Device default.** `storage.ts` ships `katana-100-mk2` as default, commit
  `f825acd` calling it "the v1 ground-truth target" — but `kat-format.md` says
  MkI is the only validated layout and no MkII sample exists. One of the two is
  stale.
