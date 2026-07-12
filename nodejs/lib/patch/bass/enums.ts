// KATANA BASS (desktop head/combo line: 110 / 210 / Head) enum orderings —
// extracted from the KATANA BASS editor app (config/address_map.js +
// config/resource.js) and confirmed against a real export
// (data/fixtures/katana-bass-alex-hutchings.tsl, device string "KATANA BASS").
//
// Architecture note: KATANA BASS has NO amp block — the "amp" is the front-panel
// Knob block (KNOB TYPE = preamp voice, + GAIN/VOLUME/EQ). The drive is a
// separate OD/DS stage. Each effect block is stored in three "color" variations;
// the writer overlays variation 1 (green) and points the SelColorSw COLOR bytes
// at it. See docs/katana-bass-format-notes.md.

/** Preamp voice (KNOB TYPE byte, 0–2). OFF(1) is "no preamp"; the tone vocab
 *  exposes the two voiced options. Byte values are explicit (VINTAGE=0, MODERN=2). */
export const BASS_AMP_TYPES = ['VINTAGE', 'MODERN'] as const
export const BASS_AMP_BY_NAME = new Map<string, number>([['VINTAGE', 0], ['MODERN', 2]])

/** Drive / OD / DS (DRIVE TYPE, 0–12). */
export const BASS_DRIVE_TYPES = [
  'BLUES OD', 'NATURAL', 'GUV DS', 'METAL ZONE', 'MUFF FUZZ', 'BOOSTER', 'BASS OD',
  'BASS DS', 'BASS MT', 'BASS FUZZ', 'HIBAND DRV', 'BASS DRV', 'BASS DI',
] as const

/** Mod / FX (FX1 & FX2 FX TYPE, 0–23). `null` = reserved slot (byte 21), kept so
 *  real names keep their true index. */
export const BASS_FX_LIST: readonly (string | null)[] = [
  'CHORUS', 'FLANGER', 'PHASER', 'UNI-V', 'TREMOLO', 'VIBRATO', 'ROTARY', 'RING MOD',
  'SLOW GEAR', 'T. WAH', 'GRAPHIC EQ', 'PARAMETRIC EQ', 'OCTAVE', 'PITCH SHIFTER',
  'HARMONIST', 'HUMANIZER', 'ENHANCER', 'BASS SIMULATOR', 'DEFRETTER', 'BASS SYNTH',
  'AUTO WAH', null, 'HEAVY OCTAVE', 'SLICER',
]
export const BASS_FX_TYPES = BASS_FX_LIST.filter((x): x is string => !!x)

/** Delay (Fx2 DELAY TYPE, 0–5). */
export const BASS_DELAY_TYPES = ['DIGITAL', 'ANALOG', 'TAPE ECHO', 'REVERSE', 'MODULATE', 'SDE-3000'] as const

/** Reverb (Fx2 REVERB TYPE, 0–4). */
export const BASS_REVERB_TYPES = ['PLATE', 'ROOM', 'HALL', 'SPRING', 'MODULATE'] as const

function byName(list: readonly (string | null)[]): Map<string, number> {
  const m = new Map<string, number>()
  list.forEach((n, i) => { if (n) m.set(n, i) })
  return m
}

export const BASS_DRIVE_BY_NAME = byName(BASS_DRIVE_TYPES)
export const BASS_FX_BY_NAME = byName(BASS_FX_LIST)
export const BASS_DELAY_BY_NAME = byName(BASS_DELAY_TYPES)
export const BASS_REVERB_BY_NAME = byName(BASS_REVERB_TYPES)
