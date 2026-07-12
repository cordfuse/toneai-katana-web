// Golden template for the WAZA-AIR (guitar) writer. Same flat 2335-byte
// User%Patch image as KATANA:AIR (writers/air.ts), cloned from a real export
// (data/fixtures/waza-air-classic-rock.tsl, patch 0). Device string "WAZA-AIR".

import type { SectionMap } from '../tsl'
import templateData from './template.json'

interface TemplateFile { order: string[]; sections: Record<string, number[]> }
const TEMPLATE = templateData as unknown as TemplateFile

export const TEMPLATE_ORDER: readonly string[] = TEMPLATE.order

export function templateSections(): SectionMap {
  const m: SectionMap = new Map()
  for (const key of TEMPLATE.order) m.set(key, Uint8Array.from(TEMPLATE.sections[key]))
  return m
}
