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

export interface DeviceVocab {
  amps: readonly string[]
  boosters: readonly string[]
  fx: readonly string[]
  delays: readonly string[]
  reverbs: readonly string[]
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

// Generations with a writer + vocabulary. Others fall back to MkII's (they're
// gated from emitting anyway by the confidence guard in index.ts).
const BY_GENERATION: Partial<Record<Generation, DeviceVocab>> = {
  mk2: MK2_VOCAB,
  mk3: MK3_VOCAB,
  air: AIR_VOCAB,
}

export function vocabForGeneration(gen: Generation): DeviceVocab {
  return BY_GENERATION[gen] ?? MK2_VOCAB
}

export function vocabForDevice(device: KatanaDevice): DeviceVocab {
  return vocabForGeneration(generationForDevice(device))
}
