// MkI writer — the VERIFIED reference implementation.
//
// Offsets are from docs/kat-format.md § Offset map (channel A shown; 2797-byte
// MkI .kat), proven from bytecode + 20 samples. This is the layout every other
// generation's writer will mirror once its own section+offset table is
// extracted, so it doubles as the shape of the MkII stub (mk1's structure with
// mk2's offsets).
//
// SCOPE: places the core verified params — patch name, both preamp channels,
// the OD/booster slot, FX1/FX2 type, delay, reverb. The long tail (comp, EQ
// section, FX sub-parameter trees, speaker/mic, noise suppressors) is left at
// image defaults and marked TODO; those offsets are known but their intent
// modelling isn't, and a half-guessed value is worse than the amp's default.

import type { TonePatch, AmpChannel } from '../intent'
import { AMP_BY_NAME, OD_DS_BY_NAME, FX_BY_NAME, DELAY_BY_NAME, REVERB_BY_NAME } from '../enums'
import {
  type PatchWriter, type PatchImage,
  registerWriter, putByte, scaleKnob, writePatchName,
} from '../writer'

const MK1_IMAGE_SIZE = 2797

// Verified channel-A offsets (kat-format.md). Channel B mirrors A at +48/+... —
// the map gives B's anchors explicitly rather than assuming a fixed delta.
const OFF = {
  OUTPUT_SELECT: 16,
  OD_DS_ON_OFF: 48,
  OD_DS_TYPE: 49,
  OD_DRIVE: 50,
  OD_TONE: 52,
  OD_LEVEL: 53, // solo/level cluster 50–56; level anchor per kat-format.md
  PREAMP_A_ON_OFF: 80,
  PREAMP_A_TYPE: 81,
  PREAMP_A_GAIN: 82,
  PREAMP_A_BASS: 84,
  PREAMP_A_MIDDLE: 85,
  PREAMP_A_TREBLE: 86,
  PREAMP_A_PRESENCE: 87,
  PREAMP_A_LEVEL: 88,
  PREAMP_B_ON_OFF: 128,
  PREAMP_B_TYPE: 129,
  PREAMP_B_GAIN: 130,
  PREAMP_B_BASS: 132,
  PREAMP_B_MIDDLE: 133,
  PREAMP_B_TREBLE: 134,
  PREAMP_B_PRESENCE: 135,
  PREAMP_B_LEVEL: 136,
  FX1_ON_OFF: 192,
  FX1_FX_TYPE: 193,
  FX2_ON_OFF: 460,
  FX2_FX_TYPE: 461,
  DELAY_ON_OFF: 736,
  DELAY_TYPE: 737,
  DELAY_FEEDBACK: 739, // 738–746 time/f-back/hi-cut/level/mix; f-back anchor
  DELAY_LEVEL: 742,
  REVERB_ON_OFF: 784,
  REVERB_TYPE: 785,
  REVERB_LEVEL: 792, // 786–794 time/predelay/cuts/density/level; level anchor
} as const

/** Look up an enum byte by name, throwing if the model somehow sent a name not
 *  in the verified table (should be impossible via the typed schema, but the
 *  writer is the last line of defence before bytes hit a file). */
function enumByte(map: Map<string, number>, name: string, kind: string): number {
  const v = map.get(name)
  if (v === undefined) throw new Error(`unknown ${kind}: "${name}"`)
  return v
}

function writeChannel(image: PatchImage, ch: AmpChannel, off: {
  ON: number; TYPE: number; GAIN: number; BASS: number; MIDDLE: number
  TREBLE: number; PRESENCE: number; LEVEL: number
}): void {
  putByte(image, off.ON, 1)
  putByte(image, off.TYPE, enumByte(AMP_BY_NAME, ch.type, 'amp type'))
  putByte(image, off.GAIN, scaleKnob(ch.gain))
  putByte(image, off.BASS, scaleKnob(ch.bass))
  putByte(image, off.MIDDLE, scaleKnob(ch.middle))
  putByte(image, off.TREBLE, scaleKnob(ch.treble))
  putByte(image, off.PRESENCE, scaleKnob(ch.presence))
  putByte(image, off.LEVEL, scaleKnob(ch.level))
}

class Mk1Writer implements PatchWriter {
  readonly generation = 'mk1' as const
  readonly imageSize = MK1_IMAGE_SIZE

  writeImage(patch: TonePatch): PatchImage {
    const image = new Uint8Array(MK1_IMAGE_SIZE)

    writePatchName(image, patch.name)

    // Preamp A (always present).
    writeChannel(image, patch.ampA, {
      ON: OFF.PREAMP_A_ON_OFF, TYPE: OFF.PREAMP_A_TYPE, GAIN: OFF.PREAMP_A_GAIN,
      BASS: OFF.PREAMP_A_BASS, MIDDLE: OFF.PREAMP_A_MIDDLE, TREBLE: OFF.PREAMP_A_TREBLE,
      PRESENCE: OFF.PREAMP_A_PRESENCE, LEVEL: OFF.PREAMP_A_LEVEL,
    })

    // Preamp B — off unless the patch is dual-amp. Leaving ON=0 matches the
    // 18/20 factory single-amp patches.
    if (patch.ampB) {
      writeChannel(image, patch.ampB, {
        ON: OFF.PREAMP_B_ON_OFF, TYPE: OFF.PREAMP_B_TYPE, GAIN: OFF.PREAMP_B_GAIN,
        BASS: OFF.PREAMP_B_BASS, MIDDLE: OFF.PREAMP_B_MIDDLE, TREBLE: OFF.PREAMP_B_TREBLE,
        PRESENCE: OFF.PREAMP_B_PRESENCE, LEVEL: OFF.PREAMP_B_LEVEL,
      })
    }

    // OD/DS/booster slot.
    putByte(image, OFF.OD_DS_ON_OFF, patch.booster.on ? 1 : 0)
    if (patch.booster.on) {
      putByte(image, OFF.OD_DS_TYPE, enumByte(OD_DS_BY_NAME, patch.booster.type, 'OD/DS type'))
      putByte(image, OFF.OD_DRIVE, scaleKnob(patch.booster.drive))
      putByte(image, OFF.OD_TONE, scaleKnob(patch.booster.tone))
      putByte(image, OFF.OD_LEVEL, scaleKnob(patch.booster.level))
    }

    // FX1 / FX2 — type only for now; sub-param trees are per-type and untraced.
    if (patch.fx1?.on) {
      putByte(image, OFF.FX1_ON_OFF, 1)
      putByte(image, OFF.FX1_FX_TYPE, enumByte(FX_BY_NAME, patch.fx1.type, 'FX type'))
    }
    if (patch.fx2?.on) {
      putByte(image, OFF.FX2_ON_OFF, 1)
      putByte(image, OFF.FX2_FX_TYPE, enumByte(FX_BY_NAME, patch.fx2.type, 'FX type'))
    }

    // Delay.
    putByte(image, OFF.DELAY_ON_OFF, patch.delay.on ? 1 : 0)
    if (patch.delay.on) {
      putByte(image, OFF.DELAY_TYPE, enumByte(DELAY_BY_NAME, patch.delay.type, 'delay type'))
      putByte(image, OFF.DELAY_FEEDBACK, scaleKnob(patch.delay.feedback))
      putByte(image, OFF.DELAY_LEVEL, scaleKnob(patch.delay.level))
      // TODO: DELAY time is a multi-byte (INTEGER_2x7) param at 738; place it
      // once the 2x7 encoder + exact time range are pinned from bytecode.
    }

    // Reverb.
    putByte(image, OFF.REVERB_ON_OFF, patch.reverb.on ? 1 : 0)
    if (patch.reverb.on) {
      putByte(image, OFF.REVERB_TYPE, enumByte(REVERB_BY_NAME, patch.reverb.type, 'reverb type'))
      putByte(image, OFF.REVERB_LEVEL, scaleKnob(patch.reverb.level))
      // TODO: REVERB time (786) is also 2x7 — same follow-up as delay time.
    }

    return image
  }
}

registerWriter(new Mk1Writer())

export {}
