// Model-facing one-liners for every amp/effect name in every device vocabulary.
//
// WHY THIS EXISTS: the tone vocabularies are bare name lists ("Brown", "T-Scream",
// "HM-2"), and on a small model that is a knowledge test it fails — Sonnet knows
// from pretraining that "Brown" is the Van Halen cranked-Marshall voice; Haiku
// often does not, so it picks by vibes and the tone comes out wrong. These
// descriptions put the missing gear knowledge INTO the prompt, where every model
// reads it. They land in the cached prompt prefix, so the recurring cost is
// cache-read pennies.
//
// One dictionary serves all nine devices: the generations spell the same effect
// differently ("Chorus" / "CHORUS", "T.Wah" / "T.WAH" / "T. WAH", "DST Plus" /
// "DST+"), so lookups normalize the name first. A name with no entry simply gets
// no description — the prompt renders it bare, nothing breaks. Keep entries to
// ONE line: what it is (the real amp/pedal when there is one) and when to reach
// for it. This text is read by the model, not the player.

/** Uppercase and strip everything but letters, digits and '+', so all the
 *  per-generation spellings of one effect land on one key. */
function normalize(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9+]/g, '')
}

const D: Record<string, string> = {}
/** Register one description under every spelling that normalizes to it. */
function d(names: string[], text: string) {
  for (const n of names) D[normalize(n)] = text
}

// ── Amps ────────────────────────────────────────────────────────────────────
// KATANA panel voices (MkII/Gen3/Air/GO share these five, Gen3 adds PUSHED).
d(['Clean'], 'warm Roland-style clean, pedal platform')
d(['Pushed'], 'clean on the edge of breakup — dynamic, cleans up with the volume knob')
d(['Crunch'], 'classic-rock breakup, British flavour — AC/DC to Zeppelin rhythm')
d(['Lead'], 'smooth saturated high gain, singing solo voice')
d(['Brown'], "the Van Halen 'brown sound' — cranked hot-rodded Marshall, loose and harmonically rich")
d(['Acoustic'], 'acoustic-guitar simulator voice for electric')
// Sneaky-amps / full GT amp set (MkII 'Custom' panel and Gen3).
d(['Natural Clean'], 'flat, uncoloured clean — the most transparent pedal platform')
d(['Clean Twin'], 'Fender Twin Reverb — glassy, scooped American clean with headroom')
d(['Pro Crunch'], 'Fender Pro — warm American breakup')
d(['Combo Crunch'], 'tweed combo breakup — raw, boxy, early rock and roll')
d(['Deluxe Crunch'], 'Fender Deluxe pushed — sweet touch-sensitive mid breakup')
d(['Stack Crunch'], 'British stack crunch — big, open, raw')
d(['VO Drive'], 'Vox AC30 top boost — chimey British drive, Beatles/Queen rhythm')
d(['VO Lead'], 'Vox AC30 lead — chime pushed into singing breakup, Brian May')
d(['Match Drive'], 'Matchless — boutique British drive, warm and dynamic')
d(['BG Lead'], 'Mesa/Boogie Mark lead — liquid singing sustain, Santana/Petrucci')
d(['BG Drive'], 'Mesa/Boogie drive — thick American gain')
d(['MS1959 I'], 'Marshall Plexi channel I — raw bright classic rock, Hendrix/Zeppelin')
d(['MS1959 I+II'], 'Marshall Plexi jumped channels — fuller and fatter Plexi, AC/DC territory')
d(['Hi-Gain Stack'], 'tight modern high-gain stack — 80s/90s metal rhythm')
d(['Power Drive'], 'saturated modern drive — thick contemporary rhythm')
d(['Extreme Lead'], 'maximum-gain lead — compressed, endless sustain')
d(['R-Fire Vintage'], 'Mesa Rectifier vintage mode — fat 90s alternative/grunge gain')
d(['R-Fire Modern'], 'Mesa Rectifier modern mode — aggressive scooped nu-metal chunk')
d(['T-Amp Lead'], 'Hughes & Kettner TriAmp lead — refined German high gain')
d(['Core Metal'], 'scooped ultra-tight modern metal rhythm')
d(['Custom'], 'adjustable custom voice — only when nothing above fits better')
d(['Bogner Uber'], 'Bogner Uberschall — crushing modern German high gain, djent/metalcore')
d(['Orange Rocker'], 'Orange — thick mid-forward British grind, stoner/doom')
// Bass amp voices (KATANA Bass / GO bass / WAZA-AIR Bass).
d(['Vintage'], 'warm old-school bass tone — round lows, soft top, Motown to classic rock')
d(['Modern'], 'bright hi-fi bass voice — tight lows, present top, slap and modern rock')
d(['Flat'], 'uncoloured bass voice — the instrument as it is')
d(['Super Flat'], 'completely transparent full-range voice')
d(['Drive'], 'driven bass amp voice — grit built into the amp stage')

// ── Boosters / OD / DS ──────────────────────────────────────────────────────
d(['Mid Boost'], 'mid-forward clean boost — thickens a lead, pushes an amp harder without fizz')
d(['Clean Boost', 'Booster'], 'transparent level push — louder, not dirtier')
d(['Treble Boost'], 'vintage treble booster — brightens a dark amp, Brian May/early Clapton trick')
d(['Crunch OD'], 'amp-like light overdrive — edge-of-breakup grit')
d(['Natural OD', 'Natural'], 'transparent low-gain overdrive — keeps the guitar and amp character')
d(['Warm OD'], 'smooth dark overdrive — rounds off highs, jazzy/bluesy push')
d(['Blues Drive', 'Blues OD'], 'BOSS BD-2 Blues Driver — dynamic, gritty, cleans up with picking; blues and roots')
d(['Overdrive'], 'BOSS OD-1 — the classic mild overdrive, smooth vintage push')
d(['T-Scream'], 'Ibanez Tube Screamer — mid-hump tightener; low drive in front of a gained amp for metal leads')
d(['Turbo OD'], 'BOSS OD-2 — hotter, fuller overdrive')
d(['Distortion'], 'BOSS DS-1 — classic hard-clipped distortion, Nirvana/Satriani')
d(['Fat DS'], 'thick distortion with boosted lows — fat wall-of-sound rhythm')
d(['Metal DS'], 'high-gain metal distortion voice')
d(['Rat'], 'ProCo RAT — gritty sagging distortion between fuzz and OD; 80s/90s alt-rock')
d(['Guv DS'], "Marshall Guv'nor — British amp-in-a-box distortion")
d(['DST Plus', 'DST+'], 'MXR Distortion+ — raw soft-clipped early-metal/punk distortion, Randy Rhoads')
d(['Metal Zone'], 'BOSS MT-2 — heavily scooped saturated metal distortion')
d(['Metal Core'], 'BOSS ML-2 — brutal tight modern metal distortion')
d(['HM-2'], "BOSS HM-2 — the Swedish 'chainsaw' death-metal voice, all knobs dimed")
d(["'60s Fuzz"], 'Fuzz Face — vintage germanium fuzz, Hendrix')
d(['Muff Fuzz'], 'Big Muff — thick sustaining wall-of-fuzz, Gilmour leads/Smashing Pumpkins')
d(['Oct Fuzz'], 'octave-up fuzz — Hendrix Octavia sputter')
d(['Centa OD'], 'Klon Centaur — transparent boost/low-gain OD; pushes a cranked amp harder, NOT a general-purpose dirt box')
// Bass drives.
d(['Bass OD'], 'bass overdrive — grit that keeps the low end intact')
d(['Bass DS'], 'bass distortion — heavier clipping, lows preserved')
d(['Bass MT'], 'Metal Zone voiced for bass — scooped heavy saturation')
d(['Bass Fuzz'], 'bass fuzz — synthy vintage sputter with the lows kept')
d(['Bass DRV', 'HiBand DRV', 'HIBAND DRV'], 'drives only the upper band, low end stays clean and solid — grit without mud')
d(['Bass DI'], 'DI-style preamp grit — SansAmp-flavoured console crunch')
d(['AB-DIST'], 'aggressive full-range bass distortion')

// ── Mod / FX ────────────────────────────────────────────────────────────────
d(['Chorus'], 'thickening shimmer — 80s cleans, Come As You Are, dreamy arpeggios')
d(['Phaser'], 'swirling phase sweep — funk rhythm, Gilmour Breathe')
d(['Phaser 90E', 'Phase 90E'], 'MXR Phase 90 — the classic one-knob phaser, Van Halen swirl')
d(['Flanger'], 'jet-engine sweep — Barracuda, Unchained')
d(['Flanger 117E'], 'MXR M-117 flanger — thick studio jet sweep')
d(['Tremolo'], 'volume pulse — surf, spaghetti western, vintage amp throb')
d(['Rotary'], 'Leslie rotating-speaker swirl — organ-like doppler')
d(['Uni-V'], 'Uni-Vibe — watery throbbing modulation, Hendrix Machine Gun')
d(['Vibrato'], 'true pitch wobble')
d(['Slicer'], 'rhythmic gated chopping of the signal')
d(['Ring Mod'], 'metallic inharmonic ring modulation — experimental textures')
d(['Humanizer'], 'vowel formant filter — talk-box-like ah/ee shapes')
d(['Comp', 'Compressor'], 'evens picking dynamics — tight funk, country chicken-pickin, sustain for cleans')
d(['Limiter'], 'caps peaks without squeezing the whole signal')
d(['T.Wah', 'T. Wah'], 'touch wah — envelope follows picking attack, auto-funk')
d(['Auto Wah'], 'LFO-driven wah sweep — hands-free rhythmic quack')
d(['Pedal Wah'], 'cocked-wah/manual wah voice — fixed vocal filter sweep')
d(['Wah 95E'], 'Cry Baby 95Q wah voice')
d(['Octave'], 'adds a note an octave down — fattens single-note lines')
d(['Heavy Octave'], 'thicker low-octave doubling')
d(['Pitch Shifter'], 'parallel pitch shift — detune spread or fixed-interval doubling')
d(['Harmonist'], 'key-aware harmony line — Iron Maiden/Thin Lizzy twin leads')
d(['Pedal Bend'], 'whammy-style pitch dive/rise')
d(['Slow Gear'], 'auto volume swells — violin-like fade-in attack')
d(['Wave Synth'], 'synth-texture generator driven by the guitar')
d(['Guitar Sim'], 'simulates other pickup/guitar types')
d(['AC Guitar Sim', 'AC.Guitar Sim'], 'electric-to-acoustic body simulation')
d(['AC Processor', 'AC.Processor'], 'acoustic tone shaper — for the Acoustic amp voice or piezo input')
d(['Sub OD/DS'], 'a second OD/DS running in an FX slot — stacked dirt stages')
d(['Graphic EQ'], 'fixed-band EQ — surgical cuts and boosts, mid-scoop or presence bump')
d(['Parametric EQ'], 'sweepable EQ — find and cut a problem frequency')
d(['Tone Modify'], 'preset tone-character shaper')
d(['Tera Echo'], 'BOSS TE-2 — ambient smeared echo wash, not a rhythmic delay')
d(['Overtone'], 'adds upper/lower harmonic sheen around the note')
d(['DC-30'], 'analog chorus-echo combo — warm vintage modulated repeats')
// Bass FX.
d(['Enhancer'], 'sharpens attack and presence — definition for busy mixes')
d(['Bass Simulator'], 'guitar-to-bass simulation')
d(['Defretter'], 'fretless-bass simulation — Jaco slide and bloom')
d(['Bass Synth'], 'synth-bass texture generator')

// ── Delays ──────────────────────────────────────────────────────────────────
d(['Digital'], 'clean precise repeats — modern, transparent, the default choice')
d(['Analog'], 'dark warm decaying repeats — BBD pedal character, blends behind the note')
d(['Tape Echo'], 'Space Echo — wobbly saturated vintage repeats, rockabilly slapback to Gilmour')
d(['Pan'], 'ping-pong repeats bouncing left/right (stereo rigs only)')
d(['Stereo'], 'independent left/right delay lines (stereo rigs only)')
d(['Reverse'], 'backwards repeats — psychedelic swells')
d(['Modulate'], 'chorused repeats — wide, lush, ambient lead beds')
d(['SDE-3000'], 'Roland SDE-3000 — pristine 80s studio rack delay, EVH Cathedral')

// ── Reverbs ─────────────────────────────────────────────────────────────────
// NOTE: 'Modulate' the delay and 'Modulate' the reverb normalize to the same key.
// The delay entry above wins in D; describeToneName() special-cases the reverb
// via the category argument.
d(['Room'], 'small natural space — subtle glue, keeps things tight')
d(['Hall'], 'large lush space — big ballad washes')
d(['Plate'], 'bright studio-plate sheen — polished leads and vocals-style smoothness')
d(['Spring'], 'boingy amp-tank reverb — surf, rockabilly, vintage combo character')

const MODULATE_REVERB = 'chorused shimmering reverb wash — ambient pads'

export type ToneNameCategory = 'amp' | 'booster' | 'fx' | 'delay' | 'reverb'

/**
 * The one-line character description for an amp/effect name, or undefined for a
 * name with no entry. `category` disambiguates the few names that exist in more
 * than one list (Modulate is both a delay and a reverb).
 */
export function describeToneName(name: string, category: ToneNameCategory): string | undefined {
  if (category === 'reverb' && normalize(name) === 'MODULATE') return MODULATE_REVERB
  const key = normalize(name)
  const hit = D[key]
  if (hit) return hit
  // "Clean (Variation)" etc. — describe as the base voice's hotter alternate.
  const variation = key.match(/^(.+)VARIATION$/)
  if (variation) {
    const base = D[variation[1]]
    if (base) return `${base} (alternate voicing — hotter/tighter take on it)`
  }
  return undefined
}

/**
 * Render a vocabulary list for the system prompt: `Name — description | Name —
 * description | Name`. Names without an entry render bare. One line per
 * category keeps the prompt structure the model already knows.
 */
export function describedList(names: readonly string[], category: ToneNameCategory): string {
  return names
    .map(n => {
      const desc = describeToneName(n, category)
      return desc ? `${n} — ${desc}` : n
    })
    .join(' | ')
}
