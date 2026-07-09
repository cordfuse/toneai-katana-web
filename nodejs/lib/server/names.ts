export const AMP_NAMES: Record<number, string> = {
  1: 'JazzClean (Roland JC-120)', 2: 'DeluxeRvb (Fender Deluxe Reverb)',
  3: 'BassMate (Bass)', 4: 'Tweedy (Fender Tweed)', 5: 'TwinRvb (Fender Twin Reverb)',
  6: 'HiWire (Hiwatt DR-103)', 7: 'CaliCrunch (Mesa Mk I)', 8: 'ClassA15 (Vox AC15)',
  9: 'ClassA30 (Vox AC30)', 10: 'Plexi100 (Marshall Super Lead 100W)',
  11: 'Plexi45 (Marshall Plexi 45W)', 12: 'Brit800 (Marshall JCM800)',
  13: 'Pl1987x50 (Marshall 1987x 50W)', 14: 'Slo100 (Soldano SLO-100)',
  15: 'FiremanHBE (Engl Fireman)', 16: 'DualRect (Mesa Dual Rectifier)',
  17: 'DIEVH4 (EVH 5150 III)', 18: 'VibroKing (Fender Vibroking)',
  19: 'Budda (Budda Superdrive 45)', 20: 'MrZ38 (Dr. Z MAZ 38)',
  21: 'SuperRvb (Fender Super Reverb)', 22: 'BritBlues (Marshall Bluesbreaker)',
  23: 'MatchD30 (Matchless DC-30)', 24: 'Brit2000 (Marshall DSL/TSL)',
  25: 'UberHiGain (Framus Cobra)', 26: 'AGL (Aguilar DB-359)',
  27: 'MLD (Ampeg SVT Classic)', 28: 'OptimaAir (Acoustic)', 29: 'Stageman (Acoustic Stage)',
}

export const CAB_NAMES: Record<number, string> = {
  1: 'JZ120Pro (Roland 1x12)', 2: 'DR112Pro (Fender 1x12)', 3: 'TR212Pro (Fender 2x12)',
  4: 'HIWIRE412 (Hiwatt 4x12)', 5: 'CALI112 (Mesa 1x12)', 6: 'A112 (Vox 1x12)',
  7: 'GB412Pro (Greenback 4x12)', 8: 'M1960AX (Marshall 4x12)',
  9: 'M1960AV (Marshall Angled 4x12)', 10: 'M1960TV (Marshall TV 4x12)',
  11: 'SLO412 (Soldano 4x12)', 12: 'FIREMAN412 (Engl 4x12)',
  13: 'RECT412 (Mesa Rectifier 4x12)', 14: 'DIE412 (EVH 4x12)',
  15: 'MATCH212 (Matchless 2x12)', 16: 'UBER412 (Framus 4x12)',
  17: 'BS410 (Bass 4x10)', 18: 'A212Pro (Vox 2x12)', 19: 'M1960AHW (Marshall 4x12 HW)',
  20: 'M1936 (Marshall 2x12)', 21: 'BUDDA112 (Budda 1x12)', 22: 'Z212 (Dr. Z 2x12)',
  23: 'SUPERVERB410 (Fender 4x10)', 24: 'VIBROKING310 (Fender 3x10)',
  25: 'AGLDB810 (Aguilar 8x10)', 32: 'GHBIRDPro (Acoustic)',
  33: 'GJ15Pro (Guild J-15)', 34: 'MD45Pro (Martin D-45)',
}

export const EFX_NAMES: Record<number, string> = {
  1: 'Distortion+ (MXR)', 2: 'RC Boost (Xotic)', 3: 'AC Boost (Xotic)',
  4: 'Dist One (ProCo RAT)', 5: 'T Screamer (TS-808)', 6: 'Blues Drive (Boss BD-2)',
  7: 'Morning Drive (JHS)', 8: 'Eat Dist (Big Muff Pi)', 9: 'Red Dirt',
  10: 'Crunch', 11: 'Muff Fuzz', 12: 'Katana Boost', 13: 'ST Singer (Zendrive)', 14: 'Touch Wah',
}

export const REVERB_NAMES: Record<number, string> = {
  1: 'Room', 2: 'Hall', 3: 'Plate', 4: 'Spring', 5: 'Shimmer', 6: 'Damp',
}

export const DELAY_NAMES: Record<number, string> = {
  1: 'Analog', 2: 'Digital', 3: 'Mod Delay', 4: 'Tape Echo', 5: 'Pan Delay', 6: 'Phi Delay',
}

export const MOD_NAMES: Record<number, string> = {
  1: 'CE-1 Chorus', 2: 'CE-2 Chorus', 3: 'ST Chorus', 4: 'Vibrato',
  5: 'Detune', 6: 'Flanger', 7: 'Phase 90', 8: 'Phase 100',
  9: 'S.C.F.', 10: 'U-Vibe', 11: 'Tremolo', 12: 'Rotary', 13: 'SCH-1', 14: 'Mono Octave',
}

export const COMP_NAMES: Record<number, string> = {
  1: 'RoseComp (Ross)', 2: 'KComp (Keeley)', 3: 'StudioComp (VCA)',
}

// ── Standard device name maps (0-indexed nuxIndex) ──────────────────────────

export const PLUG_AIR_V1_AMP_NAMES: Record<number, string> = {
  0: 'TwinVerb (Fender Twin)',
  1: 'JZ120 (Roland JC-120)',
  2: 'TweedDlx (Fender Tweed Deluxe)',
  3: 'Plexi (Marshall Plexi)',
  4: 'TopBoost30 (Vox AC30)',
  5: 'Lead100 (Marshall Lead)',
  6: 'Fireman (Engl Fireman)',
  7: 'DIE VH4 (EVH 5150 III)',
  8: 'Recto (Mesa Dual Rectifier)',
  9: 'Optima (Acoustic)',
  10: 'Stageman (Acoustic Stage)',
  11: 'MLD (Ampeg SVT Classic)',
  12: 'AGL (Aguilar DB-359)',
}

export const PLUG_AIR_V2_AMP_NAMES: Record<number, string> = {
  0: 'JazzClean (Roland JC-120)',
  1: 'DeluxeRvb (Fender Deluxe Reverb)',
  2: 'TwinRvbV2 (Fender Twin Reverb)',
  3: 'ClassA30 (Vox AC30)',
  4: 'Brit800 (Marshall JCM800)',
  5: 'Pl1987x50 (Marshall 1987x 50W)',
  6: 'FiremanHBE (Engl Fireman)',
  7: 'DualRect (Mesa Dual Rectifier)',
  8: 'DIEVH4v2 (EVH 5150 III)',
  9: 'AGLv2 (Aguilar DB-359)',
  10: 'Starlift',
  11: 'MLDv2 (Ampeg SVT Classic)',
  12: 'Stagemanv2 (Acoustic Stage)',
}

export const PLUG_AIR_CAB_NAMES: Record<number, string> = {
  0: 'V1960 (Marshall 4x12)',
  1: 'A212',
  2: 'BS410 (Bass 4x10)',
  3: 'DR112 (Fender 1x12)',
  4: 'GB412 (Greenback 4x12)',
  5: 'JZ120IR (Roland 1x12)',
  6: 'TR212 (Fender 2x12)',
  7: 'V412 (Marshall 4x12)',
  8: 'AGLDB810 (Bass 8x10)',
  9: 'AMPSV810 (Bass 8x10)',
  10: 'MKB410 (Bass 4x10)',
  11: 'TRC410 (Bass 4x10)',
  12: 'GHBird (Acoustic)',
  13: 'GJ15 (Acoustic)',
  14: 'MD45 (Acoustic)',
  15: 'GIBJ200 (Acoustic)',
  16: 'GIBJ45 (Acoustic)',
  17: 'TL314 (Acoustic)',
  18: 'MHD28 (Acoustic)',
}

export const PLUG_AIR_EFX_NAMES: Record<number, string> = {
  0: 'Touch Wah',
  1: 'UniVibe',
  2: 'Tremolo',
  3: 'Phaser',
  4: 'Boost',
  5: 'T Screamer (TS-808)',
  6: 'Bass TS',
  7: '3 Band EQ',
  8: 'Muff Fuzz',
  9: 'Crunch',
  10: 'Red Dist',
  11: 'Morning Drive',
  12: 'Dist One (RAT)',
}

export const PLUG_AIR_V1_MOD_NAMES: Record<number, string> = {
  0: 'Phaser', 1: 'Chorus', 2: 'ST Chorus', 3: 'Flanger', 4: 'U-Vibe', 5: 'Tremolo',
}

export const PLUG_AIR_V2_MOD_NAMES: Record<number, string> = {
  0: 'PH100 (Phase)', 1: 'CE-1 (Chorus)', 2: 'ST Chorus', 3: 'SCF (Flanger/Chorus)',
}

export const PLUG_AIR_DELAY_NAMES: Record<number, string> = {
  0: 'Analog Delay', 1: 'Tape Echo', 2: 'Digital Delay', 3: 'Ping Pong',
}

export const PLUG_AIR_V1_REVERB_NAMES: Record<number, string> = {
  0: 'Room', 1: 'Hall', 2: 'Plate', 3: 'Spring', 4: 'Shimmer',
}

export const PLUG_AIR_V2_REVERB_NAMES: Record<number, string> = {
  0: 'Room', 1: 'Hall', 2: 'Plate',
}

// Lite: 1 amp only
export const LITE_AMP_NAMES: Record<number, string> = {
  0: 'AmpClean',
}

export const LITE_MOD_NAMES: Record<number, string> = {
  0: 'Phaser', 1: 'Chorus', 2: 'Tremolo', 3: 'Vibe',
}

// Lite: combined ambience slot — delays 0-3, reverbs 10-13
export const LITE_AMBIENCE_NAMES: Record<number, string> = {
  0: 'Delay 1', 1: 'Delay 2', 2: 'Delay 3', 3: 'Delay 4',
  10: 'Room', 11: 'Hall', 12: 'Plate', 13: 'Spring',
}

// 8BT: separate slots, 0-indexed
export const LITE_8BT_DELAY_NAMES: Record<number, string> = {
  0: 'Delay 1', 1: 'Delay 2', 2: 'Delay 3', 3: 'Delay 4',
}

export const LITE_8BT_REVERB_NAMES: Record<number, string> = {
  0: 'Room', 1: 'Hall', 2: 'Plate', 3: 'Spring',
}

// 20/40BT
export const BT2040_AMP_NAMES: Record<number, string> = {
  0: 'Amp',
}

export const BT2040_MOD_NAMES: Record<number, string> = {
  0: 'Phaser', 1: 'Chorus', 2: 'Tremolo',
}

export const BT2040_DELAY_NAMES: Record<number, string> = {
  0: 'Analog Delay', 1: 'Modulation Delay', 2: 'Digital Delay',
}

export const BT2040_REVERB_NAMES: Record<number, string> = {
  0: 'Hall', 1: 'Plate', 2: 'Spring',
}
