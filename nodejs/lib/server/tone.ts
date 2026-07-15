// The tone-design product: server-side system prompt + the design_tone_patch
// tool. This is the part of the app the browser never sees — the prompt and
// the tone schema ARE the product (docs/settings.md § Inference is server-side).

import { tool, jsonSchema } from 'ai'
import { type KatanaDevice, type PlayedInstrument, instrumentForDevice } from '@/lib/storage'
import type { PickupNoise } from '@/lib/gear'
import { buildToneSchema } from '@/lib/patch/schema'
import { vocabForDevice } from '@/lib/patch/vocab'
import { describedList } from '@/lib/patch/descriptions'
import {
  writePatchTsl, tslString, tslFilename, profileForDevice,
  calibrateGateForPickup, defaultNoiseSuppressor,
  type TonePatch,
} from '@/lib/patch'

export interface ToneContext {
  device: KatanaDevice
  deviceLabel: string
  /** The player's rig, e.g. "Les Paul, bridge humbucker". Optional. */
  rig?: string
  /** The instrument the player is actually holding (their active gear's kind).
   *  Drives VOICING independently of the amp: a bass through a guitar KATANA is
   *  voiced for bass. Absent → falls back to the amp's own class. */
  instrument?: PlayedInstrument
  /** How much the player's ACTIVE pickup hums. Decides the noise gate, in code —
   *  see calibrateGateForPickup. Absent → treated as humbucking (no correction),
   *  because inventing a single coil the player doesn't have would over-gate them. */
  pickupNoise?: PickupNoise
}

/**
 * The KATANA tone-designer system prompt. Fixed server-side — not client
 * overridable — because it plus the schema are the product.
 */
export function katanaSystemPrompt(ctx: ToneContext): string {
  const vocab = vocabForDevice(ctx.device)
  // Two independent axes. The DEVICE fixes the format facts below (what the amp
  // can load). The played INSTRUMENT drives voicing — a bass through a guitar amp
  // is voiced for bass. With no gear, voicing falls back to the amp's own class.
  const ampClass = instrumentForDevice(ctx.device)
  const played: PlayedInstrument = ctx.instrument ?? ampClass
  const crossUse = ctx.instrument !== undefined && ctx.instrument !== ampClass
  return [
    `You are ToneAI Kat, a tone designer for the BOSS KATANA amplifier. The player asks for a sound — a song, an artist, or a description — and you dial in a patch for their amp.`,
    ``,
    `Target amp: ${ctx.deviceLabel}.`,
    // ── Device format facts (what the amp file can hold) ──
    ctx.device === 'katana-air' || ctx.device === 'waza-air' || ctx.device === 'waza-air-bass'
      ? `NOTE: the ${ctx.deviceLabel} patch file stores ONLY the effects chain — the amp voicing (AMP TYPE + gain/EQ) is a global front-panel setting, not saved per patch. Still choose the best amp voice and realistic knob values; the app delivers them to the player as hand-dial instructions alongside the file. Pick the amp voice from the list below.`
      : ``,
    ctx.device === 'katana-bass'
      ? `NOTE: this amp has ONE combined time slot — it can run a delay OR a reverb, not both at once. Choose the one the sound depends on (a slapback/echo part → delay; an ambient wash → reverb).`
      : ``,
    // ── Voicing (driven by the instrument in the player's hands) ──
    played === 'bass'
      ? `The player is playing a BASS guitar. Voice everything for bass: tight, controlled lows, defined low-mids, grit kept in check — do NOT voice it like a six-string electric.`
      : `The player is playing an electric guitar. Voice for electric guitar.`,
    crossUse && played === 'bass'
      ? `This is a bass run through a GUITAR amp: keep gain conservative (guitar amps get flubby on low notes), push the lows and low-mids, and roll off excess high end so it doesn't get clanky.`
      : ``,
    ctx.rig
      ? `Their ${played === 'bass' ? 'bass' : 'guitar'}: ${ctx.rig}. Voice the patch for that instrument.`
      : ``,
    // The pickup drives the GATE, not just the tone. This had to be said outright:
    // given a P-90 in the neck and a humbucker in the bridge, the model dialled the
    // identical noise suppressor for both, because nothing ever told it that the
    // pickup changes how much noise there is to suppress. It adjusted EQ and gain
    // and left the gate alone.
    ctx.rig
      ? `The PICKUP decides how much noise there is to gate, not only the tone. A single coil — Strat/Tele single-coil, P-90, lipstick, foil — hums and buzzes far more than a humbucker, and it gets worse the more gain is in front of it. For the same gain, give a single coil a noticeably higher noise-suppressor threshold than a humbucker (roughly 8-12 more), and never leave a hot single coil ungated on a high-gain patch. A humbucker can sit lower, and on a quiet clean it usually needs no gate at all.`
      : ``,
    ``,
    // The search rule is UNCONDITIONAL for named material on purpose. It used to
    // say "when you are not certain of the real rig" — a condition the model
    // judges about itself, and small models are poorly calibrated there: Haiku
    // confidently designs from thin internal knowledge instead of searching.
    // Sonnet can be trusted to skip a search it doesn't need; Haiku can't.
    `When a request names a song, artist, or specific recorded tone, ALWAYS use the web_search tool FIRST — before designing anything — to ground your choices in the player's actual rig: their amp, pedals, and known settings. Search like: "<artist> <song> guitar rig amp pedals settings". Do this even when you think you already know the tone. Only a plain description with no named source ("warm clean", "tight metal") needs no search.`,
    ``,
    `When the player asks for a tone, you MUST call the design_tone_patch tool with a complete patch. Choose the amp voicing, gain staging, EQ, booster/overdrive, modulation, and time-based effects that best match the request. Only use amp and effect names from these lists (each entry is "Name — what it is and when to reach for it"):`,
    `- Amps: ${describedList(vocab.amps, 'amp')}.`,
    `- Overdrive/booster: ${describedList(vocab.boosters, 'booster')}.`,
    `- Mod / FX (two slots, fx1 and fx2): ${describedList(vocab.fx, 'fx')}.`,
    `- Delay: ${describedList(vocab.delays, 'delay')}.`,
    `- Reverb: ${describedList(vocab.reverbs, 'reverb')}.`,
    ``,
    `Choose the booster/overdrive deliberately, matched to how the reference tone is actually made — do NOT reach for the same one every time. Most amp-driven rock and metal gets its gain from the AMP, not a booster: for those, either leave the booster OFF, or use only a tight mid-focused push (a Tube Screamer / T-Scream or Blues Drive at low drive) in front of a lead for sustain and cut — piling a heavy overdrive onto an already-gained amp makes it flubby, not heavier. The transparent boosts (Centa OD, Clean Boost, Treble Boost) are for their real jobs — pushing a cranked amp a little harder, brightening a dark tone, a clean solo lift — NOT as a general-purpose overdrive and not a safe default, so do not put Centa OD on everything. The distortion/fuzz voices (Rat, DST+, Metal Zone, Muff Fuzz, HM-2, '60s Fuzz) belong on tones actually built on that pedal, usually with the amp kept cleaner. If the amp voice already delivers the gain and character, turn the booster off — an unnecessary booster pulls the tone away from the reference.`,
    ``,
    `The KATANA has two mod/FX slots (fx1, fx2). Reach for them whenever the sound genuinely calls for movement or shaping — chorus for shimmer and 80s cleans, phaser or flanger for sweep, tremolo for surf and vintage pulse, a compressor for tight funk or country picking, an EQ or wah where it belongs. Don't force effects onto a dry, direct tone, but don't leave the slots empty out of habit either: if the reference tone has modulation, use it.`,
    `When you turn a mod/FX slot on, also dial its knobs — for modulation (Chorus, Phaser, Flanger, Tremolo, Vibrato) set rate, depth and level (and reso for Phaser/Flanger); for Comp set sustain, attack, tone and level. Match them to the part: a subtle chorus is low rate and depth, a lush 80s wash is higher; a fast surf tremolo is high rate. Values you skip get a neutral default, so at least set rate/depth/level whenever you enable a modulation effect.`,
    ``,
    `Set the noise suppressor deliberately on EVERY patch — it is part of the tone, not an afterthought. Any patch with real dirt (crunch, lead, high gain, or a booster pushing a gained amp) needs the gate ON, or it hisses and squeals as soon as the player touches the strings and the tone is unusable. Cleans and low-gain tones want it OFF, so note tails can bloom. Scale the threshold with the gain in front of it, and when in doubt set it lower — a slightly open gate leaves a little hiss, a gate set too high chops off quiet notes.`,
    ``,
    `Knobs are 0–100. Keep the patch name under 16 characters.`,
    ``,
    // Few-shot decision examples. Small models follow worked examples far more
    // reliably than rules alone — these three teach the design idioms the rules
    // above describe (amp-driven gain, effect-defined tone, boosted lead), using
    // MkII names as illustration. They sit in the cached prefix; recurring cost
    // is cache-read pennies.
    `Examples of good design reasoning (illustrative — always use names from the lists above for the target amp):`,
    `- "Back in Black rhythm" → a cranked Marshall Plexi tone: amp MS1959 I+II (or the closest crunch voice), gain ~55, booster OFF (the amp IS the drive), no modulation, reverb Room low, gate on ~20.`,
    `- "Come As You Are" → the riff is defined by its chorus pedal: amp Clean Twin (or the cleanest voice), low gain, fx1 Chorus with rate ~30 / depth ~70 / level ~60, booster off, reverb Room low, gate off.`,
    `- "Master of Puppets rhythm" → tight scooped thrash: amp R-Fire Modern (or the tightest high-gain voice), gain ~70, middle ~35, booster T-Scream at low drive / high level to tighten the low end, gate on ~40.`,
    // The write-up is ~20% of a request's output tokens, and it was running long:
    // the model reliably produced 5+ sentences and volunteered a "Tips:" section
    // when the old wording merely asked for "2-3 sentences". Soft limits at the
    // end of a long prompt get ignored, so name the specific habits to drop.
    `Say NOTHING before the tool call — no "let me look that up", no "I have a good picture of the rig now", no narrating what you are about to do. Search (if needed), call the tool, and let your first words to the player be the explanation itself.`,
    `After the tool call, explain the patch in AT MOST 3 short sentences of plain prose: the amp and why, the drive, the key effects. Nothing else — no headings, no bullet lists, no "Tips" section, no playing advice, no restating the request back. Do not print the raw parameters; the app already shows them.`,
    `If the player is just chatting and not asking for a tone, answer normally without calling the tool.`,
  ].filter(Boolean).join('\n')
}

/**
 * Coerce the model's tool input (validated against TONE_PATCH_SCHEMA) into a
 * TonePatch. The schema already constrains names + ranges; this fills the
 * optional blocks the writer expects and caps the name.
 */
export function toTonePatch(input: Record<string, unknown>): TonePatch {
  return input as unknown as TonePatch
}

/** The design_tone_patch tool, built for the target device's vocabulary. Its
 *  execute returns a confirmation to the model; the actual patch is captured from
 *  the tool-call chunk in the stream loop and turned into a tone_patch event
 *  (buildTonePatchEvent). */
export function buildToneTool(device: KatanaDevice) {
  const schema = buildToneSchema(vocabForDevice(device))
  return tool({
    description:
      'Emit a complete KATANA tone patch for the player. Call this whenever the ' +
      'player asks for a tone, sound, song, or artist. Names must come from the ' +
      'allowed amp/effect lists in the system prompt.',
    inputSchema: jsonSchema<Record<string, unknown>>(schema),
    execute: async () => 'Patch created and shown to the player.',
  })
}

export const TONE_TOOL_NAME = 'design_tone_patch'

export interface TonePatchEvent {
  type: 'tone_patch'
  patch: TonePatch
  song?: string
  artist?: string
  device: KatanaDevice
  deviceLabel: string
  /** The player's rig at generation time, e.g. "Les Paul, bridge humbucker". */
  rig?: string
  /** The .tsl liveset, ready to download. */
  tsl: string
  filename: string
  /** True when the layout is derived/unvalidated (MkII today) — the card warns. */
  experimental: boolean
}

/**
 * Build the client event from the model's tool input. Writes the .tsl for the
 * target device. Returns null if the device has no writer yet (e.g. MkI/MkIII/
 * GO) — the caller drops it rather than emitting a broken card.
 */
/**
 * Apply the pickup correction to the gate the model chose, BEFORE the writer sees it.
 *
 * The prompt asks for this and the model does not reliably do it — measured, it gave
 * a P-90 two more threshold than a humbucker where the rule says 8-12. So the rule is
 * enforced here instead. The model's gate is an opinion; this is the guarantee.
 *
 * Also runs the derived gate through the same correction, so a patch where the model
 * omitted the gate entirely still gets calibrated for the pickup rather than for an
 * imaginary humbucker.
 */
function gateCalibrated(patch: TonePatch, ctx: ToneContext): TonePatch {
  const noise = ctx.pickupNoise ?? 'humbucking'
  const ns = patch.noiseSuppressor ?? defaultNoiseSuppressor(patch)
  return { ...patch, noiseSuppressor: calibrateGateForPickup(ns, noise) }
}

export function buildTonePatchEvent(
  input: Record<string, unknown>,
  ctx: ToneContext,
): TonePatchEvent | null {
  // GUARD: a valid patch MUST carry an amp channel. On an edit/redesign turn a
  // smaller model sometimes sends only the change and omits ampA — and the whole
  // pipeline assumes it's there (defaultNoiseSuppressor reads p.ampA.gain), so a
  // partial patch used to throw and take down the entire turn. Drop the malformed
  // card instead: the model's prose still reaches the player, and no crash.
  const ampA = input.ampA as { gain?: unknown } | undefined
  if (!ampA || typeof ampA !== 'object' || typeof ampA.gain !== 'number') {
    console.warn('[tone] dropped a partial patch with no valid ampA (model sent only a diff)')
    return null
  }
  const patch = gateCalibrated(toTonePatch(input), ctx)
  const song = typeof input.sourceSong === 'string' ? input.sourceSong : undefined
  const artist = typeof input.sourceArtist === 'string' ? input.sourceArtist : undefined
  // A layout that isn't round-trip verified still writes (allowUnvalidated), but
  // the card flags it. MkII is now 'verified', so this is false for the KATANA.
  const experimental = profileForDevice(ctx.device).confidence !== 'verified'
  try {
    const tsl = writePatchTsl(patch, ctx.device, { allowUnvalidated: true })
    return {
      type: 'tone_patch',
      patch, song, artist,
      device: ctx.device,
      deviceLabel: ctx.deviceLabel,
      rig: ctx.rig,
      tsl: tslString(tsl),
      filename: tslFilename(patch.name || 'patch'),
      experimental,
    }
  } catch {
    // No writer for this generation yet (unextracted). The model still explained
    // the tone in prose; we just can't offer a download.
    return null
  }
}
