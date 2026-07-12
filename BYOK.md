# Bring Your Own Key

**ToneAI Kat is free to use, but the free tier is small.** It has to be — every tone
costs real money to generate, and one person paying the bill can only give away so
much.

If you've hit the limit, or you want better tones than the free tier's model can
produce, you can plug in your own Anthropic API key. It takes about five minutes.
A tone costs roughly **3 to 4 cents** on the default model — so what you spend
depends entirely on how many you make, and $5 of credit goes a long way.

This guide covers the whole thing: signing up, creating a key, what it costs,
choosing a model, running the app yourself, and how to stop paying if you change
your mind.

---

## Why the free tier is limited

Generating a tone isn't a lookup. The app searches the web for how a given
guitar sound was actually made, reads what it finds, and then chooses amp, gain,
EQ and effects against the KATANA's real parameter set. That research is what
makes the tones good, and it's also what makes them cost money — every request
pays for the search and for the model's reading of the results.

Measured in production, a tone costs roughly **3 to 4 cents**. The free tier is
capped at:

| Limit | Value |
|---|---|
| Per device, per day | **10 tones** |
| Shared pool, per day (everyone) | **100 tones** |

Both reset at midnight UTC. The shared pool is the important one: if the day's 100
tones are gone, they're gone for everybody, even if you personally have some left.
You can see both numbers live in the app under **⋮ → Usage**.

With your own key, **neither limit applies to you.** Your requests don't touch
either counter.

---

## What it costs

You pay Anthropic directly, per request, for exactly what you use. There's no
subscription and no minimum.

On the default model (Haiku 4.5), a tone costs about **3–4 cents**. These are real
measured requests, not estimates:

| What you asked for | Cost |
|---|---|
| A tone that needed web research ("Black Dog") | ~$0.036 |
| Another ("Rebel Rebel") | ~$0.030 |
| A tone from a vague description ("warm but broken, like a radio in another room") | ~$0.005 |
| A plain question ("what does the presence knob do?") | ~$0.002 |

Why the spread: a tone about a specific song runs a **web search**, and the results
of that search are the bulk of the cost. A vague, feel-based request needs no
research, so it's nearly free. A question that produces no patch at all is cheaper
still.

So **$5 of credit is roughly 140 researched tones.** If you're an occasional user,
a single $5 top-up may last months.

The cost scales with the model you pick — see [Choosing a model](#choosing-a-model)
below. Opus is roughly 8–10x Haiku per tone.

---

## Step 1 — Create an Anthropic account

1. Go to **[console.anthropic.com](https://console.anthropic.com)**.
2. Sign up with an email address or a Google account.
3. Verify your email if prompted.

This is the **Anthropic Console** — the developer platform. It is *not* the same
thing as a Claude.ai chat subscription.

> **Important:** A Claude Pro or Claude Max subscription does **not** give you API
> access, and does **not** work here. They're billed separately. If you already pay
> for Claude Pro, you still need to add API credit below. This surprises a lot of
> people, so it's worth saying plainly.

---

## Step 2 — Add credit

The API is prepaid. Until you add credit, any key you create will fail with an
"insufficient credit" error.

1. In the Console, go to **Settings → Billing** (or **Plans & Billing**).
2. Click **Add credit**.
3. Add a card and buy credit. **The minimum is usually $5 — start there.** For this
   app, $5 is a lot of tones.

**Turn OFF auto-reload if you want a hard ceiling on what you can ever spend.** With
auto-reload disabled, your account simply stops working when the credit runs out,
which is exactly the safety net most people want. You can always top up again.

---

## Step 3 — Create an API key

1. In the Console, go to **Settings → API keys**.
2. Click **Create key**.
3. Give it a name you'll recognise later — `toneai-kat` is a good one. Naming it
   makes it easy to revoke *just this key* later without breaking anything else.
4. Copy the key. It starts with `sk-ant-`.

> **You will only be shown the key once.** Copy it now. If you lose it, you can't
> recover it — you just delete it and make a new one, which costs nothing.

---

## Step 4 — Paste it into ToneAI Kat

1. In the app, open **Settings** (the gear icon, top right).
2. Find the **Anthropic API Key** field.
3. Paste your key. It saves automatically when you click away.

The field will confirm: *"Using your key — no daily limit."* That's it. Every tone
from now on is billed to your Anthropic account, and the free-tier limits no longer
apply to you.

To go back to the free tier at any time, click **Remove key → use free mode**.

---

## Where your key goes

Worth being precise about this, because you're pasting a credential into a website.

- Your key is stored in **your browser's local storage**, on your device. It is not
  in a database anywhere.
- It is sent with each request, over HTTPS, to the app's server, which uses it to
  call Anthropic and then **discards it**. It is never written to a log, never
  saved to disk, and never persisted server-side.
- It is scrubbed out of error messages and diagnostic downloads.
- Clearing your browser data removes it. So does clicking **Remove key**.

If any of that isn't good enough for you — and that's a legitimate position — the
app is open source and you can run it yourself. See
[Running your own instance](#running-your-own-instance).

If you ever want to be certain a key is dead, delete it in the Anthropic Console
under **Settings → API keys**. That revokes it instantly and permanently, whatever
else has a copy of it.

---

## Choosing a model

Once you've added a key, a **Model** section appears in Settings. This is
BYOK-only — on the free tier the model is fixed, because it's spending someone
else's money.

| Model | Cost per tone | When to pick it |
|---|---|---|
| **Claude Haiku 4.5** *(default)* | ~$0.035 | Cheapest. What the free tier runs. Good tones for well-documented songs. |
| **Claude Sonnet 5** | ~$0.07 | Better reasoning about obscure or ambiguous sounds. |
| **Claude Sonnet 4.6** | ~$0.09 | Similar to Sonnet 5; slightly different flavour. |
| **Claude Opus 4.8** | ~$0.30 | The strongest reasoning available. Overkill for most tones — but if a sound is genuinely hard to pin down, this is the one that will reason its way there. |

The dropdown shows the cost next to each model, so you never discover the
difference on your bill instead of in the app.

**Start with the default.** Haiku wasn't picked to be cheap — it was picked after an
A/B against Sonnet on the same prompts, where both models independently chose the
same amp and drive for *Rebel Rebel*, within a few points on the knobs. It produced
comparable tones for well under half the cost.

The bigger models earn their money on hard, vague, or obscure requests — not on
"Highway to Hell".

---

## Running your own instance

If you'd rather not hand your key to a website at all, run the app yourself. It's
open source: **[github.com/cordfuse/toneai-katana-web](https://github.com/cordfuse/toneai-katana-web)**

Then the key lives in your own environment file and never leaves your machine.

Three ways, easiest first.

### Option A — Docker, one command (recommended)

**No clone, no build, no toolchain.** A prebuilt image is published to GitHub's
container registry on every release. You need Docker and nothing else:

```bash
docker run -d \
  --name toneai-kat \
  -p 3008:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e JWT_SECRET="$(openssl rand -base64 32)" \
  -e FREE_DAILY_LIMIT=unlimited \
  -e FREE_DEVICE_DAILY_LIMIT=unlimited \
  -v toneai-kat-data:/app/data \
  ghcr.io/cordfuse/toneai-katana-web:latest
```

The app is at **http://localhost:3008**. That's it.

What those lines do:

| | |
|---|---|
| `ANTHROPIC_API_KEY` | your key — the server uses it for every tone |
| `JWT_SECRET` | signs your browser's device token; any long random string |
| `FREE_*_LIMIT=unlimited` | removes the daily caps. The hosted app needs them to bound *its* bill; on your own instance it's your key either way. Leave them out and you'd cap yourself at 10 tones a day |
| `-v toneai-kat-data:/app/data` | keeps the small database (auth, quota, logs) across restarts. Drop it and you start fresh every time |
| `-p 3008:3000` | change `3008` if that port is taken |

Useful afterwards:

```bash
docker logs -f toneai-kat        # watch it run — the cost per tone is logged here
docker stop toneai-kat           # stop
docker rm -f toneai-kat && docker pull ghcr.io/cordfuse/toneai-katana-web:latest
                                 # update to the newest release
```

Pin a version instead of `latest` if you'd rather not move: `:0.10.0`.

### Option B — Docker Compose (from a clone)

Use this if you want to change the branding, put it behind a real domain, or build
from source.

```bash
git clone https://github.com/cordfuse/toneai-katana-web.git
cd toneai-katana-web/docker
cp .env.example .env     # set ANTHROPIC_API_KEY and JWT_SECRET
docker compose up -d --build
```

Also at **http://localhost:3008**. Two other compose files sit alongside it:
`docker-compose.prod.yml` (Caddy with automatic HTTPS for a public domain) and
`docker-compose.internal-caddy.yml` (join an existing reverse proxy).

### Option C — Node directly

Needs **Node 24 or newer** (the app uses `node:sqlite`, no experimental flags).

```bash
git clone https://github.com/cordfuse/toneai-katana-web.git
cd toneai-katana-web/nodejs
cp .env.example .env.local
npm install
npm run dev
```

The app runs at **http://localhost:3000**.

### Settings worth knowing

Both options read the same variables. Everything except the key and the JWT secret
is optional:

```bash
# The model the server uses. Defaults to claude-haiku-4-5 — the cheapest, and
# what the hosted app runs. Must be an id from nodejs/config/providers.yaml:
#   claude-haiku-4-5 · claude-sonnet-4-6 · claude-sonnet-5 · claude-opus-4-8
TONEAI_MODEL=claude-sonnet-4-6

# Daily limits. On your own instance you are the only user and it is your own key
# either way, so you probably want no limit at all:
FREE_DAILY_LIMIT=unlimited
FREE_DEVICE_DAILY_LIMIT=unlimited

# Careful: 0 does NOT mean unlimited — it means NO free requests at all (which is
# a real setting: it makes the instance BYOK-only). If you want no cap, write the
# word `unlimited`. The hosted app uses 100 and 10 to bound its bill.

# How many web searches the model may run per tone (1–10). Raise it if tones for
# obscure material feel under-researched — it is the setting most likely to be
# starving the model. Each extra search adds roughly 1–2 cents (a $0.01 search fee,
# plus the tokens its results cost). In practice the model uses exactly one, even
# on obscure material, so this is a ceiling rather than a target.
TONEAI_WEB_SEARCH_MAX_USES=2
```

**On your own instance the quota is still active by default**, and it counts against
*your* key — so without the two `FREE_*` lines above you'd cap yourself at 10 tones
a day on your own hardware. Set them to `unlimited` and the limits disappear
entirely; the Usage panel will simply say so.

---

## Troubleshooting

> **If you tried BYOK before 2026-07-12 and got a blank response — that was our
> bug, not your key.** The app was throwing the error away and showing you nothing.
> It's fixed: you now get told what actually went wrong. Worth trying again.

These are the real failures, in the order people actually hit them.

**"There's no credit on that API key."**
By far the most common — nearly two thirds of all failed attempts. Your Anthropic
account has no credit on it. Go to **Settings → Billing** in the
[Console](https://console.anthropic.com) and add some; the minimum is $5.

**This catches people who already pay for Claude.** A **Claude Pro or Max
subscription is not API credit** — they are billed completely separately. Having Pro
does not give you API access, and it never will. You need credit on the account, and
it's cheap: $5 is around 140 tones.

**"That API key isn't valid."**
The key is mistyped, incomplete, or has been deleted in the Console. Keys start with
`sk-ant-` and are shown **only once**, when you create them. Check for a missing
character or a trailing space — or just create a new one, which costs nothing.

**"Anthropic is rate-limiting your account."**
Their limit on your key, not ours. New accounts start on a low tier and it rises
automatically as you use it. Wait a moment and try again.

**"Anthropic's servers are busy."**
Nothing wrong with your key or your request. Try again shortly.

**Tones got worse after I changed the model**
Go back to the default. Bigger isn't automatically better here — the task is
constrained (pick an amp and effects from a fixed list), and the smaller models are
good at it. If tones for obscure songs feel thin, raising the search budget
(`TONEAI_WEB_SEARCH_MAX_USES`, self-hosted only) helps more than raising the model.

**I want to stop paying immediately**
Click **Remove key → use free mode** in Settings. Then **delete the key** in the
Anthropic Console under **Settings → API keys** — deleting it is the only thing that
truly guarantees nothing can spend on it, wherever a copy might be.

---

## Questions

Open an issue at
**[github.com/cordfuse/toneai-katana-web/issues](https://github.com/cordfuse/toneai-katana-web/issues)**.
