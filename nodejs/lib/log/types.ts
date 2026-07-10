// Shared diagnostic-log types. One LogEntry shape is used on both sides — the
// client ring buffer and the server SQLite table — so the "download log" button
// can union the two streams into one chronological file.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogSource = 'client' | 'server'

export interface LogEntry {
  /** Epoch milliseconds. The single sort key when client + server are merged. */
  ts: number
  source: LogSource
  level: LogLevel
  /** Short dotted event code, e.g. "chat.request", "chat.error", "console.error". */
  event: string
  /** Correlation id shared by a client request and its server-side handling. */
  requestId?: string
  msg?: string
  /** Arbitrary structured context. Always scrubbed before it is stored. */
  ctx?: Record<string, unknown>
}
