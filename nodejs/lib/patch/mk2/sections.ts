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

// Real MkII V2 section layout — key, order, and length verified against a
// ground-truth liveset (data/fixtures/tsr-katana-mk2-v2-pack.tsl). This is now
// REFERENCE ONLY: the writer builds from the golden template (mk2/template.ts),
// which carries these same sections plus their factory-default bytes. Keys are
// bare here; tsl.ts adds the "UserPatch%" prefix on emit.
export const MK2_SECTIONS: readonly Mk2Section[] = [
  { key: 'PatchName', length: 16 },
  { key: 'Patch_0', length: 72 },
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
  { key: 'FsAsgn', length: 2 },
  { key: 'Patch_Mk2V2', length: 10 },
  { key: 'Contour(1)', length: 2 },
  { key: 'Contour(2)', length: 2 },
  { key: 'Contour(3)', length: 2 },
  { key: 'Eq(2)', length: 24 },
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

  // Delay — section Delay(1). TIME is a 2-byte big-endian 7-bit value (ms =
  // hi*128 + lo), verified against ground-truth: 391 ms -> [3,7], 224 ms ->
  // [1,96], 518 ms -> [4,6].
  delayOn:     { section: 'Delay(1)', offset: 0 },
  delayType:   { section: 'Delay(1)', offset: 1 },
  delayTimeHi: { section: 'Delay(1)', offset: 2 },
  delayTimeLo: { section: 'Delay(1)', offset: 3 },
  delayFback:  { section: 'Delay(1)', offset: 4 },
  delayLevel:  { section: 'Delay(1)', offset: 6 },

  // Reverb — section Patch_1. TIME is a single byte at offset 2 (the high byte
  // at offset 3 reads 0 across the ground-truth set).
  revOn:    { section: 'Patch_1', offset: 0 },
  revType:  { section: 'Patch_1', offset: 1 },
  revTime:  { section: 'Patch_1', offset: 2 },
  revLevel: { section: 'Patch_1', offset: 8 },

  // Mod/FX blocks
  fx1On:   { section: 'Fx(1)', offset: 0 },
  fx1Type: { section: 'Fx(1)', offset: 1 },
  fx2On:   { section: 'Fx(2)', offset: 0 },
  fx2Type: { section: 'Fx(2)', offset: 1 },

  // ── Playability parameters. THESE WERE THE BUG. ──────────────────────────────
  //
  // None of these were written. They came from whatever patch the template was
  // cloned from — a community "Mayer Tone", i.e. a CLEAN patch — and were then
  // shipped underneath every tone this app produced, including the high-gain ones.
  // The gate was off, a stranger's contour EQ was on, and the solo switches and
  // level were whatever that player happened to leave them at.
  //
  // A patch is not just the knobs the model picked. It is every byte the amp reads.
  // Everything below is now set deliberately on every patch.

  // Noise suppressor — section Patch_1. The gate. Off in the donor, hence off in
  // every patch we ever shipped; the reason a gain-85 tone squealed on touch.
  nsOn:        { section: 'Patch_1', offset: 38 },
  nsThreshold: { section: 'Patch_1', offset: 39 },
  nsRelease:   { section: 'Patch_1', offset: 40 },

  // Patch output level — so one tone isn't twice as loud as the next.
  patchLevel:  { section: 'Patch_1', offset: 48 },

  // Solo boosts. THREE separate ones, and any of them left on makes a patch
  // arrive far louder than intended. Forced off; the model expresses loudness
  // through amp level, not through a hidden boost.
  odSoloSw:     { section: 'Patch_0', offset: 5 },
  odSoloLevel:  { section: 'Patch_0', offset: 6 },
  ampSoloSw:    { section: 'Patch_0', offset: 27 },
  ampSoloLevel: { section: 'Patch_0', offset: 28 },
  prmSoloSw:    { section: 'Patch_1', offset: 84 },
  prmSoloLevel: { section: 'Patch_1', offset: 85 },

  // Contour — a fixed EQ curve stacked on top of the amp's own EQ. The donor had
  // it ON with curve 2, so every tone secretly carried one player's mid-scoop.
  // Forced off: the model already shapes the tone with bass/mid/treble/presence,
  // and a second invisible EQ underneath it makes those knobs mean nothing.
  contourSw:     { section: 'Patch_1', offset: 86 },
  contourSelect: { section: 'Patch_1', offset: 87 },

  // Amp bright switch — a treble lift on top of the treble knob. Off, same reason.
  ampBright: { section: 'Patch_0', offset: 25 },

  // Preamp gain-range switch (LOW / MID / HIGH, by inference from the GT-series
  // preamp block this derives from).
  //
  // HONESTY: the VALUES are not verified — only the offset is, and only from the
  // decompiled table. The donor sits at 1, which we believe is MID, the normal
  // setting. We write 1 EXPLICITLY rather than inherit it, so the value is a
  // decision on the record instead of an accident. If a real MkII says a generated
  // patch's gain range is wrong, THIS is the first byte to suspect.
  ampGainSw: { section: 'Patch_0', offset: 26 },
} as const

/** One tunable knob within an FX effect: which ModFx field feeds it, the byte
 *  offset inside the FX section, and a musical default stamped when the field is
 *  unset (so an "on" effect is never left with zeroed — silent — parameters). */
export interface FxParamSlot {
  knob: 'rate' | 'depth' | 'level' | 'reso' | 'sustain' | 'attack' | 'tone'
  offset: number
  def: number
}

// Per-effect sub-parameter layout inside an FX section. Offsets are relative to
// the FX section base and are identical for Fx(1) and Fx(2). Each offset is the
// param's real within-section address (e.g. FX1_PHASER_RATE, FX1_ADV_COMP_LEVEL);
// the authoritative map lives in mk2/fx-param-offsets.json and is asserted by
// __tests__/fx-param-layout.test.ts so these can't silently drift. Only the
// mod/dynamics effects the designer reaches for are modelled; any FX type NOT
// listed here is written type-only (byte 0/1), which is correct for effects whose
// params we don't yet expose. Defaults are in 0–100 knob space; the writer scales
// them like every other knob.
export const FX_PARAM_LAYOUT: Record<string, readonly FxParamSlot[]> = {
  Comp: [
    { knob: 'sustain', offset: 23, def: 60 },
    { knob: 'attack', offset: 24, def: 45 },
    { knob: 'tone', offset: 25, def: 50 },
    { knob: 'level', offset: 26, def: 60 },
  ],
  Phaser: [
    { knob: 'rate', offset: 132, def: 45 },
    { knob: 'depth', offset: 133, def: 60 },
    { knob: 'reso', offset: 135, def: 40 },
    { knob: 'level', offset: 137, def: 60 },
  ],
  Flanger: [
    { knob: 'rate', offset: 139, def: 35 },
    { knob: 'depth', offset: 140, def: 55 },
    { knob: 'reso', offset: 142, def: 45 },
    { knob: 'level', offset: 145, def: 60 },
  ],
  Tremolo: [
    { knob: 'rate', offset: 148, def: 55 },
    { knob: 'depth', offset: 149, def: 65 },
    { knob: 'level', offset: 150, def: 60 },
  ],
  Vibrato: [
    { knob: 'rate', offset: 166, def: 45 },
    { knob: 'depth', offset: 167, def: 55 },
    { knob: 'level', offset: 170, def: 60 },
  ],
  // Katana "Chorus" runs the 2x2 (dual-band) stereo-chorus engine — one rate/
  // depth/level per band (LOW then HIGH). We drive both bands from the same
  // knobs so a single "chorus, subtle" intent maps sensibly.
  Chorus: [
    { knob: 'rate', offset: 184, def: 40 },
    { knob: 'depth', offset: 185, def: 50 },
    { knob: 'level', offset: 187, def: 70 },
    { knob: 'rate', offset: 188, def: 40 },
    { knob: 'depth', offset: 189, def: 50 },
    { knob: 'level', offset: 191, def: 70 },
  ],
}
