// .tsl liveset assembly.
//
// The .tsl is BOSS Tone Studio's JSON liveset. Its exact shape is taken from the
// Katana Librarian app's own export routine, so what we emit matches what the
// app writes byte-for-byte in structure:
//
//   { "formatRev": "0002", "device": "KATANA MkII", "name": "...",
//     "data": [ [ { "paramSet": { "PatchName": ["00",..], "Patch_0": [..], .. } } ] ] }
//
// A liveset is a COLLECTION of patches — `data[0]` is the patch array, each entry
// a { paramSet } whose keys are the section names. One patch → a single-entry
// array; the shape is identical for many.

/** A patch as named sections of raw bytes (section key → byte array). */
export type SectionMap = Map<string, Uint8Array>

/** Uppercase two-hex-digit encoding, matching the app's `String.format("%02X")`.
 *  Values are 7-bit (0–127) so never negative — no sign-extension to worry about. */
function hex(b: number): string {
  return (b & 0xff).toString(16).toUpperCase().padStart(2, '0')
}

export interface TslMeta {
  formatRev: string   // MkII = "0002"
  device: string      // MkII = "KATANA MkII"
  name: string        // liveset name
}

/** Build the .tsl JSON object for a single patch from its section map. */
export function toTsl(sections: SectionMap, meta: TslMeta): object {
  const paramSet: Record<string, string[]> = {}
  for (const [key, bytes] of sections) {
    paramSet[key] = Array.from(bytes, hex)
  }
  return {
    formatRev: meta.formatRev,
    device: meta.device,
    name: meta.name,
    data: [[{ paramSet }]],
  }
}

/** Serialise a .tsl object to the download string. */
export function tslString(tsl: object): string {
  return JSON.stringify(tsl)
}

/** A safe download filename for a liveset name. */
export function tslFilename(name: string): string {
  const base = name.trim().replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 32) || 'patch'
  return `${base}.tsl`
}
