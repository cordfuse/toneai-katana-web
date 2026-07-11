// KATANA:GO writer — emits a .tsl liveset (PATCH% block keys, formatRev "0000").
//
// GO is dual-mode: guitar and bass share ONE 30-block PATCH% layout, split only
// by the .tsl device string (KATANA:GO_guitarmode / _bassmode) and the enum
// vocabulary each mode exposes. Both modes run through the same core builder
// (buildGo); the mode config supplies the device string, the amp/booster/FX
// name→byte maps, and (bass only) the chain routing byte.
//
// Structurally a Gen 3 sibling: same SW-block chain (MOD = FX(1), FX = FX(2)),
// same 4-nibble delay TIME. GO-specific, verified against the app param model +
// a real guitar export (docs/go-format-notes.md): the NAME sits at COM offset 4;
// the AMP block is wider (AMP_TYPE @12); REVERB TIME carries a −1 display offset.
//
// GUITAR mode is 'verified' (round-trips a real export byte-for-byte). BASS mode
// is 'derived': the block layout is proven (shared with guitar), and the bass
// enums come from the app + its bass conversion map, but no real bass export has
// been round-tripped yet, so its confidence is gated (generations.ts 'gobass').

import type { TonePatch, ModFx } from '../intent'
import {
  GO_AMP_BY_NAME, GO_BOOSTER_BY_NAME, GO_FX_BY_NAME, GO_DELAY_BY_NAME, GO_REVERB_BY_NAME,
  GO_BASS_AMP_BY_NAME, GO_BASS_BOOSTER_BY_NAME, GO_BASS_FX_BY_NAME,
  GO_BASS_DELAY_BY_NAME, GO_BASS_REVERB_BY_NAME,
} from '../go/enums'
import { templateSections } from '../go/template'
import { type SectionMap, toTsl } from '../tsl'

// Verified block byte offsets (docs/go-format-notes.md, go/param-table.json).
const O = {
  com:     { name: 4 },                                              // 16 ASCII @4
  other:   { chain: 0 },
  amp:     { gain: 0, level: 1, bass: 3, mid: 4, treble: 5, presence: 10, type: 12 },
  booster: { type: 0, drive: 1, tone: 3, level: 6 },                 // TONE centered (−50..50)
  delay:   { type: 0, time: 1, feedback: 5, level: 7 },              // time = 4 nibble-bytes @1..4
  reverb:  { type: 0, time: 2, level: 10, timeOfs: -1 },
  sw:      { booster: 0, mod: 1, fx: 2, delay: 3, delay2: 4, reverb: 5 },
} as const

/** Per-mode configuration for the shared builder. */
interface ModeConfig {
  device: string
  amps: Map<string, number>
  boosters: Map<string, number>
  fx: Map<string, number>
  delays: Map<string, number>
  reverbs: Map<string, number>
  /** Bass sets a mode-valid chain routing byte; guitar keeps the template's. */
  chainByte?: number
}

const GUITAR: ModeConfig = {
  device: 'KATANA:GO_guitarmode',
  amps: GO_AMP_BY_NAME, boosters: GO_BOOSTER_BY_NAME, fx: GO_FX_BY_NAME,
  delays: GO_DELAY_BY_NAME, reverbs: GO_REVERB_BY_NAME,
}
const BASS: ModeConfig = {
  device: 'KATANA:GO_bassmode',
  amps: GO_BASS_AMP_BY_NAME, boosters: GO_BASS_BOOSTER_BY_NAME, fx: GO_BASS_FX_BY_NAME,
  delays: GO_BASS_DELAY_BY_NAME, reverbs: GO_BASS_REVERB_BY_NAME,
  chainByte: 7, // first bass-mode chain (guitar chains are 0–6, bass 7–8)
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : Math.round(v))
const knob = (v: number) => clamp(v, 0, 100)

function enumByte(map: Map<string, number>, name: string, kind: string, device: string): number {
  const v = map.get(name)
  if (v === undefined) throw new Error(`unknown ${device} ${kind}: "${name}"`)
  return v
}

function put(s: SectionMap, block: string, offset: number, value: number): void {
  const arr = s.get(block)
  if (!arr) throw new Error(`KATANA:GO block not found: ${block}`)
  if (offset < 0 || offset >= arr.length) {
    throw new RangeError(`KATANA:GO offset ${offset} out of range in ${block} (${arr.length}B)`)
  }
  arr[offset] = clamp(value, 0, 127)
}

/** Write the 16-byte ASCII patch name into PATCH%COM at offset 4, space-padded. */
function writeName(s: SectionMap, name: string): void {
  const com = s.get('COM')
  if (!com) throw new Error('KATANA:GO COM block not found')
  const base = O.com.name
  for (let i = 0; i < 16; i++) {
    const code = i < name.length ? name.charCodeAt(i) : 0x20
    com[base + i] = code >= 0x20 && code <= 0x7e ? code : 0x20
  }
}

/** DELAY_TIME is 4 bytes, one 4-bit nibble each, big-endian: ms 1..2000. */
function putDelayTime(s: SectionMap, ms: number): void {
  const v = clamp(ms, 1, 2000)
  const b = O.delay.time
  put(s, 'DELAY(1)', b + 0, (v >> 12) & 0xf)
  put(s, 'DELAY(1)', b + 1, (v >> 8) & 0xf)
  put(s, 'DELAY(1)', b + 2, (v >> 4) & 0xf)
  put(s, 'DELAY(1)', b + 3, v & 0xf)
}

/** Set one mod slot: type into FX(n) + the chain switch. Detail params stay at
 *  the template default (same limitation as Gen 3). */
function writeFx(s: SectionMap, cfg: ModeConfig, fxBlock: string, swOffset: number, fx: ModFx | undefined): void {
  if (!fx?.on) { put(s, 'SW', swOffset, 0); return }
  put(s, 'SW', swOffset, 1)
  put(s, fxBlock, 0, enumByte(cfg.fx, fx.type, 'FX type', cfg.device))
}

/** Build the GO block map from tone intent for a given mode, overlaid on the
 *  golden template (shared across modes — same block skeleton). */
function buildGo(patch: TonePatch, cfg: ModeConfig): SectionMap {
  const s = templateSections()

  writeName(s, patch.name)
  if (cfg.chainByte !== undefined) put(s, 'OTHER', O.other.chain, cfg.chainByte)

  // Amp (stored in-patch, unlike Air).
  put(s, 'AMP', O.amp.type, enumByte(cfg.amps, patch.ampA.type, 'amp type', cfg.device))
  put(s, 'AMP', O.amp.gain, knob(patch.ampA.gain))
  put(s, 'AMP', O.amp.level, knob(patch.ampA.level))
  put(s, 'AMP', O.amp.bass, knob(patch.ampA.bass))
  put(s, 'AMP', O.amp.mid, knob(patch.ampA.middle))
  put(s, 'AMP', O.amp.treble, knob(patch.ampA.treble))
  put(s, 'AMP', O.amp.presence, knob(patch.ampA.presence))

  // Booster / DRIVE (chain slot 0).
  put(s, 'SW', O.sw.booster, patch.booster.on ? 1 : 0)
  if (patch.booster.on) {
    put(s, 'BOOSTER', O.booster.type, enumByte(cfg.boosters, patch.booster.type, 'booster type', cfg.device))
    put(s, 'BOOSTER', O.booster.drive, knob(patch.booster.drive))
    put(s, 'BOOSTER', O.booster.tone, knob(patch.booster.tone))
    put(s, 'BOOSTER', O.booster.level, knob(patch.booster.level))
  }

  // Mod slots: fx1 → FX(1)/MOD, fx2 → FX(2)/FX.
  writeFx(s, cfg, 'FX(1)', O.sw.mod, patch.fx1)
  writeFx(s, cfg, 'FX(2)', O.sw.fx, patch.fx2)

  // Delay (chain slot 3); leave DELAY2 (slot 4) off.
  put(s, 'SW', O.sw.delay2, 0)
  put(s, 'SW', O.sw.delay, patch.delay.on ? 1 : 0)
  if (patch.delay.on) {
    put(s, 'DELAY(1)', O.delay.type, enumByte(cfg.delays, patch.delay.type, 'delay type', cfg.device))
    putDelayTime(s, patch.delay.timeMs)
    put(s, 'DELAY(1)', O.delay.feedback, knob(patch.delay.feedback))
    put(s, 'DELAY(1)', O.delay.level, knob(patch.delay.level))
  }

  // Reverb (chain slot 5). TIME is one byte with a −1 display offset; map s*10.
  put(s, 'SW', O.sw.reverb, patch.reverb.on ? 1 : 0)
  if (patch.reverb.on) {
    put(s, 'REVERB', O.reverb.type, enumByte(cfg.reverbs, patch.reverb.type, 'reverb type', cfg.device))
    put(s, 'REVERB', O.reverb.time, clamp(patch.reverb.timeS * 10, 1, 100) + O.reverb.timeOfs)
    put(s, 'REVERB', O.reverb.level, knob(patch.reverb.level))
  }

  return s
}

/** GO guitar-mode block map from tone intent. */
export function buildGoSections(patch: TonePatch): SectionMap {
  return buildGo(patch, GUITAR)
}

/** GO bass-mode block map from tone intent. */
export function buildGoBassSections(patch: TonePatch): SectionMap {
  return buildGo(patch, BASS)
}

/** GO guitar-mode .tsl liveset for one patch. */
export function writeGoTsl(patch: TonePatch): object {
  return toTsl(buildGoSections(patch), { formatRev: '0000', device: GUITAR.device, name: patch.name, keyPrefix: 'PATCH%' })
}

/** GO bass-mode .tsl liveset for one patch. */
export function writeGoBassTsl(patch: TonePatch): object {
  return toTsl(buildGoBassSections(patch), { formatRev: '0000', device: BASS.device, name: patch.name, keyPrefix: 'PATCH%' })
}
