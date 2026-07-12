// KATANA MkI liveset writer — emits the "GT" liveset (device "GT", version
// "1.0.0") the original 2019 KATANA / Katana Librarian uses.
//
// UNLIKE every other generation, MkI does NOT use the hex byte-section `.tsl`.
// Its patches are a flat map of ~1500 NAMED decimal parameters
// (`preamp_a_gain: 70`), wrapped in a `patchList` with `liveSetData`, not the
// `data:[[{paramSet}]]` envelope (docs/mk1-format-notes.md). So this writer has
// its own shape: clone a real patch's params, overlay the intent fields by NAME,
// and wrap it in the GT envelope.
//
// Enum params use the CONTIGUOUS option index of the shared name lists
// (lib/patch/enums.ts) — NOT the `.kat` byte values the flat-image writer uses,
// which diverge for FX/reverb. Verified against the real export.

import type { TonePatch, AmpChannel } from '../intent'
import { AMP_NAMES, OD_DS_NAMES, FX_NAMES, DELAY_NAMES, REVERB_NAMES } from '../enums'
import { templatePatch, templateLiveSetData, MK1_DEVICE, MK1_VERSION, type Mk1Patch } from '../mk1/template'

const clampInt = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : Math.round(v))
const knob = (v: number) => clampInt(v, 0, 100)

// MkI's GT liveset stores enum params as the CONTIGUOUS option index (0..N) of
// the name list — NOT the `.kat` byte value the flat-image writer uses (those
// diverge for FX/reverb). Verified against the real export: preamp_a_type=11 =
// AMP_NAMES[11] (Crunch), reverb_type=3 = REVERB_NAMES[3] (Spring).
function enumIndex(list: readonly string[], name: string, kind: string): number {
  const i = list.indexOf(name)
  if (i < 0) throw new Error(`unknown KATANA MkI ${kind}: "${name}"`)
  return i
}

/** Set a named param, asserting it exists in the template (a typo would silently
 *  add a junk key the amp ignores — catch it here instead). */
function set(params: Record<string, number>, name: string, value: number): void {
  if (!(name in params)) throw new Error(`KATANA MkI param not in template: ${name}`)
  params[name] = value
}

/** Overlay one preamp channel's named params (A or B share the suffix set). */
function writeChannel(params: Record<string, number>, ch: AmpChannel, prefix: 'preamp_a' | 'preamp_b'): void {
  set(params, `${prefix}_type`, enumIndex(AMP_NAMES, ch.type, 'amp type'))
  set(params, `${prefix}_gain`, knob(ch.gain))
  set(params, `${prefix}_bass`, knob(ch.bass))
  set(params, `${prefix}_middle`, knob(ch.middle))
  set(params, `${prefix}_treble`, knob(ch.treble))
  set(params, `${prefix}_presence`, knob(ch.presence))
  set(params, `${prefix}_level`, knob(ch.level))
}

/** Build a single MkI patch object from tone intent, overlaid on the template. */
export function buildMk1Patch(patch: TonePatch): Mk1Patch {
  const p = templatePatch()
  const params = p.params

  const name = patch.name.slice(0, 16)
  p.name = name
  p.logPatchName = `KATANA:${name}`

  // Preamp A (always present). Preamp B is left at the template's genuine routing
  // — MkI's dual-amp channel enable isn't modelled, same scope as the .kat writer.
  writeChannel(params, patch.ampA, 'preamp_a')

  // OD / DS booster slot.
  set(params, 'od_ds_on_off', patch.booster.on ? 1 : 0)
  if (patch.booster.on) {
    set(params, 'od_ds_type', enumIndex(OD_DS_NAMES, patch.booster.type, 'OD/DS type'))
    set(params, 'od_ds_drive', knob(patch.booster.drive))
    set(params, 'od_ds_tone', knob(patch.booster.tone))
    set(params, 'od_ds_effect_level', knob(patch.booster.level))
  }

  // FX1 / FX2 — type + on/off only; per-FX sub-trees stay genuine (as .kat writer).
  set(params, 'fx1_on_off', patch.fx1?.on ? 1 : 0)
  if (patch.fx1?.on) set(params, 'fx1_fx_type', enumIndex(FX_NAMES, patch.fx1.type, 'FX type'))
  set(params, 'fx2_on_off', patch.fx2?.on ? 1 : 0)
  if (patch.fx2?.on) set(params, 'fx2_fx_type', enumIndex(FX_NAMES, patch.fx2.type, 'FX type'))

  // Delay — 2-byte (hi/lo, 7-bit) time, like the modern format but decimal here.
  set(params, 'delay_on_off', patch.delay.on ? 1 : 0)
  if (patch.delay.on) {
    set(params, 'delay_type', enumIndex(DELAY_NAMES, patch.delay.type, 'delay type'))
    const ms = clampInt(patch.delay.timeMs, 1, 2000)
    set(params, 'delay_delay_time_h', (ms >> 7) & 0x7f)
    set(params, 'delay_delay_time_l', ms & 0x7f)
    set(params, 'delay_f_back', knob(patch.delay.feedback))
    set(params, 'delay_effect_level', knob(patch.delay.level))
  }

  // Reverb — single decimal TIME (linear seconds approximation, one sample/type).
  set(params, 'reverb_on_off', patch.reverb.on ? 1 : 0)
  if (patch.reverb.on) {
    set(params, 'reverb_type', enumIndex(REVERB_NAMES, patch.reverb.type, 'reverb type'))
    set(params, 'reverb_time', clampInt(patch.reverb.timeS * 10, 1, 100))
    set(params, 'reverb_effect_level', knob(patch.reverb.level))
  }

  return p
}

/** Build the KATANA MkI "GT" liveset object for one patch. */
export function writeMk1Tsl(patch: TonePatch): object {
  const liveSetData = templateLiveSetData()
  liveSetData.name = patch.name.slice(0, 16)
  return {
    device: MK1_DEVICE,     // 'GT'
    version: MK1_VERSION,   // '1.0.0'
    liveSetData,
    patchList: [buildMk1Patch(patch)],
  }
}
