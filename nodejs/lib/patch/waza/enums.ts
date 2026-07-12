// WAZA-AIR (guitar) enums. The booster / mod-FX / delay / reverb voices are
// IDENTICAL to KATANA:AIR (verified: the app's ODDS/FX/DELAY/REVERB resource
// lists match byte-for-byte, and the real bank decodes the same — booster
// 11=OVERDRIVE, fx 29=CHORUS, reverb 3=HALL). So the writer reuses
// air/enums.ts for those; only the AMP panel voices differ (FLAT for ACOUSTIC).

/** The 5 WAZA-AIR amp panel voices (AMP TYPE). Not written per patch — the amp is
 *  global panel state; these drive the hand-dial INSTRUCTIONS. WAZA-AIR opens
 *  with FLAT where KATANA:AIR has ACOUSTIC. */
export const WAZA_AMP_TYPES = ['FLAT', 'CLEAN', 'CRUNCH', 'LEAD', 'BROWN'] as const
