// KATANA Gen 3 enum vocabulary — byte value -> name, and the inverse maps the
// writer uses. Orderings VERIFIED against ground-truth exports (see
// docs/gen3-format-notes.md): resource-file selector order == byte index, e.g.
// EVH patch -> BROWN(5), "Pushed Trem" -> TREMOLO, "LOW Oct" -> OCTAVE.
//
// Gen 3's sets differ from MkII's — its own amps (ACOUSTIC/PUSHED/BROWN), its own
// delay (SDE-3000) and FX. This is the mk3 half of the per-device vocabulary.

export const GEN3_AMP_TYPES = ['ACOUSTIC', 'CLEAN', 'PUSHED', 'CRUNCH', 'LEAD', 'BROWN'] as const

export const GEN3_BOOSTER_TYPES = [
  'MID BOOST', 'CLEAN BOOST', 'TREBLE BOOST', 'CRUNCH OD', 'NATURAL OD', 'WARM OD',
  'FAT DS', 'METAL DS', 'OCT FUZZ', 'BLUES DRIVE', 'OVERDRIVE', 'T-SCREAM', 'TURBO OD',
  'DISTORTION', 'RAT', 'GUV DS', 'DST+', 'METAL ZONE', "'60s FUZZ", 'MUFF FUZZ',
  'HM-2', 'METAL CORE', 'CENTA OD',
] as const

export const GEN3_FX_TYPES = [
  'T.WAH', 'AUTO WAH', 'PEDAL WAH', 'COMP', 'LIMITER', 'GRAPHIC EQ', 'PARAMETRIC EQ',
  'GUITAR SIM', 'SLOW GEAR', 'WAVE SYNTH', 'OCTAVE', 'PITCH SHIFTER', 'HARMONIST',
  'AC.PROCESSOR', 'PHASER', 'FLANGER', 'TREMOLO', 'ROTARY', 'UNI-V', 'SLICER',
  'VIBRATO', 'RING MOD', 'HUMANIZER', 'CHORUS', 'AC.GUITAR SIM', 'PHASER 90E',
  'FLANGER 117E', 'WAH 95E', 'DC-30', 'HEAVY OCTAVE', 'PEDAL BEND',
] as const

export const GEN3_DELAY_TYPES = [
  'DIGITAL', 'PAN', 'STEREO', 'ANALOG', 'TAPE ECHO', 'REVERSE', 'MODULATE', 'SDE-3000',
] as const

export const GEN3_REVERB_TYPES = ['PLATE', 'ROOM', 'HALL', 'SPRING', 'MODULATE'] as const

/** name -> byte index (position in the list). */
function byName(list: readonly string[]): Map<string, number> {
  const m = new Map<string, number>()
  list.forEach((name, i) => m.set(name, i))
  return m
}

export const GEN3_AMP_BY_NAME = byName(GEN3_AMP_TYPES)
export const GEN3_BOOSTER_BY_NAME = byName(GEN3_BOOSTER_TYPES)
export const GEN3_FX_BY_NAME = byName(GEN3_FX_TYPES)
export const GEN3_DELAY_BY_NAME = byName(GEN3_DELAY_TYPES)
export const GEN3_REVERB_BY_NAME = byName(GEN3_REVERB_TYPES)
