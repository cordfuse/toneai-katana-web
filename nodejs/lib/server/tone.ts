// The tone-design product: server-side system prompt + the design_tone_patch
// tool. This is the part of the app the browser never sees — the prompt and
// the tone schema ARE the product (docs/settings.md § Inference is server-side).

import { tool, jsonSchema } from 'ai'
import type { KatanaDevice } from '@/lib/storage'
import { TONE_PATCH_SCHEMA } from '@/lib/patch/schema'
import {
  writePatchTsl, tslString, tslFilename,
  AMP_NAMES, OD_DS_NAMES, DELAY_NAMES, REVERB_NAMES,
  type TonePatch,
} from '@/lib/patch'

export interface ToneContext {
  device: KatanaDevice
  deviceLabel: string
  /** The player's rig, e.g. "Les Paul, bridge humbucker". Optional. */
  rig?: string
}

/**
 * The KATANA tone-designer system prompt. Fixed server-side — not client
 * overridable — because it plus the schema are the product.
 */
export function katanaSystemPrompt(ctx: ToneContext): string {
  return [
    `You are ToneAI Kat, a tone designer for the BOSS KATANA amplifier. The player asks for a sound — a song, an artist, or a description — and you dial in a patch for their amp.`,
    ``,
    `Target amp: ${ctx.deviceLabel}.`,
    ctx.rig ? `Their guitar: ${ctx.rig}. Voice the patch for that instrument.` : ``,
    ``,
    `When the player asks for a tone, you MUST call the design_tone_patch tool with a complete patch. Choose the amp voicing, gain staging, EQ, booster/overdrive, and time-based effects that best match the request. Only use amp and effect names from these lists:`,
    `- Amps: ${AMP_NAMES.join(', ')}.`,
    `- Overdrive/booster: ${OD_DS_NAMES.join(', ')}.`,
    `- Delay: ${DELAY_NAMES.join(', ')}.`,
    `- Reverb: ${REVERB_NAMES.join(', ')}.`,
    ``,
    `Knobs are 0–100. Keep the patch name under 16 characters. After the tool call, briefly (2–3 sentences) explain the choices in plain language — the amp and why, the drive, the key effects. Do not print the raw parameters; the app shows those. If the player is just chatting and not asking for a tone, answer normally without calling the tool.`,
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

/** The design_tone_patch tool. Its execute returns a confirmation to the model;
 *  the actual patch is captured from the tool-call chunk in the stream loop and
 *  turned into a tone_patch event (buildTonePatchEvent). */
export function buildToneTool() {
  return tool({
    description:
      'Emit a complete KATANA tone patch for the player. Call this whenever the ' +
      'player asks for a tone, sound, song, or artist. Names must come from the ' +
      'allowed amp/effect lists in the system prompt.',
    inputSchema: jsonSchema<Record<string, unknown>>(TONE_PATCH_SCHEMA as unknown as Record<string, unknown>),
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
export function buildTonePatchEvent(
  input: Record<string, unknown>,
  ctx: ToneContext,
): TonePatchEvent | null {
  const patch = toTonePatch(input)
  const song = typeof input.sourceSong === 'string' ? input.sourceSong : undefined
  const artist = typeof input.sourceArtist === 'string' ? input.sourceArtist : undefined
  try {
    const tsl = writePatchTsl(patch, ctx.device, { allowUnvalidated: true })
    return {
      type: 'tone_patch',
      patch, song, artist,
      device: ctx.device,
      deviceLabel: ctx.deviceLabel,
      tsl: tslString(tsl),
      filename: tslFilename(patch.name || 'patch'),
      experimental: true, // MkII is 'derived'; revisit when a generation is 'verified'
    }
  } catch {
    // No writer for this generation yet (unextracted). The model still explained
    // the tone in prose; we just can't offer a download.
    return null
  }
}
