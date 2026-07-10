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
