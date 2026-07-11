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

// ── BASS MODE ────────────────────────────────────────────────────────────────
//
// GO is dual-mode: bass mode reuses the SAME 30-block PATCH% layout but with a
// different vocabulary (mode gated in the app by businesslogic/mode/mode_info.js).
// Byte values here are the real field values, NOT list positions:
//  • AMP_TYPE is one shared field — guitar uses 0–4, BASS uses 5–7 (resource
//    _[amp2] has blanks at 0–4). VINTAGE=5, FLAT=6, MODERN=7.
//  • The booster ("DRIVE" in bass) shares PATCH_BOOSTER_TYPE; bass shows indices
//    ≥23 (MAX_INDEX_BST_TYPE_GUITAR_MODE=23), i.e. bytes 23–35.
//  • Bass FX has its own list with reserved (null) slots — byte = true index.
// Delay + reverb lists are identical to guitar mode.
//
// NOTE: no real bass-mode export has been round-tripped yet, so the GO bass
// profile ships at confidence 'derived' (see generations.ts) until one lands.

/** Bass amp voices, mapped to their real AMP_TYPE byte values (5–7). */
export const GO_BASS_AMP_TYPES = ['VINTAGE', 'FLAT', 'MODERN'] as const
export const GO_BASS_AMP_BY_NAME = new Map<string, number>([
  ['VINTAGE', 5], ['FLAT', 6], ['MODERN', 7],
])

/** Bass DRIVE (PATCH_BOOSTER_TYPE ≥23). Listed with their real byte values. */
const GO_BASS_BOOSTER_ENTRIES: readonly [string, number][] = [
  ['BLUES OD', 23], ['NATURAL', 24], ['GUV DS', 25], ['METAL ZONE', 26], ['MUFF FUZZ', 27],
  ['BOOSTER', 28], ['BASS OD', 29], ['BASS DS', 30], ['BASS MT', 31], ['BASS FUZZ', 32],
  ['BASS DRV', 33], ['HIBAND DRV', 34], ['BASS DI', 35],
]
export const GO_BASS_BOOSTER_TYPES = GO_BASS_BOOSTER_ENTRIES.map(([n]) => n)
export const GO_BASS_BOOSTER_BY_NAME = new Map<string, number>(GO_BASS_BOOSTER_ENTRIES)

/** Bass FX (own list; null = reserved slot, kept so real names keep their byte). */
export const GO_BASS_FX_LIST: readonly (string | null)[] = [
  'CHORUS', 'FLANGER', 'PHASER', 'UNI-V', 'TREMOLO', 'VIBRATO', 'ROTARY', 'RING MOD',
  'SLOW GEAR', 'SLICER', null, null, null, 'AUTO WAH', 'GRAPHIC EQ', 'PARAMETRIC EQ',
  null, null, null, null, null, 'HEAVY OCTAVE', 'PITCH SHIFTER', 'HARMONIST', 'HUMANIZER',
  null, null, null, 'ENHANCER', 'BASS SIMULATOR', 'DEFRETTER', 'OCTAVE', 'T.WAH', 'BASS SYNTH',
]
export const GO_BASS_FX_TYPES = GO_BASS_FX_LIST.filter((x): x is string => !!x)
export const GO_BASS_FX_BY_NAME = (() => {
  const m = new Map<string, number>()
  GO_BASS_FX_LIST.forEach((n, i) => { if (n) m.set(n, i) })
  return m
})()

// Delay + reverb are shared with guitar mode.
export const GO_BASS_DELAY_TYPES = GO_DELAY_TYPES
export const GO_BASS_DELAY_BY_NAME = GO_DELAY_BY_NAME
export const GO_BASS_REVERB_TYPES = GO_REVERB_TYPES
export const GO_BASS_REVERB_BY_NAME = GO_REVERB_BY_NAME
