// JSON Schema for the design_tone_patch tool.
//
// This is the model-facing contract: the shape the model must fill to emit a
// tone. Enum fields are constrained to the TARGET device's vocabulary (vocab.ts)
// so the model can only name amps/effects that device actually has — an invalid
// name is rejected at the tool boundary, not discovered when the writer chokes.
// Knobs are 0–100 (the amp's UI scale); the writer owns the byte mapping.
//
// The schema is built per-request from the device's vocab (buildToneSchema), so
// a Gen 3 request offers Gen 3 amps and an MkII request offers MkII amps. The
// SHAPE is shared across generations — only the enum name lists differ.
//
// Kept as a plain JSON Schema object (not zod — the repo drives AI SDK tools via
// jsonSchema()). Mirrors the TonePatch interface in intent.ts; keep them in sync.

import { AMP_NAMES, OD_DS_NAMES, FX_NAMES, DELAY_NAMES, REVERB_NAMES } from './enums'
import type { DeviceVocab } from './vocab'

const knob = { type: 'number', minimum: 0, maximum: 100 } as const

/**
 * Build the tone-patch JSON Schema for a device's vocabulary. The enum lists for
 * amp / booster / FX / delay / reverb come from `vocab`; everything else (shape,
 * ranges, required fields) is device-agnostic.
 */
export function buildToneSchema(vocab: DeviceVocab): Record<string, unknown> {
  const ampChannel = {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'gain', 'bass', 'middle', 'treble', 'presence', 'level'],
    properties: {
      type: { type: 'string', enum: [...vocab.amps], description: 'Amp model — pick from the described list in the system prompt.' },
      gain: { ...knob, description: 'Preamp drive, as you would set it on the REAL amp being referenced: ~20-35 clean, ~40-55 crunch/breakup, ~60-75 high gain, 80+ extreme saturation only. The writer maps this onto the KATANA sim\'s usable range automatically — the sims saturate earlier than the amps they model, so do not pre-compensate.' },
      bass: { ...knob, description: 'Low end. High values get boomy on gained tones.' },
      middle: { ...knob, description: 'Midrange — where a guitar cuts through. Scoop (~30) for modern metal only; most tones want 45-65.' },
      treble: { ...knob, description: 'High end and pick attack.' },
      presence: { ...knob, description: 'Upper-treble edge above treble. High values get harsh, especially on bright amps and single coils.' },
      level: { ...knob, description: 'Channel volume — loudness only, never adds dirt. Usually 55-70.' },
    },
  }

  // A mod/FX slot. Only `on` + `type` are required; the knobs are optional and
  // which ones matter depends on the effect. Set the ones that apply — the writer
  // stamps a musical default for any you omit. Modulation (Chorus, Phaser,
  // Flanger, Tremolo, Vibrato): rate, depth, level (+ reso for Phaser/Flanger).
  // Comp: sustain, attack, tone, level. Other effect types ignore the knobs.
  const modFx = {
    type: 'object',
    additionalProperties: false,
    required: ['on', 'type'],
    properties: {
      on: { type: 'boolean' },
      type: { type: 'string', enum: [...vocab.fx] },
      rate: { ...knob, description: 'Modulation speed (Chorus/Phaser/Flanger/Tremolo/Vibrato).' },
      depth: { ...knob, description: 'Modulation depth.' },
      level: { ...knob, description: 'Effect output level.' },
      reso: { ...knob, description: 'Resonance/feedback (Phaser, Flanger).' },
      sustain: { ...knob, description: 'Compressor sustain.' },
      attack: { ...knob, description: 'Compressor attack.' },
      tone: { ...knob, description: 'Compressor tone.' },
    },
  }

  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'ampA', 'booster', 'delay', 'reverb', 'noiseSuppressor'],
    properties: {
      name: {
        type: 'string',
        description: 'Patch name, max 16 characters (hard limit — it is truncated).',
      },
      // Optional provenance so the tone card can show what was targeted.
      sourceSong: { type: 'string', description: 'The song this tone is for, if any.' },
      sourceArtist: { type: 'string', description: 'The artist, if any.' },

      ampA: { ...ampChannel, description: 'The primary amp channel.' },

      booster: {
        type: 'object',
        additionalProperties: false,
        required: ['on', 'type', 'drive', 'tone', 'level'],
        properties: {
          on: { type: 'boolean' },
          type: { type: 'string', enum: [...vocab.boosters], description: 'Overdrive/distortion/booster voicing — pick from the described list in the system prompt.' },
          drive: { ...knob, description: 'How much dirt the pedal itself adds. Keep low (~20-35) when tightening an already-gained amp.' },
          tone: { ...knob, description: 'Pedal brightness.' },
          level: { ...knob, description: 'Pedal output into the amp — how hard it pushes the front end.' },
        },
      },

      fx1: { ...modFx, description: 'Modulation/FX block 1.' },
      fx2: { ...modFx, description: 'Modulation/FX block 2.' },

      delay: {
        type: 'object',
        additionalProperties: false,
        required: ['on', 'type', 'timeMs', 'feedback', 'level'],
        properties: {
          on: { type: 'boolean' },
          type: { type: 'string', enum: [...vocab.delays] },
          timeMs: { type: 'number', minimum: 1, maximum: 2000, description: 'Delay time in milliseconds.' },
          feedback: knob, level: knob,
        },
      },

      reverb: {
        type: 'object',
        additionalProperties: false,
        required: ['on', 'type', 'timeS', 'level'],
        properties: {
          on: { type: 'boolean' },
          type: { type: 'string', enum: [...vocab.reverbs] },
          timeS: { type: 'number', minimum: 0.1, maximum: 20, description: 'Reverb time in seconds.' },
          level: knob,
        },
      },

      // REQUIRED on purpose. This was optional-by-omission for the app's whole life —
      // the writer never wrote it, so every patch shipped with the gate the template's
      // donor happened to have (off), and high-gain tones squealed on the real amp.
      // Making the model state it means a gate is now a tone DECISION, like gain.
      noiseSuppressor: {
        type: 'object',
        additionalProperties: false,
        required: ['on', 'threshold', 'release'],
        description:
          'The noise gate. Turn it ON for anything with real dirt — crunch, lead, ' +
          'metal, or any patch with a booster pushing an already-gained amp. Without ' +
          'it a high-gain patch hisses and squeals the moment the player touches the ' +
          'strings, and is unusable. Leave it OFF for cleans and low-gain tones, where ' +
          'it would choke the note tails. Threshold scales with how much gain is in ' +
          'front of it: ~15-25 at the edge of breakup, ~35-45 for high gain, ~50+ only ' +
          'for extreme saturation. Too high chops quiet notes; when unsure, go lower.',
        properties: {
          on: { type: 'boolean' },
          threshold: knob,
          release: knob,
        },
      },

      patchLevel: {
        ...knob,
        description:
          'Patch output level, 0-100. Default 100. Lower it only if this tone would ' +
          'otherwise be much louder than a normal patch (e.g. heavy compression plus a ' +
          'hot booster). Do not use it as a substitute for the amp level.',
      },
    },
  }
}

/** Default (MkII) schema, kept for callers that don't yet thread a device. */
export const TONE_PATCH_SCHEMA = buildToneSchema({
  amps: AMP_NAMES, boosters: OD_DS_NAMES, fx: FX_NAMES, delays: DELAY_NAMES, reverbs: REVERB_NAMES,
})
