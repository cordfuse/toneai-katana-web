// Operator telemetry — the log across ALL users, plus the rollups an operator
// keeps asking for. This is the durable counterpart to the platform's live log
// tail: it reads the `logs` table on the persistent disk, so it can answer "what
// happened last Tuesday", which a stream that ages out cannot.
//
// AUTH: `x-admin-token`, checked in constant time (lib/server/admin.ts).
//
// OFF BY DEFAULT. With ADMIN_TOKEN unset this route returns 404 and behaves as
// though it does not exist — because on that deploy, it effectively doesn't. A
// deploy that never opted in should not advertise an admin surface to anyone
// scanning for one.
//
// PROMPTS ARE WITHHELD UNLESS ASKED FOR. `chat.request` rows carry up to 500
// characters of what a user typed. The default response replaces that text with a
// placeholder, so the normal operator act — checking the error rate, the spend,
// how many people got refused — produces output that is safe to paste into a chat,
// an issue, or a screenshot. `?prompts=1` includes them. Reading what your users
// asked for is legitimate; it should be a deliberate act rather than a side effect
// of looking at a number.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_HEADER, adminEnabled, isAdmin } from '@/lib/server/admin'
import { queryLogs, summarizeLogs } from '@/lib/server/log'
import type { LogLevel } from '@/lib/log/types'

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

/** Start of the current UTC day — the default window, and the one that matters:
 *  the quota resets at UTC midnight, so "today" is the unit the limits are in. */
function startOfUtcDay(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

export async function GET(request: NextRequest) {
  // Not configured → this endpoint does not exist. Note the 404: a 401 would
  // confirm to a prober that there IS an admin route here worth attacking.
  if (!adminEnabled()) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (!isAdmin(request.headers.get(ADMIN_HEADER))) {
    // Logged with the caller's IP: a stream of these is someone guessing, and
    // that is exactly the thing you want to notice.
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    console.warn(`[admin] REJECTED bad token from ip=${ip} path=${request.nextUrl.pathname}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const p = request.nextUrl.searchParams

  // Window. Defaults to the current UTC day, which lines up with the quota.
  const sinceRaw = Number(p.get('since'))
  const untilRaw = Number(p.get('until'))
  const sinceTs = Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : startOfUtcDay()
  const untilTs = Number.isFinite(untilRaw) && untilRaw > 0 ? untilRaw : Date.now() + 1

  // `days=7` is the ergonomic form — nobody wants to compute epoch millis by hand.
  const days = Number(p.get('days'))
  const effectiveSince = Number.isFinite(days) && days > 0
    ? Date.now() - days * 24 * 60 * 60 * 1000
    : sinceTs

  const levelRaw = p.get('level')
  const level = LEVELS.includes(levelRaw as LogLevel) ? (levelRaw as LogLevel) : undefined
  const event = p.get('event') ?? undefined
  const limitRaw = Number(p.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined
  const includePrompts = p.get('prompts') === '1'

  const summary = summarizeLogs(effectiveSince, untilTs)

  // `summary=1` returns the rollups alone — the cheap call, and the one worth
  // hitting repeatedly. The full entry list can be thousands of rows.
  if (p.get('summary') === '1') {
    return NextResponse.json({ summary, promptsIncluded: false })
  }

  const entries = queryLogs({
    sinceTs: effectiveSince, untilTs, event, level, limit, includePrompts,
  })

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  console.log(
    `[admin] logs read ip=${ip} entries=${entries.length} ` +
    `window=${new Date(effectiveSince).toISOString()}..${new Date(untilTs).toISOString()} ` +
    `prompts=${includePrompts ? 'INCLUDED' : 'omitted'}`,
  )

  return NextResponse.json({
    summary,
    entries,
    /** Says plainly whether user prompt text is in this payload — so nobody
     *  forwards a response assuming it was redacted when it wasn't. */
    promptsIncluded: includePrompts,
  })
}
