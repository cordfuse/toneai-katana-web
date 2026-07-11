// KATANA Air enum orderings — extracted from the Air editor app's resource
// table (config/resource.js `_[…]`) and cross-checked against a real bank
// (data/fixtures/katana-air-rock-legend-vol1.tsl): CHORUS=29, TREMOLO=21,
// ROTARY=22, COMP=3, LIMITER=4 (FX); OVERDRIVE=11, OCT FUZZ=9 (ODDS);
// HALL=3, PLATE=4 (reverb). Byte value = position in the list; `null` marks a
// reserved/unused slot, kept so real names keep their true index.
//
// Air's amp voices are the FIVE physical panel positions — they are NOT written
// into a patch (the amp is global panel state). They drive the amp INSTRUCTIONS
// a generated Air tone ships alongside the .tsl (docs/air-format-notes.md).

/** The 5 Air amp panel voices, in AMP TYPE knob order (System PRM_SYS_KNOB_POS_TYPE). */
export const AIR_AMP_TYPES = ['ACOUSTIC', 'CLEAN', 'CRUNCH', 'LEAD', 'BROWN'] as const

/** Booster / OD / DS (ODDS block, PRM_ODDS_TYPE). */
export const AIR_BOOSTER_TYPES: readonly (string | null)[] = [
  'MID BOOST', 'CLEAN BOOST', 'TREBLE BOOST', 'CRUNCH OD', 'NATURAL OD', 'WARM OD', 'FAT DS', null,
  'METAL DS', 'OCT FUZZ', 'BLUES DRIVE', 'OVERDRIVE', 'T-SCREAM', 'TURBO OD', 'DISTORTION', 'RAT',
  'GUV DS', 'DST+', 'METAL ZONE', "'60s FUZZ", 'MUFF FUZZ',
]

/** Mod / FX (FX1 & FX2 blocks, PRM_FXn_FXTYPE). 37 slots. */
export const AIR_FX_TYPES: readonly (string | null)[] = [
  'T.WAH', 'AUTO WAH', 'PEDAL WAH', 'COMP', 'LIMITER', null, 'GRAPHIC EQ', 'PARAMETRIC EQ', null,
  'GUITAR SIM', 'SLOW GEAR', null, 'WAVE SYNTH', null, 'OCTAVE', 'PITCH SHIFTER', 'HARMONIST', null,
  'AC.PROCESSOR', 'PHASER', 'FLANGER', 'TREMOLO', 'ROTARY', 'UNI-V', null, 'SLICER', 'VIBRATO',
  'RING MOD', 'HUMANIZER', 'CHORUS', null, 'AC.GUITAR SIM', null, null, null, 'PHASER 90E', 'FLANGER 117E',
]

/** Delay (DLY block, PRM_DLY_TYPE). NOTE: address_map caps DLY_TYPE at 6 while
 *  the resource list runs further — the fixture only exercises DIGITAL(0), so the
 *  upper delay indices are UNVERIFIED and flagged for on-device confirmation. */
export const AIR_DELAY_TYPES: readonly (string | null)[] = [
  'DIGITAL', 'PAN', null, null, null, null, 'REVERSE', 'ANALOG', 'TAPE ECHO', 'MODULATE', 'SDE-3000',
]

/** Reverb (REVERB block, PRM_REVERB_TYPE). */
export const AIR_REVERB_TYPES: readonly (string | null)[] = [
  null, 'ROOM', null, 'HALL', 'PLATE', 'SPRING', 'MODULATE',
]

/** Build a name→index map, skipping reserved (null) slots. */
export function byName(list: readonly (string | null)[]): Map<string, number> {
  const m = new Map<string, number>()
  list.forEach((name, i) => { if (name) m.set(name, i) })
  return m
}

export const AIR_BOOSTER_BY_NAME = byName(AIR_BOOSTER_TYPES)
export const AIR_FX_BY_NAME = byName(AIR_FX_TYPES)
export const AIR_DELAY_BY_NAME = byName(AIR_DELAY_TYPES)
export const AIR_REVERB_BY_NAME = byName(AIR_REVERB_TYPES)

/** The user-facing (non-null) names for a category — for vocab + schema. */
export const AIR_BOOSTER_NAMES = AIR_BOOSTER_TYPES.filter((x): x is string => !!x)
export const AIR_FX_NAMES = AIR_FX_TYPES.filter((x): x is string => !!x)
export const AIR_DELAY_NAMES = AIR_DELAY_TYPES.filter((x): x is string => !!x)
export const AIR_REVERB_NAMES = AIR_REVERB_TYPES.filter((x): x is string => !!x)
