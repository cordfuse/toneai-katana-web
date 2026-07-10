'use client'

// The generated-tone card + detail modal. A tone_patch stream event becomes a
// compact clickable card in the assistant message; clicking opens the modal
// with the full patch, the download, and a YouTube link. Modelled on
// mighty-ai-qr-web's QrCard/modal, adapted for KATANA .tsl patches.

import { useState } from 'react'
import type { TonePatchResult } from '@/lib/types'
import type { TonePatch } from '@/lib/patch/intent'

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
)
const YoutubeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.5-.4-5.2c-.3-.9-1-1.6-1.9-1.9C19 4.5 12 4.5 12 4.5s-7 0-8.7.4c-.9.3-1.6 1-1.9 1.9C1 8.5 1 12 1 12s0 3.5.4 5.2c.3.9 1 1.6 1.9 1.9 1.7.4 8.7.4 8.7.4s7 0 8.7-.4c.9-.3 1.6-1 1.9-1.9.4-1.7.4-5.2.4-5.2zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z"/></svg>
)
const AmpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="13" r="4"/><line x1="7" y1="7" x2="7" y2="7"/><line x1="17" y1="7" x2="17" y2="7"/></svg>
)
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
)

/** Trigger a .tsl download from the in-memory liveset string. */
function downloadTsl(tone: TonePatchResult) {
  const blob = new Blob([tone.tsl], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = tone.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function youtubeUrl(tone: TonePatchResult): string {
  const q = [tone.song, tone.artist].filter(Boolean).join(' ') || tone.patch.name
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' guitar')}`
}

/** The mod/FX knobs a slot carries, in display order — only the ones the effect
 *  actually set (the writer defaults the rest). Empty when the slot is off. */
function fxParams(fx: TonePatch['fx1']): [string, number][] | undefined {
  if (!fx?.on) return undefined
  const order: [keyof NonNullable<TonePatch['fx1']>, string][] = [
    ['rate', 'rate'], ['depth', 'depth'], ['reso', 'reso'],
    ['sustain', 'sustain'], ['attack', 'attack'], ['tone', 'tone'], ['level', 'level'],
  ]
  const rows = order
    .map(([k, label]) => [label, fx[k]] as [string, unknown])
    .filter((r): r is [string, number] => typeof r[1] === 'number')
  return rows.length ? rows : undefined
}

/** Flatten a patch into display rows for the scrollable settings list. */
interface SettingRow { block: string; on: boolean; detail: string; params?: [string, number][] }
function patchRows(p: TonePatch): SettingRow[] {
  const rows: SettingRow[] = []
  rows.push({
    block: 'Amp', on: true, detail: p.ampA.type,
    params: [['gain', p.ampA.gain], ['bass', p.ampA.bass], ['mid', p.ampA.middle],
             ['treble', p.ampA.treble], ['presence', p.ampA.presence], ['level', p.ampA.level]],
  })
  rows.push({
    block: 'Booster / OD', on: p.booster.on, detail: p.booster.on ? p.booster.type : 'off',
    params: p.booster.on ? [['drive', p.booster.drive], ['tone', p.booster.tone], ['level', p.booster.level]] : undefined,
  })
  if (p.fx1) rows.push({ block: 'FX 1', on: p.fx1.on, detail: p.fx1.on ? p.fx1.type : 'off', params: fxParams(p.fx1) })
  if (p.fx2) rows.push({ block: 'FX 2', on: p.fx2.on, detail: p.fx2.on ? p.fx2.type : 'off', params: fxParams(p.fx2) })
  rows.push({
    block: 'Delay', on: p.delay.on, detail: p.delay.on ? p.delay.type : 'off',
    params: p.delay.on ? [['time(ms)', p.delay.timeMs], ['f.back', p.delay.feedback], ['level', p.delay.level]] : undefined,
  })
  rows.push({
    block: 'Reverb', on: p.reverb.on, detail: p.reverb.on ? p.reverb.type : 'off',
    params: p.reverb.on ? [['time(s)', p.reverb.timeS], ['level', p.reverb.level]] : undefined,
  })
  return rows
}

// ─── compact card (in the message) ───────────────────────────────────────────

export function ToneCard({ tone, onOpen }: { tone: TonePatchResult; onOpen: () => void }) {
  const subtitle = [tone.song, tone.artist].filter(Boolean).join(' — ')
  return (
    <button
      onClick={onOpen}
      className="mt-2 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-primary/25 bg-surface-2 px-3.5 py-3 text-left hover:border-primary/50 hover:bg-surface-3 transition-colors"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <AmpIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{tone.patch.name}</span>
        <span className="block truncate text-[11px] text-fg-3">
          {tone.patch.ampA.type} · {tone.deviceLabel}
          {subtitle ? ` · ${subtitle}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-4">Open</span>
    </button>
  )
}

// ─── detail modal ────────────────────────────────────────────────────────────

export function ToneModal({ tone, onClose, onGoToChat }: { tone: TonePatchResult; onClose: () => void; onGoToChat?: () => void }) {
  const [settingsOpen, setSettingsOpen] = useState(true)
  // Only show blocks the tone actually uses. An empty FX/delay/reverb slot as an
  // "off" row is noise — FX1/FX2 are the Katana's two mod/FX slots, and the model
  // left them unloaded for this patch, not a failure to name anything.
  const rows = patchRows(tone.patch).filter(r => r.on)
  const offBlocks = patchRows(tone.patch).filter(r => !r.on).map(r => r.block)
  const subtitle = [tone.song, tone.artist].filter(Boolean).join(' — ')

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto flex max-h-[90svh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* header */}
          <div className="flex items-start justify-between gap-2 border-b border-white/10 px-5 py-4 shrink-0">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-fg">{tone.patch.name}</p>
              {subtitle && <p className="truncate text-xs text-fg-3 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="shrink-0 text-fg-3 hover:text-fg text-xl leading-none">×</button>
          </div>

          {/* scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
            {/* target + rig */}
            <div className="grid grid-cols-1 gap-2">
              <Field label="Target device" value={tone.deviceLabel} />
              {tone.rig && <Field label="Guitar" value={tone.rig} />}
            </div>

            {tone.experimental && (
              <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-snug text-amber-300/90">
                Experimental layout. This patch is built from a derived MkII map and
                hasn’t been validated against a factory export — import at your own risk.
              </p>
            )}

            {/* settings list */}
            <div className="rounded-xl border border-white/10">
              <button
                onClick={() => setSettingsOpen(o => !o)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-fg-2 hover:text-fg transition-colors"
              >
                <span>Amp, cab &amp; effects</span>
                <ChevronIcon open={settingsOpen} />
              </button>
              {settingsOpen && (
                <div className="divide-y divide-white/5 border-t border-white/10">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-3.5 py-2.5">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] text-fg-3">{r.block}</span>
                          <span className="text-[11px] text-fg">{r.detail}</span>
                        </div>
                        {r.params && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {r.params.map(([k, v]) => (
                              <span key={k} className="text-[10px] text-fg-4">{k}: {v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {offBlocks.length > 0 && (
                    <p className="px-3.5 py-2.5 text-[10px] text-fg-4">
                      Not used: {offBlocks.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* actions */}
          <div className="flex flex-col gap-2 border-t border-white/10 p-4 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => downloadTsl(tone)}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-black hover:opacity-90 transition-opacity"
              >
                <DownloadIcon /> Download .tsl
              </button>
              <a
                href={youtubeUrl(tone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-fg-2 hover:text-fg hover:border-white/20 transition-colors"
              >
                <YoutubeIcon /> YouTube
              </a>
            </div>
            {/* Present only when opened from the tone library and its source
                conversation isn't already active. */}
            {onGoToChat && (
              <button
                onClick={onGoToChat}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-fg-3 hover:text-fg hover:border-white/20 transition-colors"
              >
                Go to chat →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-4">{label}</p>
      <p className="text-sm text-fg mt-0.5">{value}</p>
    </div>
  )
}
