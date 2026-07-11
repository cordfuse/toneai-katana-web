'use client'

// Tier 2 gear UI: the Settings dropdown (pick the active instrument) and the
// management modal (add / edit / delete). See docs/settings.md.
//
// Nothing here touches the emitted patch. Gear only biases the model.

import { useState } from 'react'
import {
  type GearState, type Instrument, type PickupSlot,
  pickupsFor, defaultPickup, remapPickups, modelsFor, presetFor,
  defaultInstrument, describeRig, positionsFor,
} from '@/lib/gear'

const TrashSmIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
)
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
)
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
)
// Mirrors the Amp Model chevron in _Home.tsx.
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
)

const inputCls =
  'w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-4 focus:border-primary/40 focus:outline-none'
const labelCls = 'text-[10px] font-semibold text-fg-3 uppercase tracking-wider mb-1.5 block'

// ─── Settings section ────────────────────────────────────────────────────────

export function GearSection({ gear, onManage, onSelect }: {
  gear: GearState
  onManage: () => void
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = gear.instruments.find(i => i.id === gear.activeInstrumentId)

  return (
    <div>
      <p className={labelCls}>My gear</p>
      {gear.instruments.length === 0 ? (
        <button
          onClick={onManage}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-surface-2 px-3 py-2.5 text-sm text-fg-3 hover:text-fg hover:border-white/25 transition-colors"
        >
          <PlusIcon /> Add an instrument
        </button>
      ) : (
        <>
          {/* Same popover shape as Amp Model in _Home.tsx: trigger row with a
              muted right-hand tag, panel of rows, tick on the active one. */}
          <div className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              aria-label="Active instrument"
              className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-3 transition-colors"
            >
              {/* min-w-0 + truncate: a long instrument name must shrink, not
                  push the tag and chevron out of the panel. */}
              <span className="min-w-0 flex-1 truncate text-left">{active?.name ?? 'Select an instrument'}</span>
              {active && <span className="text-[10px] text-fg-4 uppercase shrink-0">{active.kind}</span>}
              <ChevronIcon open={open} />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto animate-dropdown origin-top">
                  {gear.instruments.map(i => {
                    const isActive = i.id === gear.activeInstrumentId
                    return (
                      <button
                        key={i.id}
                        onClick={() => { onSelect(i.id); setOpen(false) }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                          isActive ? 'text-primary bg-primary/10' : 'text-fg-2 hover:bg-surface-3 hover:text-fg'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">{i.name}</span>
                        {isActive && <span className="ml-1 text-primary shrink-0">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onManage}
            className="mt-2 text-xs text-fg-3 hover:text-fg transition-colors"
          >
            Manage gear
          </button>
        </>
      )}
    </div>
  )
}

// ─── Management modal ────────────────────────────────────────────────────────

export function GearModal({ gear, onSave, onClose }: {
  gear: GearState
  onSave: (next: GearState) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<GearState>(gear)
  const [editing, setEditing] = useState<Instrument | null>(
    gear.instruments.length === 0 ? defaultInstrument() : null,
  )
  const [isNew, setIsNew] = useState(gear.instruments.length === 0)

  const commit = (next: GearState) => { setDraft(next); onSave(next) }

  const startAdd = () => { setEditing(defaultInstrument()); setIsNew(true) }
  const startEdit = (i: Instrument) => { setEditing({ ...i }); setIsNew(false) }

  const remove = (id: string) => {
    const instruments = draft.instruments.filter(i => i.id !== id)
    // Deleting the active instrument must promote another, or gear silently
    // vanishes from the prompt.
    const activeInstrumentId = draft.activeInstrumentId === id
      ? (instruments[0]?.id ?? null)
      : draft.activeInstrumentId
    commit({ instruments, activeInstrumentId })
  }

  const saveEditing = () => {
    if (!editing) return
    // Rebuild rather than spread: instruments stored before strings/tuning were
    // dropped still carry those keys, and spreading would write them back.
    const cleaned: Instrument = {
      id: editing.id,
      name: editing.name.trim() || 'Untitled',
      kind: editing.kind,
      archetype: editing.archetype,
      pickups: editing.pickups,
    }
    const exists = draft.instruments.some(i => i.id === cleaned.id)
    const instruments = exists
      ? draft.instruments.map(i => (i.id === cleaned.id ? cleaned : i))
      : [...draft.instruments, cleaned]
    commit({ instruments, activeInstrumentId: draft.activeInstrumentId ?? cleaned.id })
    setEditing(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl animate-scale-up">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
            <h2 className="text-sm font-medium text-fg">My gear</h2>
            <button onClick={onClose} aria-label="Close gear" className="text-fg-3 hover:text-fg text-lg leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {editing ? (
              <InstrumentForm
                value={editing}
                onChange={setEditing}
                onCancel={() => setEditing(null)}
                onSave={saveEditing}
                isNew={isNew}
              />
            ) : (
              <>
                {draft.instruments.map(i => {
                  const isActive = i.id === draft.activeInstrumentId
                  return (
                    <div
                      key={i.id}
                      className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2.5 ${
                        isActive ? 'border-primary/40 bg-primary/5' : 'border-white/10 bg-surface-2'
                      }`}
                    >
                      <button
                        onClick={() => commit({ ...draft, activeInstrumentId: i.id })}
                        className="flex-1 text-left"
                      >
                        <span className="block text-sm text-fg">{i.name}</span>
                        <span className="block text-[11px] text-fg-4">
                          {describeRig(i, positionsFor(i).at(-1))}
                        </span>
                      </button>
                      {isActive && <span className="text-[10px] uppercase text-primary shrink-0">Active</span>}
                      <button onClick={() => startEdit(i)} aria-label={`Edit ${i.name}`} className="text-fg-3 hover:text-fg shrink-0"><PencilIcon /></button>
                      <button onClick={() => remove(i.id)} aria-label={`Delete ${i.name}`} className="text-fg-3 hover:text-red-400 shrink-0"><TrashSmIcon /></button>
                    </div>
                  )
                })}
                <button
                  onClick={startAdd}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-sm text-fg-3 hover:text-fg hover:border-white/25 transition-colors"
                >
                  <PlusIcon /> Add instrument
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Instrument editor ───────────────────────────────────────────────────────

function InstrumentForm({ value, onChange, onCancel, onSave, isNew }: {
  value: Instrument
  onChange: (i: Instrument) => void
  onCancel: () => void
  onSave: () => void
  isNew: boolean
}) {
  const set = <K extends keyof Instrument>(k: K, v: Instrument[K]) => onChange({ ...value, [k]: v })

  // Pickup slots are ordered neck -> bridge. Changing the count rebuilds the
  // array, preserving whatever types the user already chose.
  const setPickupCount = (n: number) => {
    const next: PickupSlot[] = Array.from({ length: n }, (_, idx) => value.pickups[idx] ?? defaultPickup(value.kind))
    set('pickups', next)
  }
  const setPickupAt = (idx: number, t: PickupSlot) => {
    const next = [...value.pickups]
    next[idx] = t
    set('pickups', next)
  }

  const slotName = (idx: number, total: number) =>
    total === 1 ? 'Pickup' : idx === 0 ? 'Neck' : idx === total - 1 ? 'Bridge' : 'Middle'

  // Guitar and bass have disjoint pickup catalogues. Switching kind refills every
  // fitted slot with a type valid for the new kind; 'none' slots stay empty,
  // because removing a pickup was a deliberate choice.
  //
  // A model name carried across a kind switch would reach the prompt as
  // "Les Paul (BASS guitar)". Drop it — but only when it came from the
  // catalogue, so hand-typed names survive.
  const setKind = (kind: Instrument['kind']) =>
    onChange({
      ...value,
      kind,
      pickups: remapPickups(value.pickups, kind),
      archetype: presetFor(value.kind, value.archetype ?? '') ? '' : value.archetype,
    })

  // Typing a catalogue name pre-fills its stock pickups. Anything else leaves
  // the slots alone: the field is free text, and rewriting a user's pickup
  // choices because they typed "Les" would be worse than not helping at all.
  const setArchetype = (archetype: string) => {
    const preset = presetFor(value.kind, archetype)
    onChange(preset ? { ...value, archetype, pickups: [...preset.pickups] } : { ...value, archetype })
  }

  const suggestions = modelsFor(value.kind)

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="gear-name">Name</label>
        <input id="gear-name" className={inputCls} value={value.name} placeholder="the '59"
          onChange={e => set('name', e.target.value)} />
      </div>

      <div>
        <span className={labelCls}>Type</span>
        <div className="flex gap-2">
          {(['guitar', 'bass'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                value.kind === k ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 bg-surface-2 text-fg-2 hover:text-fg'
              }`}>{k}</button>
          ))}
        </div>
        {value.kind === 'bass' && (
          // Not a capability claim. KATANA Bass is a separate device family with
          // a different amp enum; nothing in kat-format.md covers it.
          <p className="mt-1.5 text-[11px] leading-snug text-amber-400/90">
            KATANA Bass uses a different amp set. Patches generated for a bass are
            experimental and may not translate.
          </p>
        )}
      </div>

      <div>
        <label className={labelCls} htmlFor="gear-archetype">Model</label>
        <input id="gear-archetype" className={inputCls} list="gear-archetypes"
          value={value.archetype ?? ''} placeholder={value.kind === 'bass' ? 'Jazz Bass' : 'Les Paul'}
          onChange={e => setArchetype(e.target.value)} />
        <datalist id="gear-archetypes">
          {suggestions.map(s => <option key={s.name} value={s.name} />)}
        </datalist>
        <p className="mt-1 text-[11px] text-fg-4">
          Free text — pick a listed model to fill its stock pickups, or type your
          own. A bridge humbucker in a Les Paul is a different tone problem than
          the same pickup in a superstrat.
        </p>
      </div>

      <div>
        <span className={labelCls}>Pickups (neck → bridge)</span>
        <div className="mb-2 flex gap-2">
          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => setPickupCount(n)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                value.pickups.length === n ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 bg-surface-2 text-fg-2 hover:text-fg'
              }`}>{n}</button>
          ))}
        </div>
        <div className="space-y-2">
          {value.pickups.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-fg-4">{slotName(idx, value.pickups.length)}</span>
              <select value={p} onChange={e => setPickupAt(idx, e.target.value as PickupSlot)}
                aria-label={`${slotName(idx, value.pickups.length)} pickup`}
                className="flex-1 rounded-lg border border-white/10 bg-surface-2 px-2 py-1.5 text-sm text-fg focus:border-primary/40 focus:outline-none">
                {pickupsFor(value.kind).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-fg-2 hover:text-fg transition-colors">
          Cancel
        </button>
        <button onClick={onSave} className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-black hover:opacity-90 transition-opacity">
          {isNew ? 'Add' : 'Save'}
        </button>
      </div>
    </div>
  )
}
