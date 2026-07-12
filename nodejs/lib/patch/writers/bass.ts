// KATANA BASS writer (desktop head/combo line) — emits a .tsl liveset
// (device "KATANA BASS", formatRev "0000", UserPatch% block keys).
//
// This rig doesn't match the guitar tone shape one-to-one, so the mapping is
// deliberate (docs/katana-bass-format-notes.md):
//   • There is NO amp block. The "amp" is the front-panel Knob block — KNOB TYPE
//     is the preamp voice (VINTAGE/MODERN), plus GAIN/VOLUME and a 4-band EQ.
//   • The booster maps to the Drive stage.
//   • Effects are stored in three "color" variations per block; we overlay
//     variation 1 (green) and point the SelColorSw COLOR bytes at it.
//   • KATANA BASS has ONE mod slot (Fx1) + ONE combined slot (Fx2), where Fx2 is
//     mod-2 OR delay OR reverb — only one at a time. We fill that slot by
//     priority: delay > reverb > fx2, so the most defining time effect wins.
//
// Clone a real patch's 34-block golden template and overlay only the intent
// fields; comp, blend, the other variations, and EQ scaffolding stay genuine.

import type { TonePatch } from '../intent'
import {
  BASS_AMP_BY_NAME, BASS_DRIVE_BY_NAME, BASS_FX_BY_NAME, BASS_DELAY_BY_NAME, BASS_REVERB_BY_NAME,
} from '../bass/enums'
import { templateSections } from '../bass/template'
import { type SectionMap, toTsl } from '../tsl'

const BASS_META = { formatRev: '0000', device: 'KATANA BASS', name: '', keyPrefix: 'UserPatch%' }

// Verified block byte offsets (docs/katana-bass-format-notes.md).
const O = {
  amp:   { type: 2, gain: 3, volume: 4, bass: 6, lowMid: 7, highMid: 8, treble: 9 }, // Knob block
  sel:   { driveSw: 2, driveCol: 3, efx1Sw: 12, efx1Col: 13, efx2Sw: 14, efx2Col: 15 }, // SelColorSw
  drive: { type: 0, drive: 1, tone: 3, level: 4 },
  fx1:   { type: 0 },
  fx2:   { sel: 0, fxType: 1, delayType: 2, reverbType: 3 },  // sel: 0=fx,1=delay,2=reverb
  delay: { time: 0, feedback: 2, level: 4 },                  // DelayDetail; time = 2-byte 7-bit
  reverb:{ time: 0, level: 6, timeOfs: -1 },                  // ReverbDetail
} as const

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : Math.round(v))
const knob = (v: number) => clamp(v, 0, 100)

function enumByte(map: Map<string, number>, name: string, kind: string): number {
  const v = map.get(name)
  if (v === undefined) throw new Error(`unknown KATANA BASS ${kind}: "${name}"`)
  return v
}

function put(s: SectionMap, block: string, offset: number, value: number): void {
  const arr = s.get(block)
  if (!arr) throw new Error(`KATANA BASS block not found: ${block}`)
  if (offset < 0 || offset >= arr.length) {
    throw new RangeError(`KATANA BASS offset ${offset} out of range in ${block} (${arr.length}B)`)
  }
  arr[offset] = clamp(value, 0, 127)
}

/** Write the 16-byte ASCII patch name into UserPatch%PatchName (offset 0). */
function writeName(s: SectionMap, name: string): void {
  const b = s.get('PatchName')
  if (!b) throw new Error('KATANA BASS PatchName block not found')
  for (let i = 0; i < 16; i++) {
    const code = i < name.length ? name.charCodeAt(i) : 0x20
    b[i] = code >= 0x20 && code <= 0x7e ? code : 0x20
  }
}

/** Build the KATANA BASS block map from tone intent, overlaid on the template. */
export function buildBassSections(patch: TonePatch): SectionMap {
  const s = templateSections()

  writeName(s, patch.name)

  // Amp = Knob panel. Preamp voice + gain/volume + 4-band EQ (bass/low-mid/
  // high-mid/treble). middle → low-mid, presence → high-mid.
  put(s, 'Knob', O.amp.type, enumByte(BASS_AMP_BY_NAME, patch.ampA.type, 'amp type'))
  put(s, 'Knob', O.amp.gain, knob(patch.ampA.gain))
  put(s, 'Knob', O.amp.volume, knob(patch.ampA.level))
  put(s, 'Knob', O.amp.bass, knob(patch.ampA.bass))
  put(s, 'Knob', O.amp.lowMid, knob(patch.ampA.middle))
  put(s, 'Knob', O.amp.highMid, knob(patch.ampA.presence))
  put(s, 'Knob', O.amp.treble, knob(patch.ampA.treble))

  // Booster → Drive (variation 1 / green). Enable + select colour 0 in SelColorSw.
  if (patch.booster.on) {
    put(s, 'SelColorSw', O.sel.driveSw, 1)
    put(s, 'SelColorSw', O.sel.driveCol, 0)
    put(s, 'Drive(1)', O.drive.type, enumByte(BASS_DRIVE_BY_NAME, patch.booster.type, 'drive type'))
    put(s, 'Drive(1)', O.drive.drive, knob(patch.booster.drive))
    put(s, 'Drive(1)', O.drive.tone, knob(patch.booster.tone))   // 0..100 → centered −50..+50
    put(s, 'Drive(1)', O.drive.level, knob(patch.booster.level))
  } else {
    put(s, 'SelColorSw', O.sel.driveSw, 0)
  }

  // Mod slot 1 → Fx1 (variation 1).
  if (patch.fx1?.on) {
    put(s, 'SelColorSw', O.sel.efx1Sw, 1)
    put(s, 'SelColorSw', O.sel.efx1Col, 0)
    const b = BASS_FX_BY_NAME.get(patch.fx1.type)
    if (b === undefined) put(s, 'SelColorSw', O.sel.efx1Sw, 0)  // no bass equivalent → off
    else put(s, 'Fx1(1)', O.fx1.type, b)
  } else {
    put(s, 'SelColorSw', O.sel.efx1Sw, 0)
  }

  // Combined slot 2 (Fx2) = mod-2 OR delay OR reverb — one only. Priority:
  // delay > reverb > fx2. Enable + colour 0 when used.
  const useDelay = patch.delay.on
  const useReverb = !useDelay && patch.reverb.on
  const useFx2 = !useDelay && !useReverb && !!patch.fx2?.on
  if (useDelay || useReverb || useFx2) {
    put(s, 'SelColorSw', O.sel.efx2Sw, 1)
    put(s, 'SelColorSw', O.sel.efx2Col, 0)
  } else {
    put(s, 'SelColorSw', O.sel.efx2Sw, 0)
  }

  if (useDelay) {
    put(s, 'Fx2(1)', O.fx2.sel, 1) // delay
    put(s, 'Fx2(1)', O.fx2.delayType, enumByte(BASS_DELAY_BY_NAME, patch.delay.type, 'delay type'))
    const ms = clamp(patch.delay.timeMs, 1, 2000)
    put(s, 'DelayDetail', O.delay.time + 0, (ms >> 7) & 0x7f)   // 2-byte 7-bit pair
    put(s, 'DelayDetail', O.delay.time + 1, ms & 0x7f)
    put(s, 'DelayDetail', O.delay.feedback, knob(patch.delay.feedback))
    put(s, 'DelayDetail', O.delay.level, knob(patch.delay.level))
  } else if (useReverb) {
    put(s, 'Fx2(1)', O.fx2.sel, 2) // reverb
    put(s, 'Fx2(1)', O.fx2.reverbType, enumByte(BASS_REVERB_BY_NAME, patch.reverb.type, 'reverb type'))
    put(s, 'ReverbDetail', O.reverb.time, clamp(patch.reverb.timeS * 10, 1, 100) + O.reverb.timeOfs)
    put(s, 'ReverbDetail', O.reverb.level, knob(patch.reverb.level))
  } else if (useFx2) {
    const b = BASS_FX_BY_NAME.get(patch.fx2!.type)
    if (b === undefined) put(s, 'SelColorSw', O.sel.efx2Sw, 0)
    else { put(s, 'Fx2(1)', O.fx2.sel, 0); put(s, 'Fx2(1)', O.fx2.fxType, b) }
  }

  return s
}

/** Build the KATANA BASS .tsl liveset object for one patch. */
export function writeBassTsl(patch: TonePatch): object {
  return toTsl(buildBassSections(patch), { ...BASS_META, name: patch.name })
}
