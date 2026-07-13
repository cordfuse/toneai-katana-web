// Tier 2 — Gear. See docs/settings.md.
//
// Gear is MODEL BIAS ONLY. Nothing here reaches the patch writer or changes a
// single byte of the emitted .tsl. It steers what the model *asks* the writer
// to build ("Les Paul, bridge humbucker, E standard"), nothing more.
//
// Two lifetimes are tangled in the word "gear", and separating them is the
// whole design:
//
//   Instrument       persistent. You own it. Stored here.
//   Pickup position  per-request. You switch it per song, not per instrument.
//
// Storing the position on the instrument would mean opening Settings to play
// the neck pickup. So the instrument stores its pickup *configuration*; the
// composer exposes the *selector*, defaulted from the active instrument.

// Pickup types are kind-specific: a bass never carries a Filter-Style, a guitar
// never carries a Mudbucker. Some ids are shared by both (single-coil, stacked
// coil, active, piezo) and keep one id so switching kind doesn't lose them.
export type GuitarPickup =
  | 'single-coil' | 'p90' | 'lipstick' | 'foil' | 'vintage-bucker' | 'hot-humbucker'
  | 'mini-humbucker' | 'filter-style' | 'stacked-coil' | 'rail' | 'active' | 'pcb' | 'piezo'

export type BassPickup =
  | 'split-coil' | 'single-coil' | 'dual-coil' | 'soapbar' | 'mudbucker'
  | 'active' | 'stacked-coil' | 'piezo'

export type PickupType = GuitarPickup | BassPickup

/** A physical slot. 'none' means the slot exists on the body but is unloaded. */
export type PickupSlot = PickupType | 'none'

export type PickupPosition =
  | 'neck' | 'middle' | 'bridge'
  | 'neck+middle' | 'middle+bridge' | 'neck+bridge'  // neck+bridge: a Tele/LP middle position
  | 'all'

export const GUITAR_PICKUPS: { id: GuitarPickup; label: string }[] = [
  { id: 'single-coil', label: 'Single-Coil' },
  { id: 'p90', label: 'P-90 Style' },
  { id: 'lipstick', label: 'Lipstick Tube' },
  { id: 'foil', label: 'Foil Pickup' },
  { id: 'vintage-bucker', label: 'Vintage Bucker' },
  { id: 'hot-humbucker', label: 'Hot Humbucker' },
  { id: 'mini-humbucker', label: 'Mini-Humbucker' },
  { id: 'filter-style', label: 'Filter-Style' },
  { id: 'stacked-coil', label: 'Stacked Coil' },
  { id: 'rail', label: 'Rail Pickup' },
  { id: 'active', label: 'Active Pickup' },
  { id: 'pcb', label: 'PCB Pickup' },
  { id: 'piezo', label: 'Piezo Pickup' },
]

export const BASS_PICKUPS: { id: BassPickup; label: string }[] = [
  { id: 'split-coil', label: 'Split-Coil' },
  { id: 'single-coil', label: 'Single-Coil' },
  { id: 'dual-coil', label: 'Dual-Coil' },
  { id: 'soapbar', label: 'Soapbar' },
  { id: 'mudbucker', label: 'Mudbucker' },
  { id: 'active', label: 'Active Pickup' },
  { id: 'stacked-coil', label: 'Stacked Coil' },
  { id: 'piezo', label: 'Piezo Pickup' },
]

/** The catalogue for an instrument kind, plus the 'none' slot option. */
export function pickupsFor(kind: Instrument['kind']): { id: PickupSlot; label: string }[] {
  const list = kind === 'bass' ? BASS_PICKUPS : GUITAR_PICKUPS
  return [...list, { id: 'none' as const, label: 'None' }]
}

/** What a freshly-switched slot becomes. First entry of each catalogue. */
export function defaultPickup(kind: Instrument['kind']): PickupType {
  return kind === 'bass' ? 'split-coil' : 'single-coil'
}

/**
 * Re-map an instrument's slots when its kind changes. A guitar's Filter-Style
 * is not a thing a bass can have, so anything not valid for the new kind is
 * replaced with that kind's default.
 *
 * Slots explicitly set to 'none' stay 'none' — the user removed that pickup on
 * purpose, and refitting it on a kind switch would undo a deliberate choice.
 */
export function remapPickups(pickups: PickupSlot[], kind: Instrument['kind']): PickupSlot[] {
  const valid = new Set<string>(pickupsFor(kind).map(p => p.id))
  return pickups.map(p => (p === 'none' ? 'none' : valid.has(p) ? p : defaultPickup(kind)))
}

/**
 * A known instrument and the pickups it ships with, neck -> bridge.
 *
 * This is a SUGGESTION TABLE, not a closed enum. `archetype` stays free text —
 * the model resolves "Danelectro" or someone's boutique build fine, and a fixed
 * list would be a maintenance treadmill that still excludes someone's guitar.
 * What the table buys is the pickup pre-fill: picking "Les Paul" should not
 * then require hand-selecting two humbuckers.
 *
 * Names are the archetype the model reasons about, not a manufacturer SKU. A
 * Donner DLP-124 is, for tone purposes, a Les Paul; the datalist steers people
 * toward the name the model knows.
 */
export interface ModelPreset {
  name: string
  kind: Instrument['kind']
  pickups: PickupSlot[]
}

export const MODEL_CATALOG: ModelPreset[] = [
  // ── Guitars ──────────────────────────────────────────────────────────────
  { name: 'Stratocaster',      kind: 'guitar', pickups: ['single-coil', 'single-coil', 'single-coil'] },
  { name: 'Stratocaster (HSS)', kind: 'guitar', pickups: ['single-coil', 'single-coil', 'hot-humbucker'] },
  { name: 'Telecaster',        kind: 'guitar', pickups: ['single-coil', 'single-coil'] },
  { name: 'Esquire',           kind: 'guitar', pickups: ['single-coil'] },
  { name: 'Jazzmaster',        kind: 'guitar', pickups: ['single-coil', 'single-coil'] },
  { name: 'Jaguar',            kind: 'guitar', pickups: ['single-coil', 'single-coil'] },
  { name: 'Mustang',           kind: 'guitar', pickups: ['single-coil', 'single-coil'] },
  { name: 'Les Paul',          kind: 'guitar', pickups: ['vintage-bucker', 'vintage-bucker'] },
  { name: 'Les Paul Junior',   kind: 'guitar', pickups: ['p90'] },
  { name: 'Les Paul Special',  kind: 'guitar', pickups: ['p90', 'p90'] },
  { name: 'SG',                kind: 'guitar', pickups: ['vintage-bucker', 'vintage-bucker'] },
  { name: 'ES-335',            kind: 'guitar', pickups: ['vintage-bucker', 'vintage-bucker'] },
  { name: 'ES-175',            kind: 'guitar', pickups: ['vintage-bucker', 'vintage-bucker'] },
  { name: 'Casino',            kind: 'guitar', pickups: ['p90', 'p90'] },
  { name: 'Explorer',          kind: 'guitar', pickups: ['vintage-bucker', 'vintage-bucker'] },
  { name: 'Flying V',          kind: 'guitar', pickups: ['vintage-bucker', 'vintage-bucker'] },
  { name: 'Firebird',          kind: 'guitar', pickups: ['mini-humbucker', 'mini-humbucker'] },
  { name: 'PRS Custom 24',     kind: 'guitar', pickups: ['vintage-bucker', 'vintage-bucker'] },
  { name: 'Superstrat (HSH)',  kind: 'guitar', pickups: ['hot-humbucker', 'single-coil', 'hot-humbucker'] },
  { name: 'Ibanez RG',         kind: 'guitar', pickups: ['hot-humbucker', 'single-coil', 'hot-humbucker'] },
  { name: 'LTD EC-1000',       kind: 'guitar', pickups: ['active', 'active'] },
  { name: 'Schecter Hellraiser', kind: 'guitar', pickups: ['active', 'active'] },
  { name: 'Gretsch 6120',      kind: 'guitar', pickups: ['filter-style', 'filter-style'] },
  { name: 'Rickenbacker 330',  kind: 'guitar', pickups: ['single-coil', 'single-coil'] },
  { name: 'Danelectro',        kind: 'guitar', pickups: ['lipstick', 'lipstick'] },
  { name: 'Silvertone',        kind: 'guitar', pickups: ['foil', 'foil'] },
  { name: 'Acoustic-electric', kind: 'guitar', pickups: ['piezo'] },

  // ── Basses ───────────────────────────────────────────────────────────────
  { name: 'Precision Bass',    kind: 'bass', pickups: ['split-coil'] },
  { name: 'Jazz Bass',         kind: 'bass', pickups: ['single-coil', 'single-coil'] },
  { name: 'PJ Bass',           kind: 'bass', pickups: ['split-coil', 'single-coil'] },
  { name: 'Jaguar Bass',       kind: 'bass', pickups: ['split-coil', 'single-coil'] },
  { name: 'Mustang Bass',      kind: 'bass', pickups: ['split-coil'] },
  { name: 'Stingray',          kind: 'bass', pickups: ['dual-coil'] },
  { name: 'Stingray HH',       kind: 'bass', pickups: ['dual-coil', 'dual-coil'] },
  { name: 'Thunderbird',       kind: 'bass', pickups: ['dual-coil', 'dual-coil'] },
  { name: 'Rickenbacker 4003', kind: 'bass', pickups: ['single-coil', 'single-coil'] },
  { name: 'Höfner violin bass', kind: 'bass', pickups: ['single-coil', 'single-coil'] },
  { name: 'Gibson EB-0',       kind: 'bass', pickups: ['mudbucker'] },
  { name: 'Ibanez SR',         kind: 'bass', pickups: ['soapbar', 'soapbar'] },
  { name: 'Spector NS',        kind: 'bass', pickups: ['soapbar', 'soapbar'] },
  { name: 'Warwick Thumb',     kind: 'bass', pickups: ['soapbar', 'soapbar'] },
]

/** Datalist contents for a kind. */
export function modelsFor(kind: Instrument['kind']): ModelPreset[] {
  return MODEL_CATALOG.filter(m => m.kind === kind)
}

/**
 * Exact (case- and whitespace-insensitive) catalogue hit for a typed model name.
 * Anything else returns undefined and the user's pickup choices stand — a free
 * text field must never silently rewrite slots because someone typed a prefix.
 */
export function presetFor(kind: Instrument['kind'], name: string): ModelPreset | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  return MODEL_CATALOG.find(m => m.kind === kind && m.name.toLowerCase() === key)
}

export interface Instrument {
  id: string
  name: string                 // user's label: "the '59", "my 7-string"
  kind: 'guitar' | 'bass'
  archetype?: string           // "Les Paul", "Stratocaster", …
  pickups: PickupSlot[]        // slot order: neck -> bridge; 'none' = unloaded
}

export interface GearState {
  instruments: Instrument[]
  activeInstrumentId: string | null
}

const GEAR_KEY = 'toneai_gear'

export function defaultInstrument(): Instrument {
  return {
    id: crypto.randomUUID(),
    name: 'My guitar',
    kind: 'guitar',
    archetype: 'Stratocaster',
    pickups: ['single-coil', 'single-coil', 'single-coil'],
  }
}

export function loadGear(): GearState {
  if (typeof window === 'undefined') return { instruments: [], activeInstrumentId: null }
  try {
    const raw = localStorage.getItem(GEAR_KEY)
    if (!raw) return { instruments: [], activeInstrumentId: null }
    const parsed = JSON.parse(raw) as GearState
    if (!Array.isArray(parsed.instruments)) return { instruments: [], activeInstrumentId: null }
    // Migrate + repair on read. Instruments stored before the pickup catalogue
    // was broadened carry the old 'humbucker' id, and anything not valid for
    // the instrument's kind would render a blank <select> and reach the prompt
    // as `undefined`.
    const instruments = parsed.instruments.map(i => ({
      ...i,
      pickups: remapPickups(
        (i.pickups ?? []).map(p => (p === ('humbucker' as PickupSlot) ? 'vintage-bucker' : p)),
        i.kind,
      ),
    }))
    // An activeInstrumentId pointing at a deleted instrument would silently
    // drop gear from the prompt. Repair it on read.
    const active = instruments.some(i => i.id === parsed.activeInstrumentId)
      ? parsed.activeInstrumentId
      : (instruments[0]?.id ?? null)
    return { instruments, activeInstrumentId: active }
  } catch {
    return { instruments: [], activeInstrumentId: null }
  }
}

export function saveGear(state: GearState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(GEAR_KEY, JSON.stringify(state))
}

export function activeInstrument(state: GearState): Instrument | null {
  return state.instruments.find(i => i.id === state.activeInstrumentId) ?? null
}

/**
 * What the composer's position control holds. 'auto' means the model picks,
 * constrained to positionsFor(instrument).
 *
 * This is NOT stored on the Instrument. A stored "preferred position" would be
 * a default that is silently wrong for most songs: the position is a property
 * of the TONE, not of the guitar. Ask for Sultans of Swing and the answer is
 * neck+middle whatever your habits are.
 */
export type PositionChoice = PickupPosition | 'auto'

/** The pickups actually fitted, in neck -> bridge order. */
export function equippedPickups(i: Instrument): PickupType[] {
  return i.pickups.filter((p): p is PickupType => p !== 'none')
}

/**
 * Physical name of slot `idx` on a body with `len` slots. Slots are ordered
 * neck -> bridge, so the ends are always neck and bridge and anything between
 * is middle. A one-slot body is a bridge pickup by convention (Junior, Esquire).
 */
function slotPosition(idx: number, len: number): 'neck' | 'middle' | 'bridge' {
  if (len === 1) return 'bridge'
  if (idx === 0) return 'neck'
  if (idx === len - 1) return 'bridge'
  return 'middle'
}

/** Fitted pickups paired with the position each one physically occupies. */
function fitted(i: Instrument): { pos: 'neck' | 'middle' | 'bridge'; type: PickupType }[] {
  return i.pickups
    .map((type, idx) => ({ pos: slotPosition(idx, i.pickups.length), type }))
    .filter((s): s is { pos: 'neck' | 'middle' | 'bridge'; type: PickupType } => s.type !== 'none')
}

/**
 * Positions this instrument can actually select.
 *
 * Derived from WHICH slots are fitted, not merely how many. A body with only
 * its neck pickup loaded selects the neck — deriving from the count alone would
 * report a bridge pickup that isn't there.
 */
export function positionsFor(i: Instrument): PickupPosition[] {
  const f = fitted(i)
  if (f.length === 0) return []
  if (f.length === 1) return [f[0].pos]
  if (f.length === 2) {
    // Two fitted pickups: each alone, plus both together. The combined position
    // is named after the pair so the label stays honest for neck+bridge.
    const combo = `${f[0].pos}+${f[1].pos}` as PickupPosition
    return [f[0].pos, combo, f[1].pos]
  }
  return ['neck', 'neck+middle', 'middle', 'middle+bridge', 'bridge']
}

/** Human label for a position. */
export function positionLabel(pos: PickupPosition, pickupCount: number): string {
  // With exactly two pickups fitted, the combined position is just "Both".
  if (pickupCount === 2 && pos.includes('+')) return 'Both'
  switch (pos) {
    case 'neck': return 'Neck'
    case 'middle': return 'Middle'
    case 'bridge': return 'Bridge'
    case 'neck+middle': return 'Neck + middle'
    case 'middle+bridge': return 'Middle + bridge'
    case 'neck+bridge': return 'Neck + bridge'
    case 'all': return 'All'
  }
}

/** The pickup type sitting at a position, for the prompt descriptor. */
function pickupAt(i: Instrument, pos: PickupPosition): PickupType | null {
  // Combined positions blend two pickups and have no single type.
  return fitted(i).find(s => s.pos === pos)?.type ?? null
}

// How each type is named IN THE PROMPT. Lower case, and spelled the way a
// player would say it — this text is read by the model, not by a UI.
const PICKUP_LABEL: Record<PickupType, string> = {
  // guitar
  'single-coil': 'single-coil',
  p90: 'P-90',
  lipstick: 'lipstick-tube single-coil',
  foil: 'gold-foil',
  'vintage-bucker': 'vintage PAF-style humbucker',
  'hot-humbucker': 'high-output humbucker',
  'mini-humbucker': 'mini-humbucker',
  'filter-style': 'Filter’Tron-style humbucker',
  rail: 'rail humbucker',
  pcb: 'PCB pickup',
  // bass
  'split-coil': 'split-coil',
  'dual-coil': 'dual-coil',
  soapbar: 'soapbar',
  mudbucker: 'mudbucker',
  // shared
  'stacked-coil': 'stacked-coil',
  active: 'active',
  piezo: 'piezo',
}

/**
 * The ONLY thing gear contributes to the prompt.
 *
 *   { archetype: 'Les Paul', pickups: ['humbucker','humbucker'] } + 'bridge'
 *     -> "Les Paul, bridge humbucker"
 *
 * With no archetype, fall back to the electrical description alone.
 *
 * String count, tuning and gauge are deliberately absent: they describe what
 * you play, not how the amp is voiced.
 */
export function describeRig(i: Instrument, position: PickupPosition | undefined): string {
  const parts: string[] = []
  if (i.archetype?.trim()) parts.push(i.archetype.trim())

  const equipped = equippedPickups(i)
  if (equipped.length === 0) {
    // Every slot is 'none'. Say so rather than inventing a position — the model
    // must not be told about a pickup that isn't there.
    parts.push('no pickups fitted')
  } else if (position) {
    const type = pickupAt(i, position)
    const posLabel = positionLabel(position, equipped.length).toLowerCase()
    parts.push(type ? `${posLabel} ${PICKUP_LABEL[type]}` : `${posLabel} pickups`)
  } else {
    // NO POSITION CHOSEN — the 'auto' pill, which is the DEFAULT everyone is on.
    //
    // This used to emit nothing at all: a Les Paul with a P-90 in the neck and a
    // humbucker in the bridge was described to the model as, in full, "Les Paul".
    // So auto — which claims to let the model pick the position to suit the tone —
    // asked it to choose from a list it was never shown, and every pickup-dependent
    // decision (gain staging, and above all how much noise gate the guitar needs)
    // was made blind. A single coil hums; a humbucker doesn't; the model could not
    // tell which it was voicing for.
    //
    // Auto now means what it says: here is what is fitted, you choose.
    const list = fitted(i)
      .map(s => `${s.pos} ${PICKUP_LABEL[s.type]}`)
      .join(' / ')
    parts.push(`${list} — pick whichever position suits the part`)
  }

  const desc = parts.join(', ') || 'unspecified instrument'
  // kind: 'bass' is a UI affordance, not a capability claim. KATANA Bass is a
  // separate device family with a different amp enum and nothing in
  // kat-format.md covers it — never let a bass silently request a guitar patch.
  return i.kind === 'bass' ? `${desc} (BASS guitar)` : desc
}
