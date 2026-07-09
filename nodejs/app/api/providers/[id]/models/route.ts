import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'
import { findProvider } from '@/lib/server/ai-tools'

// GET /api/providers/<id>/models — returns the model list to show in the
// picker for a provider.
//
// Cloud providers: returns the curated registry list (their model catalogs
// are too large to enumerate live and don't change per-operator).
//
// Local providers (Ollama / llama.cpp / LM Studio): probes the local
// server's OpenAI-compatible /v1/models endpoint and returns whatever's
// actually installed. Falls back to the registry list if the probe fails
// (server not running, returns junk, etc) so the UI still has something
// to show with a clear "you'll get an error on send" implication.

interface ModelOut { id: string; label: string }

function labelize(id: string): string {
  // Best-effort prettify: "llama3.1:8b" → "Llama 3.1 8B"
  return id
    .replace(/[:_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const p = findProvider(id)
  if (!p) return NextResponse.json({ error: `Unknown provider '${id}'` }, { status: 404 })

  // Cloud: return registry as-is.
  if (p.category !== 'local') {
    return NextResponse.json({ models: p.models, source: 'registry' as const })
  }

  // Local: probe /v1/models.
  const baseURL = (p.baseURLEnv && process.env[p.baseURLEnv]) || p.defaultBaseURL
  if (!baseURL) {
    return NextResponse.json({ models: p.models, source: 'registry' as const })
  }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: 'Bearer local' },
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) {
      return NextResponse.json({ models: p.models, source: 'registry' as const, probeStatus: res.status })
    }
    const body = await res.json()
    // OpenAI-compatible shape: { object: 'list', data: [{ id, ... }, ...] }
    const items: unknown[] = Array.isArray(body?.data) ? body.data : []
    const liveModels: ModelOut[] = items
      .map(m => (typeof m === 'object' && m !== null && typeof (m as { id?: unknown }).id === 'string') ? (m as { id: string }).id : null)
      .filter((x): x is string => !!x)
      .map(modelId => ({ id: modelId, label: labelize(modelId) }))
    if (liveModels.length === 0) {
      return NextResponse.json({ models: p.models, source: 'registry' as const })
    }
    return NextResponse.json({ models: liveModels, source: 'live' as const, baseURL })
  } catch (err) {
    console.warn(`[providers/${id}/models] probe failed:`, err)
    return NextResponse.json({ models: p.models, source: 'registry' as const })
  }
}
