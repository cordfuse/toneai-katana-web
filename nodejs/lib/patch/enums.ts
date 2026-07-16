// KATANA parameter enums — value → name maps.
//
// KNOWN BUG (unfixed): the TYPE orderings below are mis-encoded — OD_DS_TYPES has a
// spurious gap at index 7 and REVERB_TYPES is scrambled vs the amp's native order,
// and the TYPE parameter offset may be firmware-version-shifted. A patch loads with
// the wrong effect/amp TYPE selected (Metal DS → Centa OD, Room → Plate) while knobs
// and routing are right. Not verifiable from source alone. Full write-up + the
// one-export fix recipe: docs/KNOWN-BUG-type-enums.md.
//
// GROUND TRUTH. Every table here is transcribed from the Katana Librarian APK
// bytecode (jadx) and cross-checked against 20 factory .kat samples — see
// docs/kat-format.md § Enum tables. These value→name maps are SHARED across
// generations: the enum constructor's per-gen argument gives the stored value,
// but MkI/MkII/MkIII use the same names. So the model's tone-intent vocabulary
// is generation-independent even though the byte LAYOUT is not.
//
// The numbers are the MkI stored values (constructor's 2nd arg). If a later
// generation is found to renumber an enum, that belongs in a per-generation
// override, not here — do not silently assume MkII reuses MkI's integers for
// the STORED byte (the NAME is shared; the byte value may not be).

/** PREAMP_A_TYPE / PREAMP_B_TYPE — amp model (k1.c.b). MkI offsets 81 / 129. */
export const AMP_TYPES = {
  0: 'Natural Clean',
  1: 'Acoustic',
  2: 'Combo Crunch',
  3: 'Stack Crunch',
  4: 'Hi-Gain Stack',
  5: 'Power Drive',
  6: 'Extreme Lead',
  7: 'Core Metal',
  8: 'Clean',
  9: 'Clean Twin',
  10: 'Pro Crunch',
  11: 'Crunch',
  12: 'Deluxe Crunch',
  13: 'VO Drive',
  14: 'VO Lead',
  15: 'Match Drive',
  16: 'BG Lead',
  17: 'BG Drive',
  18: 'MS1959 I',
  19: 'MS1959 I+II',
  20: 'R-Fire Vintage',
  21: 'R-Fire Modern',
  22: 'T-Amp Lead',
  23: 'Brown',
  24: 'Lead',
  25: 'Custom',
  26: 'Bogner Uber',
  27: 'Orange Rocker',
  // 28–32 encode the "(Variation)" voicings of Acoustic/Clean/Crunch/Lead/Brown.
  // MkI hardware also has a separate SW_VARIATION switch; the stored-value vs
  // switch interaction on real hardware isn't fully traced (kat-format.md §
  // Remaining gaps), so treat 28–32 as advanced/uncertain until validated.
  28: 'Acoustic (Variation)',
  29: 'Clean (Variation)',
  30: 'Crunch (Variation)',
  31: 'Lead (Variation)',
  32: 'Brown (Variation)',
} as const

/** OD_DS_TYPE — booster / overdrive / distortion (k1.l.b). MkI offset 49.
 *  The Katana "Booster" IS this slot; there is no separate booster enum on MkI.
 *  Note the gaps (no 7, no 24+): the bytecode skips those ordinals. */
export const OD_DS_TYPES = {
  0: 'Mid Boost',
  1: 'Clean Boost',
  2: 'Treble Boost',
  3: 'Crunch OD',
  4: 'Natural OD',
  5: 'Warm OD',
  6: 'Fat DS',
  8: 'Metal DS',
  9: 'Oct Fuzz',
  10: 'Blues Drive',
  11: 'Overdrive',
  12: 'T-Scream',
  13: 'Turbo OD',
  14: 'Distortion',
  15: 'Rat',
  16: 'Guv DS',
  17: 'DST Plus',
  18: 'Metal Zone',
  19: "'60s Fuzz",
  20: 'Muff Fuzz',
  21: 'HM-2',
  22: 'Metal Core',
  23: 'Centa OD',
} as const

/** FX1 / FX2 type (k1.a0.b). MkI offsets 193 / 461. Shared MOD/FX pool. */
export const FX_TYPES = {
  0: 'T.Wah',
  1: 'Auto Wah',
  2: 'Pedal Wah',
  3: 'Comp',
  4: 'Limiter',
  5: 'Sub OD/DS',
  6: 'Graphic EQ',
  7: 'Parametric EQ',
  8: 'Tone Modify',
  9: 'Guitar Sim',
  10: 'Slow Gear',
  12: 'Wave Synth',
  14: 'Octave',
  15: 'Pitch Shifter',
  16: 'Harmonist',
  18: 'AC Processor',
  19: 'Phaser',
  20: 'Flanger',
  21: 'Tremolo',
  22: 'Rotary',
  23: 'Uni-V',
  25: 'Slicer',
  26: 'Vibrato',
  27: 'Ring Mod',
  28: 'Humanizer',
  29: 'Chorus',
  31: 'AC Guitar Sim',
  33: 'Tera Echo',
  34: 'Overtone',
  35: 'Phaser 90E',
  36: 'Flanger 117E',
  37: 'Wah 95E',
  38: 'DC-30',
  39: 'Heavy Octave',
  40: 'Pedal Bend',
} as const

/** DELAY_TYPE (k1.t.d). MkI offset 737. */
export const DELAY_TYPES = {
  0: 'Digital',
  1: 'Pan',
  2: 'Stereo',
  6: 'Reverse',
  7: 'Analog',
  8: 'Tape Echo',
  9: 'Modulate',
  10: 'SDE-3000',
} as const

/** REVERB_TYPE (k1.q0.c). MkI offset 785. Note: no 0 or 2 in the bytecode. */
export const REVERB_TYPES = {
  1: 'Room',
  3: 'Hall',
  4: 'Plate',
  5: 'Spring',
  6: 'Modulate',
} as const

// ─── derived lookup helpers ──────────────────────────────────────────────────

export type AmpValue = keyof typeof AMP_TYPES
export type OdDsValue = keyof typeof OD_DS_TYPES
export type FxValue = keyof typeof FX_TYPES
export type DelayValue = keyof typeof DELAY_TYPES
export type ReverbValue = keyof typeof REVERB_TYPES

export type AmpName = (typeof AMP_TYPES)[AmpValue]
export type OdDsName = (typeof OD_DS_TYPES)[OdDsValue]
export type FxName = (typeof FX_TYPES)[FxValue]
export type DelayName = (typeof DELAY_TYPES)[DelayValue]
export type ReverbName = (typeof REVERB_TYPES)[ReverbValue]

/** Build a name→value index from a value→name table. */
function invert<T extends Record<number, string>>(table: T): Map<string, number> {
  const m = new Map<string, number>()
  for (const [value, name] of Object.entries(table)) m.set(name, Number(value))
  return m
}

export const AMP_BY_NAME = invert(AMP_TYPES)
export const OD_DS_BY_NAME = invert(OD_DS_TYPES)
export const FX_BY_NAME = invert(FX_TYPES)
export const DELAY_BY_NAME = invert(DELAY_TYPES)
export const REVERB_BY_NAME = invert(REVERB_TYPES)

/** The list a model-facing schema enumerates as its amp choices. */
export const AMP_NAMES: readonly string[] = Object.values(AMP_TYPES)
export const OD_DS_NAMES: readonly string[] = Object.values(OD_DS_TYPES)
export const FX_NAMES: readonly string[] = Object.values(FX_TYPES)
export const DELAY_NAMES: readonly string[] = Object.values(DELAY_TYPES)
export const REVERB_NAMES: readonly string[] = Object.values(REVERB_TYPES)
