// WAZA-AIR + WAZA-AIR BASS writers.
//
// Both are the flat "Air" family (2335-byte User%Patch, formatRev "0000") and
// share KATANA:AIR's patch offsets exactly (the WAZA apps differ only in
// system/control params and the amp/effect VOICES — verified from the app models
// + a real bank each). So they're just two more AirModel configs on the
// config-driven builder in writers/air.ts.
//
// As with KATANA:AIR, an Air patch stores ONLY the effects chain — the amp is
// global panel state, delivered as hand-dial INSTRUCTIONS (wazaAmpSettings /
// wazaBassAmpSettings), never written to the file. See docs/waza-air-format-notes.md.

import type { TonePatch } from '../intent'
import {
  type AirModel, buildAirImage, writeAirFamilyTsl, type AirAmpSettings,
} from './air'
import { AIR_BOOSTER_BY_NAME, AIR_FX_BY_NAME, AIR_DELAY_BY_NAME, AIR_REVERB_BY_NAME } from '../air/enums'
import { templateSections as wazaTemplate } from '../waza/template'
import { templateSections as wazaBassTemplate } from '../waza-bass/template'
import { WAZA_AMP_TYPES } from '../waza/enums'
import {
  WAZA_BASS_AMP_TYPES, WAZA_BASS_BOOSTER_BY_NAME, WAZA_BASS_FX_BY_NAME,
} from '../waza-bass/enums'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : Math.round(v))
const knob = (v: number) => clamp(v, 0, 100)

// ── WAZA-AIR (guitar) ─────────────────────────────────────────────────────────
// Booster/FX/delay/reverb voices are KATANA:AIR's; only the template + device
// string + amp voices differ.
export const WAZA_AIR_MODEL: AirModel = {
  meta: { formatRev: '0000', device: 'WAZA-AIR', keyPrefix: 'User%' },
  template: wazaTemplate,
  boosters: AIR_BOOSTER_BY_NAME,
  fx: AIR_FX_BY_NAME,
  delays: AIR_DELAY_BY_NAME,
  reverbs: AIR_REVERB_BY_NAME,
}

// ── WAZA-AIR BASS ─────────────────────────────────────────────────────────────
// Bass-specific amp/booster/FX; delay + reverb reuse the shared Air voices.
export const WAZA_AIR_BASS_MODEL: AirModel = {
  meta: { formatRev: '0000', device: 'WAZA-AIR BASS', keyPrefix: 'User%' },
  template: wazaBassTemplate,
  boosters: WAZA_BASS_BOOSTER_BY_NAME,
  fx: WAZA_BASS_FX_BY_NAME,
  delays: AIR_DELAY_BY_NAME,
  reverbs: AIR_REVERB_BY_NAME,
}

export const buildWazaAirSections = (patch: TonePatch) => buildAirImage(patch, WAZA_AIR_MODEL)
export const buildWazaAirBassSections = (patch: TonePatch) => buildAirImage(patch, WAZA_AIR_BASS_MODEL)

export const writeWazaAirTsl = (patch: TonePatch): object => writeAirFamilyTsl(patch, WAZA_AIR_MODEL)
export const writeWazaAirBassTsl = (patch: TonePatch): object => writeAirFamilyTsl(patch, WAZA_AIR_BASS_MODEL)

/** Map the intent's amp to a WAZA amp panel voice + knob values, for the hand-dial
 *  INSTRUCTIONS shown on the tone card (not part of the .tsl). Falls back to the
 *  first voice when the AI picked a name outside the panel set. */
function ampSettings(patch: TonePatch, voices: readonly string[]): AirAmpSettings {
  const t = patch.ampA.type.toUpperCase()
  const type = voices.includes(t) ? t : voices[0]
  return {
    type,
    gain: knob(patch.ampA.gain),
    volume: knob(patch.ampA.level),
    bass: knob(patch.ampA.bass),
    middle: knob(patch.ampA.middle),
    treble: knob(patch.ampA.treble),
    presence: knob(patch.ampA.presence),
  }
}

export const wazaAmpSettings = (patch: TonePatch): AirAmpSettings => ampSettings(patch, WAZA_AMP_TYPES)
export const wazaBassAmpSettings = (patch: TonePatch): AirAmpSettings => ampSettings(patch, WAZA_BASS_AMP_TYPES)
