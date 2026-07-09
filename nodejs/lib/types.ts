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

export interface ChatMessage extends Message {
  id: string
  sources?: { title: string; url: string }[]
  attachments?: Attachment[]
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}
