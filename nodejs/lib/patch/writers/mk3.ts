// KATANA Gen 3 writer — emits a .tsl liveset (device "KATANA Gen3", formatRev
// "0000", PATCH% block keys).
//
// Same design as mk2: clone the golden template (mk3/template.ts — a real Gen 3
// patch's full block map) and overlay only the fields the tone intent controls.
// Offsets, byte encodings, and enum orderings are all VERIFIED against
// ground-truth exports (docs/gen3-format-notes.md).
//
// Chain: PATCH%SW = [booster, mod, fx, delay, delay2, reverb]. The two mod slots
// are FX(1) (MOD position) and FX(2) (FX position); we set the type byte and the
// SW flag, leaving the FX_DETAIL sub-params at the template's musical defaults.

import type { TonePatch, ModFx } from '../intent'
import {
  GEN3_AMP_BY_NAME, GEN3_BOOSTER_BY_NAME, GEN3_FX_BY_NAME,
  GEN3_DELAY_BY_NAME, GEN3_REVERB_BY_NAME,
} from '../mk3/enums'
import { templateSections } from '../mk3/template'
import { type SectionMap, toTsl } from '../tsl'
import { writePatchName as writeName16 } from '../writer'

const MK3_META = { formatRev: '0000', device: 'KATANA Gen3', name: '', keyPrefix: 'PATCH%' }

// Verified block byte offsets (docs/gen3-format-notes.md).
const O = {
  amp:     { type: 7, gain: 0, level: 1, bass: 2, mid: 3, treble: 4, presence: 5 },
  booster: { type: 0, drive: 1, tone: 3, level: 6 },
  delay:   { type: 0, time: 1, feedback: 5, level: 7 },  // time = 4 nibble-bytes @1..4
  reverb:  { type: 0, time: 2, level: 10 },
  sw:      { booster: 0, mod: 1, fx: 2, delay: 3, delay2: 4, reverb: 5 },
} as const

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : Math.round(v))
const knob = (v: number) => clamp(v, 0, 100)

function enumByte(map: Map<string, number>, name: string, kind: string): number {
  const v = map.get(name)
  if (v === undefined) throw new Error(`unknown Gen 3 ${kind}: "${name}"`)
  return v
}

function put(s: SectionMap, block: string, offset: number, value: number): void {
  const arr = s.get(block)
  if (!arr) throw new Error(`Gen 3 block not found: ${block}`)
  if (offset < 0 || offset >= arr.length) {
    throw new RangeError(`Gen 3 offset ${offset} out of range in ${block} (${arr.length}B)`)
  }
  arr[offset] = clamp(value, 0, 127)
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

/** Set one mod slot: type into FX(n), and the chain switch. Detail params stay
 *  at the template default for that type. */
function writeFx(s: SectionMap, fxBlock: string, swOffset: number, fx: ModFx | undefined): void {
  if (!fx?.on) { put(s, 'SW', swOffset, 0); return }
  put(s, 'SW', swOffset, 1)
  put(s, fxBlock, 0, enumByte(GEN3_FX_BY_NAME, fx.type, 'FX type'))
}

/** Build the Gen 3 block map from tone intent, overlaid on the golden template. */
export function buildMk3Sections(patch: TonePatch): SectionMap {
  const s = templateSections()

  // Patch name — 16 ASCII into PATCH%COM (bare key "COM").
  writeName16(s.get('COM')!, patch.name)

  // Amp.
  put(s, 'AMP', O.amp.type, enumByte(GEN3_AMP_BY_NAME, patch.ampA.type, 'amp type'))
  put(s, 'AMP', O.amp.gain, knob(patch.ampA.gain))
  put(s, 'AMP', O.amp.level, knob(patch.ampA.level))
  put(s, 'AMP', O.amp.bass, knob(patch.ampA.bass))
  put(s, 'AMP', O.amp.mid, knob(patch.ampA.middle))
  put(s, 'AMP', O.amp.treble, knob(patch.ampA.treble))
  put(s, 'AMP', O.amp.presence, knob(patch.ampA.presence))

  // Booster (chain slot 0).
  put(s, 'SW', O.sw.booster, patch.booster.on ? 1 : 0)
  if (patch.booster.on) {
    put(s, 'BOOSTER(1)', O.booster.type, enumByte(GEN3_BOOSTER_BY_NAME, patch.booster.type, 'booster type'))
    put(s, 'BOOSTER(1)', O.booster.drive, knob(patch.booster.drive))
    put(s, 'BOOSTER(1)', O.booster.tone, knob(patch.booster.tone))
    put(s, 'BOOSTER(1)', O.booster.level, knob(patch.booster.level))
  }

  // Mod slots: fx1 -> FX(1)/MOD, fx2 -> FX(2)/FX.
  writeFx(s, 'FX(1)', O.sw.mod, patch.fx1)
  writeFx(s, 'FX(2)', O.sw.fx, patch.fx2)

  // Delay (chain slot 3); leave DELAY2 (slot 4) off.
  put(s, 'SW', O.sw.delay2, 0)
  put(s, 'SW', O.sw.delay, patch.delay.on ? 1 : 0)
  if (patch.delay.on) {
    put(s, 'DELAY(1)', O.delay.type, enumByte(GEN3_DELAY_BY_NAME, patch.delay.type, 'delay type'))
    putDelayTime(s, patch.delay.timeMs)
    put(s, 'DELAY(1)', O.delay.feedback, knob(patch.delay.feedback))
    put(s, 'DELAY(1)', O.delay.level, knob(patch.delay.level))
  }

  // Reverb (chain slot 5). REVERB_TIME is a single byte, 1..100; map seconds*10.
  put(s, 'SW', O.sw.reverb, patch.reverb.on ? 1 : 0)
  if (patch.reverb.on) {
    put(s, 'REVERB(1)', O.reverb.type, enumByte(GEN3_REVERB_BY_NAME, patch.reverb.type, 'reverb type'))
    put(s, 'REVERB(1)', O.reverb.time, clamp(patch.reverb.timeS * 10, 1, 100))
    put(s, 'REVERB(1)', O.reverb.level, knob(patch.reverb.level))
  }

  return s
}

/** Build the Gen 3 .tsl liveset object for one patch. */
export function writeMk3Tsl(patch: TonePatch): object {
  return toTsl(buildMk3Sections(patch), { ...MK3_META, name: patch.name })
}
