// JSON Schema for the design_tone_patch tool.
//
// This is the model-facing contract: the shape the model must fill to emit a
// tone. Enum fields are constrained to the verified KATANA vocabulary (enums.ts)
// so the model can only name amps/effects that exist — an invalid name is
// rejected at the tool boundary, not discovered when the writer chokes. Knobs
// are 0–100 (the amp's UI scale); the writer owns the byte mapping.
//
// Kept as a plain JSON Schema object (not zod — the repo drives AI SDK tools via
// jsonSchema()). Mirrors the TonePatch interface in intent.ts; keep them in sync.

import { AMP_NAMES, OD_DS_NAMES, FX_NAMES, DELAY_NAMES, REVERB_NAMES } from './enums'

const knob = { type: 'number', minimum: 0, maximum: 100 } as const

const ampChannel = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'gain', 'bass', 'middle', 'treble', 'presence', 'level'],
  properties: {
    type: { type: 'string', enum: [...AMP_NAMES], description: 'Amp model.' },
    gain: knob, bass: knob, middle: knob, treble: knob, presence: knob, level: knob,
  },
} as const

export const TONE_PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'ampA', 'booster', 'delay', 'reverb'],
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
        type: { type: 'string', enum: [...OD_DS_NAMES], description: 'Overdrive/distortion/booster voicing.' },
        drive: knob, tone: knob, level: knob,
      },
    },

    fx1: {
      type: 'object',
      additionalProperties: false,
      required: ['on', 'type'],
      properties: {
        on: { type: 'boolean' },
        type: { type: 'string', enum: [...FX_NAMES], description: 'Modulation/FX block 1.' },
      },
    },
    fx2: {
      type: 'object',
      additionalProperties: false,
      required: ['on', 'type'],
      properties: {
        on: { type: 'boolean' },
        type: { type: 'string', enum: [...FX_NAMES], description: 'Modulation/FX block 2.' },
      },
    },

    delay: {
      type: 'object',
      additionalProperties: false,
      required: ['on', 'type', 'timeMs', 'feedback', 'level'],
      properties: {
        on: { type: 'boolean' },
        type: { type: 'string', enum: [...DELAY_NAMES] },
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
        type: { type: 'string', enum: [...REVERB_NAMES] },
        timeS: { type: 'number', minimum: 0.1, maximum: 20, description: 'Reverb time in seconds.' },
        level: knob,
      },
    },
  },
} as const
