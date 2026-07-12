// Per-device tone vocabulary — the amp/effect names a given KATANA generation
// exposes. This is what makes one tone-intent shape serve multiple devices: the
// model-facing schema and the system prompt are built from the TARGET device's
// vocabulary, so the model can only pick names that device actually has, and the
// matching writer resolves those names to bytes.
//
// Adding a device = add its writer + a vocab entry here. The convert feature
// (re-render a stored intent for another device) reads the same registry.

import type { KatanaDevice } from '@/lib/storage'
import { generationForDevice, type Generation } from './generations'
import { AMP_NAMES, OD_DS_NAMES, FX_NAMES, DELAY_NAMES, REVERB_NAMES } from './enums'
import {
  GEN3_AMP_TYPES, GEN3_BOOSTER_TYPES, GEN3_FX_TYPES, GEN3_DELAY_TYPES, GEN3_REVERB_TYPES,
} from './mk3/enums'
import {
  AIR_AMP_TYPES, AIR_BOOSTER_NAMES, AIR_FX_NAMES, AIR_DELAY_NAMES, AIR_REVERB_NAMES,
} from './air/enums'
import {
  GO_AMP_TYPES, GO_BOOSTER_TYPES, GO_FX_TYPES, GO_DELAY_TYPES, GO_REVERB_TYPES,
  GO_BASS_AMP_TYPES, GO_BASS_BOOSTER_TYPES, GO_BASS_FX_TYPES, GO_BASS_DELAY_TYPES, GO_BASS_REVERB_TYPES,
} from './go/enums'
import {
  BASS_AMP_TYPES, BASS_DRIVE_TYPES, BASS_FX_TYPES, BASS_DELAY_TYPES, BASS_REVERB_TYPES,
} from './bass/enums'

export interface DeviceVocab {
  amps: readonly string[]
  boosters: readonly string[]
  fx: readonly string[]
  delays: readonly string[]
  reverbs: readonly string[]
}

// MkI and MkII share the same amp/effect NAME set (lib/patch/enums.ts) — the
// original KATANA vocabulary. They differ in byte layout, not the words the
// model may choose, so both point at the same name lists.
const MK1_VOCAB: DeviceVocab = {
  amps: AMP_NAMES, boosters: OD_DS_NAMES, fx: FX_NAMES, delays: DELAY_NAMES, reverbs: REVERB_NAMES,
}
const MK2_VOCAB: DeviceVocab = {
  amps: AMP_NAMES, boosters: OD_DS_NAMES, fx: FX_NAMES, delays: DELAY_NAMES, reverbs: REVERB_NAMES,
}
const MK3_VOCAB: DeviceVocab = {
  amps: GEN3_AMP_TYPES, boosters: GEN3_BOOSTER_TYPES, fx: GEN3_FX_TYPES,
  delays: GEN3_DELAY_TYPES, reverbs: GEN3_REVERB_TYPES,
}
// Air's amp names are its 5 panel voices — the model picks one for the amp
// INSTRUCTIONS (not written to the .tsl; docs/air-format-notes.md).
const AIR_VOCAB: DeviceVocab = {
  amps: AIR_AMP_TYPES, boosters: AIR_BOOSTER_NAMES, fx: AIR_FX_NAMES,
  delays: AIR_DELAY_NAMES, reverbs: AIR_REVERB_NAMES,
}
// GO guitar mode — Gen 3-style, amp stored in-patch. 5-voice amp like Air.
const GO_VOCAB: DeviceVocab = {
  amps: GO_AMP_TYPES, boosters: GO_BOOSTER_TYPES, fx: GO_FX_TYPES,
  delays: GO_DELAY_TYPES, reverbs: GO_REVERB_TYPES,
}
// GO bass mode — same GO app, bass amp voices (VINTAGE/FLAT/MODERN) + bass drives/FX.
const GO_BASS_VOCAB: DeviceVocab = {
  amps: GO_BASS_AMP_TYPES, boosters: GO_BASS_BOOSTER_TYPES, fx: GO_BASS_FX_TYPES,
  delays: GO_BASS_DELAY_TYPES, reverbs: GO_BASS_REVERB_TYPES,
}
// KATANA BASS (desktop head/combo) — Knob-panel preamp voices (VINTAGE/MODERN),
// separate drive stage, bass mod/FX, and a combined delay+reverb Fx2 slot.
const BASS_VOCAB: DeviceVocab = {
  amps: BASS_AMP_TYPES, boosters: BASS_DRIVE_TYPES, fx: BASS_FX_TYPES,
  delays: BASS_DELAY_TYPES, reverbs: BASS_REVERB_TYPES,
}

// Generations with a writer + vocabulary. Others fall back to MkII's (they're
// gated from emitting anyway by the confidence guard in index.ts).
const BY_GENERATION: Partial<Record<Generation, DeviceVocab>> = {
  mk1: MK1_VOCAB,
  mk2: MK2_VOCAB,
  mk3: MK3_VOCAB,
  air: AIR_VOCAB,
  go: GO_VOCAB,
  gobass: GO_BASS_VOCAB,
  basshead: BASS_VOCAB,
}

export function vocabForGeneration(gen: Generation): DeviceVocab {
  return BY_GENERATION[gen] ?? MK2_VOCAB
}

export function vocabForDevice(device: KatanaDevice): DeviceVocab {
  return vocabForGeneration(generationForDevice(device))
}
