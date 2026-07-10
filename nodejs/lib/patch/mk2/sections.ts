// KATANA MkII section table.
//
// Each MkII patch is a set of named byte-array sections; the section names are
// the .tsl `paramSet` keys. This table — key (JSON name), raw base address, and
// byte length — is transcribed from the Katana Librarian app's MkII section
// descriptors (the l.b enum). A param placed in a section sits at its own
// within-section offset (see mk2/param-table.json).
//
// The .tsl carries every section (the importer warns on a missing one), so the
// writer emits all of them: populated where the patch sets values, zero-filled
// otherwise (zero = the amp's init default).

export interface Mk2Section {
  /** .tsl paramSet key, e.g. "Patch_0". */
  key: string
  /** Byte length of the section's array. */
  length: number
}

// Declaration order preserved (matches the app's export order).
export const MK2_SECTIONS: readonly Mk2Section[] = [
  { key: 'PatchName', length: 16 },
  { key: 'Patch_0', length: 72 },
  { key: 'Eq(2)', length: 24 },
  { key: 'Fx(1)', length: 225 },
  { key: 'Fx(2)', length: 225 },
  { key: 'Delay(1)', length: 26 },
  { key: 'Delay(2)', length: 26 },
  { key: 'Patch_1', length: 91 },
  { key: 'Patch_2', length: 36 },
  { key: 'Status', length: 18 },
  { key: 'KnobAsgn', length: 34 },
  { key: 'ExpPedalAsgn', length: 34 },
  { key: 'ExpPedalAsgnMinMax', length: 78 },
  { key: 'GafcExp1Asgn', length: 34 },
  { key: 'GafcExp1AsgnMinMax', length: 78 },
  { key: 'GafcExp2Asgn', length: 34 },
  { key: 'GafcExp2AsgnMinMax', length: 78 },
  { key: 'GafcExp3Asgn', length: 34 },
  { key: 'GafcExp3AsgnMinMax', length: 78 },
  { key: 'GafcExExp1Asgn', length: 34 },
  { key: 'GafcExExp1AsgnMinMax', length: 78 },
  { key: 'GafcExExp2Asgn', length: 34 },
  { key: 'GafcExExp2AsgnMinMax', length: 78 },
  { key: 'GafcExExp3Asgn', length: 34 },
  { key: 'GafcExExp3AsgnMinMax', length: 78 },
  { key: 'CtrlAsgn', length: 8 },
  { key: 'FsAsgn', length: 2 },
  { key: 'Patch_Mk2V2', length: 22 },
  { key: 'Contour(1)', length: 2 },
  { key: 'Contour(2)', length: 2 },
  { key: 'Contour(3)', length: 2 },
  { key: 'Chain', length: 20 },
] as const

// Section keys the writer actually populates. The `offset` is the byte index
// WITHIN the section (from mk2/param-table.json). Kept as named constants rather
// than a raw table so every placement is traceable to a real param.
export const MK2_OFFSETS = {
  patchName: { section: 'PatchName', offset: 0, len: 16 },

  // OD / booster — section Patch_0
  odOn:     { section: 'Patch_0', offset: 0 },
  odType:   { section: 'Patch_0', offset: 1 },
  odDrive:  { section: 'Patch_0', offset: 2 },
  odTone:   { section: 'Patch_0', offset: 4 },
  odLevel:  { section: 'Patch_0', offset: 7 },

  // Preamp A — section Patch_0
  ampOn:    { section: 'Patch_0', offset: 16 },
  ampType:  { section: 'Patch_0', offset: 17 },
  ampGain:  { section: 'Patch_0', offset: 18 },
  ampBass:  { section: 'Patch_0', offset: 20 },
  ampMid:   { section: 'Patch_0', offset: 21 },
  ampTreb:  { section: 'Patch_0', offset: 22 },
  ampPres:  { section: 'Patch_0', offset: 23 },
  ampLevel: { section: 'Patch_0', offset: 24 },

  // Delay — section Delay(1)
  delayOn:    { section: 'Delay(1)', offset: 0 },
  delayType:  { section: 'Delay(1)', offset: 1 },
  delayFback: { section: 'Delay(1)', offset: 4 },
  delayLevel: { section: 'Delay(1)', offset: 6 },

  // Reverb — section Patch_1
  revOn:    { section: 'Patch_1', offset: 0 },
  revType:  { section: 'Patch_1', offset: 1 },
  revTime:  { section: 'Patch_1', offset: 2 },
  revLevel: { section: 'Patch_1', offset: 8 },

  // Mod/FX blocks
  fx1On:   { section: 'Fx(1)', offset: 0 },
  fx1Type: { section: 'Fx(1)', offset: 1 },
  fx2On:   { section: 'Fx(2)', offset: 0 },
  fx2Type: { section: 'Fx(2)', offset: 1 },
} as const
