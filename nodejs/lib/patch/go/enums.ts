// KATANA:GO (guitar mode) enum orderings — extracted from the GO editor app's
// resource table (config/resource.js) and CROSS-VERIFIED against the app's own
// Gen 3 → GO librarian conversion map (businesslogic/librarian/ktn_gen3_model.js
// `ampType`/`boosterType`/`fxType`): inverting that map — whose comments are the
// known Gen 3 names and whose values are GO indices — reproduces these exact
// orderings, so the byte values are proven, not guessed.
//
// GO is DUAL-MODE (guitar / bass share one .tsl layout, distinguished by the
// device string suffix — guitar = "KATANA:GO_guitarmode"). These lists are the
// GUITAR-mode vocabulary; bass mode is a separate branch.

/** Amp characters (PATCH_AMP_TYPE, 0–4). Same 5-voice model as KATANA:AIR. */
export const GO_AMP_TYPES = ['ACOUSTIC', 'CLEAN', 'CRUNCH', 'LEAD', 'BROWN'] as const

/** Booster / OD / DS (PATCH_BOOSTER_TYPE). Guitar mode uses indices 0–22; the
 *  byte field runs to 35 but 23+ are bass drives / duplicates, excluded here. */
export const GO_BOOSTER_TYPES = [
  'CLEAN BOOST', 'TREBLE BOOST', 'MID BOOST', 'CRUNCH OD', 'BLUES DRIVE', 'OVERDRIVE',
  'NATURAL OD', 'WARM OD', 'TURBO OD', 'T-SCREAM', 'DISTORTION', 'FAT DS', 'DST+',
  'GUV DS', 'RAT', 'METAL ZONE', 'METAL DS', "'60s FUZZ", 'MUFF FUZZ', 'OCT FUZZ',
  'HM-2', 'METAL CORE', 'CENTA OD',
] as const

/** Mod / FX (PATCH_FX_TYPE, one type per FX slot). Guitar mode: 0–27. */
export const GO_FX_TYPES = [
  'CHORUS', 'FLANGER', 'PHASER', 'UNI-V', 'TREMOLO', 'VIBRATO', 'ROTARY', 'RING MOD',
  'SLOW GEAR', 'SLICER', 'COMP', 'LIMITER', 'T.WAH', 'AUTO WAH', 'GRAPHIC EQ',
  'PARAMETRIC EQ', 'GUITAR SIM', 'AC.GUITAR SIM', 'AC PROCESSOR', 'WAVE SYNTH',
  'OCTAVE', 'HEAVY OCTAVE', 'PITCH SHIFTER', 'HARMONIST', 'HUMANIZER',
  'PHASE 90E', 'FLANGER 117E', 'DC-30',
] as const

/** Delay (PATCH_DELAY_TYPE, 0–7). */
export const GO_DELAY_TYPES = [
  'DIGITAL', 'PAN', 'STEREO', 'ANALOG', 'TAPE ECHO', 'REVERSE', 'MODULATE', 'SDE-3000',
] as const

/** Reverb (PATCH_REVERB_TYPE, 0–4). Note GO's order (PLATE first) differs from
 *  Gen 3 and Air — verified against resource.js. */
export const GO_REVERB_TYPES = ['PLATE', 'ROOM', 'HALL', 'SPRING', 'MODULATE'] as const

/** Build a name→index map. */
export function byName(list: readonly string[]): Map<string, number> {
  const m = new Map<string, number>()
  list.forEach((name, i) => m.set(name, i))
  return m
}

export const GO_AMP_BY_NAME = byName(GO_AMP_TYPES)
export const GO_BOOSTER_BY_NAME = byName(GO_BOOSTER_TYPES)
export const GO_FX_BY_NAME = byName(GO_FX_TYPES)
export const GO_DELAY_BY_NAME = byName(GO_DELAY_TYPES)
export const GO_REVERB_BY_NAME = byName(GO_REVERB_TYPES)
