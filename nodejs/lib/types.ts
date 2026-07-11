export interface Attachment {
  kind: 'image' | 'document'
  name: string
  mimeType: string
  size: number
  dataUrl?: string         // base64 data URL — present for images; documents may omit
  extractedText?: string   // present for documents once extraction completes
  extracting?: boolean     // true while extraction is in flight (client-only UI hint)
  extractError?: string    // populated if extraction failed
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

// A generated tone, as it arrives from the tone_patch stream event. Mirrors
// TonePatchEvent in lib/server/tone.ts (kept here so client code doesn't import
// the server module). `tsl` is the ready-to-download liveset string.
export interface TonePatchResult {
  patch: import('@/lib/patch/intent').TonePatch
  song?: string
  artist?: string
  device: string
  deviceLabel: string
  rig?: string
  tsl: string
  filename: string
  experimental: boolean
  /** Set when this tone was produced by converting another device's tone. Records
   *  the source amp and what the re-voicing changed, so the provenance survives a
   *  reload and shows on the card. Absent for directly-generated tones. */
  convertedFrom?: {
    deviceLabel: string
    notes: import('@/lib/patch').ConvertNote[]
  }
}

export interface ChatMessage extends Message {
  id: string
  sources?: { title: string; url: string }[]
  attachments?: Attachment[]
  tonePatch?: TonePatchResult
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// A tone saved to the client-side library ("My Tones"). Independent of the
// conversation it came from, so it survives chat deletion / the 50-conversation
// cap. `tone` carries the full result including the ready-to-download `tsl`, so
// re-download works offline with no server round-trip.
export interface SavedTone {
  id: string
  name: string                     // editable (rename); defaults to the patch name
  createdAt: number
  updatedAt: number
  conversationId: string | null    // source chat, for "go to chat"
  prompt?: string                  // the request that produced it
  tone: TonePatchResult
}
