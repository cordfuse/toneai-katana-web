# Bring Your Own Key

**ToneAI Kat is free to use, but the free tier is small.** It has to be — every tone
costs real money to generate, and one person paying the bill can only give away so
much.

If you've hit the limit, or you want better tones than the free tier's model can
produce, you can plug in your own Anthropic API key. It takes about five minutes,
and you'll typically spend **a few cents a day** unless you're generating tones
constantly.

This guide covers the whole thing: signing up, creating a key, what it costs,
choosing a model, and how to stop paying if you change your mind.

---

## Why the free tier is limited

Generating a tone isn't a lookup. The app searches the web for how a given
guitar sound was actually made, reads what it finds, and then chooses amp, gain,
EQ and effects against the KATANA's real parameter set. That research is what
makes the tones good, and it's also what makes them cost money — every request
pays for the search and for the model's reading of the results.

Measured, a tone costs roughly **3 cents**. The free tier is capped at:

| Limit | Value |
|---|---|
| Per device, per day | **5 tones** |
| Shared pool, per day (everyone) | **50 tones** |

Both reset at midnight UTC. The shared pool is the important one: if the day's 50
tones are gone, they're gone for everybody, even if you personally have some left.
You can see both numbers live in the app under **⋮ → Usage**.

With your own key, **neither limit applies to you.** Your requests don't touch
either counter.

---

## What it costs

You pay Anthropic directly, per request, for exactly what you use. There's no
subscription and no minimum.

At the app's default model (Haiku 4.5), a tone costs about **3 cents**. Some real
measured examples:

| What you asked for | Cost |
|---|---|
| A tone that needed web research ("Rebel Rebel") | ~$0.03 |
| A tone from a vague description ("warm but broken, like a radio in another room") | ~$0.005 |
| A plain question ("what does the presence knob do?") | ~$0.002 |

So **$5 of credit is somewhere around 150 researched tones.** If you're an
occasional user, a single $5 top-up may last you months.

The cost scales with the model you pick — see [Choosing a model](#choosing-a-model)
below. Opus is roughly 10x Haiku per tone.

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
| **Claude Haiku 4.5** *(default)* | ~$0.03 | Cheapest. What the free tier runs. Good tones for well-documented songs. |
| **Claude Sonnet 5** | ~$0.07 | Better reasoning about obscure or ambiguous sounds. |
| **Claude Sonnet 4.6** | ~$0.09 | Similar to Sonnet 5; slightly different flavour. |
| **Claude Opus 4.8** | ~$0.30 | The strongest reasoning available. Overkill for most tones — but if a sound is genuinely hard to pin down, this is the one that will reason its way there. |

**Start with the default.** Haiku was chosen after an A/B against Sonnet on the same
prompts, and it picked comparable amps and settings for about a third of the cost.
The bigger models earn their money on hard, vague, or obscure requests — not on
"Highway to Hell".

Tap a selected model again to go back to the default.

---

## Running your own instance

If you'd rather not hand your key to a website at all, run the app yourself. It's
open source: **[github.com/cordfuse/toneai-katana-web](https://github.com/cordfuse/toneai-katana-web)**

Then the key lives in your own environment file and never leaves your machine:

```bash
git clone https://github.com/cordfuse/toneai-katana-web.git
cd toneai-katana-web/nodejs
cp .env.example .env.local
```

Edit `.env.local`:

```bash
# Your key — the server uses this for every request.
ANTHROPIC_API_KEY=sk-ant-...

# The model the server uses. Optional; defaults to claude-haiku-4-5.
# Must be one of the ids in config/providers.yaml.
TONEAI_MODEL=claude-sonnet-4-6

# Free-tier limits. On your own instance you're the only user, so you'll
# probably want these high — or just leave them, since a key you supply
# yourself is the server's key, and the quota applies to it.
FREE_DAILY_LIMIT=1000
FREE_DEVICE_DAILY_LIMIT=1000

# How many web searches the model may run per tone. Raise it if you find
# tones for obscure material are under-researched.
TONEAI_WEB_SEARCH_MAX_USES=2
```

Then:

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`. There's a Docker setup in `docker/` too.

---

## Troubleshooting

**"Invalid API key" / 401**
The key is wrong, was mistyped, or has been deleted in the Console. Keys start with
`sk-ant-`. Make sure you copied the whole thing and didn't pick up a trailing space.

**"Insufficient credit" / 400**
Your Anthropic account has no credit. Go to **Settings → Billing** in the Console
and top up. This is the most common problem, and it catches people who already pay
for Claude Pro — a Pro subscription is not API credit.

**"Rate limit exceeded" / 429 with your own key**
This is Anthropic rate-limiting your account, not the app's quota. New accounts
start on a low tier and it rises automatically as you spend. Wait a moment and
retry.

**Tones got worse after I changed the model**
Go back to the default. Bigger isn't automatically better here — the task is
constrained (pick amp and effects from a fixed list), and the smaller models are
good at it. If tones for obscure songs feel thin, raising the search budget helps
more than raising the model.

**I want to stop paying immediately**
Click **Remove key → use free mode** in Settings, then delete the key in the
Anthropic Console under **Settings → API keys**. Deleting the key is what actually
guarantees nothing can spend on it.

---

## Questions

Open an issue at
**[github.com/cordfuse/toneai-katana-web/issues](https://github.com/cordfuse/toneai-katana-web/issues)**.
