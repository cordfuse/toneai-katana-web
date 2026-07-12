// WAZA-AIR BASS enum orderings — extracted from the WAZA-AIR BASS app resource
// table (config/resource.js) and cross-checked against a real bank
// (data/fixtures/waza-air-bass-rock.tsl): booster 12=BASS DRV, 1=BASS OD,
// 8=BASS FUZZ, 4=BASS DS; fx 9=COMPRESSOR, 21=BASS SYNTH, 12=GRAPHIC EQ.
//
// The flat-image LAYOUT and the DELAY/REVERB voices are shared with the Air
// family (writers/air.ts reuses AIR_DELAY_BY_NAME / AIR_REVERB_BY_NAME); only the
// amp voices, boosters, and mod/FX are bass-specific.

/** The 5 WAZA-AIR BASS amp panel voices (AMP TYPE). Not written per patch — the
 *  amp is global panel state; these drive the hand-dial INSTRUCTIONS. */
export const WAZA_BASS_AMP_TYPES = ['SUPER FLAT', 'FLAT', 'VINTAGE', 'MODERN', 'DRIVE'] as const

/** Booster / OD / DS (ODDS TYPE, 0–13), bass-specific, contiguous. */
export const WAZA_BASS_BOOSTER_TYPES = [
  'BOOSTER', 'BASS OD', 'BLUES OD', 'NATURAL', 'BASS DS', 'GUV DS', 'BASS MT', 'METAL ZONE',
  'BASS FUZZ', 'MUFF FUZZ', 'HiBAND DRV', 'AB-DIST', 'BASS DRV', 'BASS DI',
] as const

/** Mod / FX (FX1 & FX2 TYPE, 0–21), bass-specific, contiguous. */
export const WAZA_BASS_FX_TYPES = [
  'CHORUS', 'FLANGER', 'PHASER', 'UNI-V', 'TREMOLO', 'VIBRATO', 'ROTARY', 'RING MOD', 'SLOW GEAR',
  'COMPRESSOR', 'LIMITER', 'T. WAH', 'GRAPHIC EQ', 'PARAMETRIC EQ', 'OCTAVE', 'PITCH SHIFTER',
  'HARMONIST', 'HUMANIZER', 'ENHANCER', 'BASS SIMULATOR', 'DEFRETTER', 'BASS SYNTH',
] as const

function byName(list: readonly string[]): Map<string, number> {
  const m = new Map<string, number>()
  list.forEach((n, i) => m.set(n, i))
  return m
}

export const WAZA_BASS_BOOSTER_BY_NAME = byName(WAZA_BASS_BOOSTER_TYPES)
export const WAZA_BASS_FX_BY_NAME = byName(WAZA_BASS_FX_TYPES)
