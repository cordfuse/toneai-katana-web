import { NextRequest, NextResponse } from 'next/server'
import { getDeviceIdFromRequest } from '@/lib/server/jwt'

// POST /api/extract-document — server-side text extraction for binary docs
// the browser can't parse natively.
//
// Handled types:
//   - PDF (.pdf)                via unpdf       → plain text
//   - DOCX (.docx)              via mammoth     → plain text
//   - XLSX/XLS (.xlsx, .xls)    via xlsx        → CSV per sheet, with `# <sheetName>` headers
//
// Plain-text-y formats (txt/md/json/csv/xml/html/rtf/yaml/log) are
// extracted client-side via FileReader.readAsText and never hit this
// endpoint. Anything else returns 415 with a clear hint.
//
// Request body: { name, mimeType, dataBase64 }
// Response: { text } or { error }

export const maxDuration = 60

const isPdf  = (m: string, n: string) => m === 'application/pdf' || /\.pdf$/i.test(n)
const isDocx = (m: string, n: string) =>
  m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(n)
const isXlsx = (m: string, n: string) =>
  m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  || m === 'application/vnd.ms-excel'
  || /\.xlsx?$/i.test(n)

export async function POST(request: NextRequest) {
  const deviceId = getDeviceIdFromRequest(request.headers.get('Authorization'))
  if (!deviceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name = '', mimeType = '', dataBase64 } = body
  if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
    return NextResponse.json({ error: 'Missing file data' }, { status: 400 })
  }

  const buf = Buffer.from(dataBase64, 'base64')

  try {
    if (isPdf(mimeType, name)) {
      // unpdf — serverless-friendly pdfjs wrapper, no worker setup needed.
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buf))
      const result = await extractText(pdf, { mergePages: true })
      const text = result.text as unknown as string
      return NextResponse.json({ text })
    }

    if (isDocx(mimeType, name)) {
      // mammoth — converts DOCX to plain text. Doesn't handle legacy .doc
      // (binary Word ≤2003); operators with .doc files should convert.
      const mammothMod = (await import('mammoth')) as unknown as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>
      }
      const result = await mammothMod.extractRawText({ buffer: buf })
      return NextResponse.json({ text: result.value ?? '' })
    }

    if (isXlsx(mimeType, name)) {
      // xlsx (sheetjs) — handles both .xlsx (modern) and .xls (legacy).
      // Dump each sheet as CSV under a `# <sheetName>` header so the model
      // can distinguish multi-tab workbooks.
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(buf, { type: 'buffer' })
      const out: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        out.push(`# ${sheetName}\n${csv}`)
      }
      return NextResponse.json({ text: out.join('\n\n') })
    }

    return NextResponse.json({
      error: `Server-side extraction not supported for type '${mimeType || 'unknown'}'. Convert to PDF/DOCX/XLSX or paste the text directly.`,
    }, { status: 415 })
  } catch (err) {
    console.error('[extract-document] failed:', err)
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
