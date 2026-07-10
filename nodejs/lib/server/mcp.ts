// MCP (Model Context Protocol) client manager.
//
// Reads servers from toneai-mcp.json (override path via MCP_CONFIG_PATH), opens
// a long-lived client per server at boot, and exposes:
//   - listServers()         — what the UI's picker shows
//   - getToolsForServers()  — merged tool list in OpenAI function format
//   - executeToolCall()     — route a tool_call back to its owning server
//
// Tool names are namespaced as `<serverId>__<toolName>` on the wire to avoid
// collisions across servers. The namespace is stripped before forwarding to
// the MCP client.

import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { getConfigDir } from '@/lib/config'

interface McpHttpServer  { type: 'http';  url: string;  label?: string }
interface McpStdioServer { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string>; label?: string }
type McpServerConfig = McpHttpServer | McpStdioServer

interface McpConfig { servers: Record<string, McpServerConfig> }

interface McpTool {
  name: string                        // namespaced: `<serverId>__<toolName>`
  originalName: string                // as the MCP server knows it
  serverId: string
  description?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any
}

interface McpServerState {
  id: string
  label: string
  client: Client | null
  tools: McpTool[]
  error: string | null
}

const NAMESPACE_SEP = '__'
const state = new Map<string, McpServerState>()
let initStarted = false
let initPromise: Promise<void> | null = null

function loadConfig(): McpConfig | null {
  const explicit = process.env.MCP_CONFIG_PATH
  const dir = getConfigDir()
  // Lookup order mirrors toneai.config.json: TONEAI_CONFIG_DIR (the canonical
  // mount), standalone-server ancestors, then legacy CWD-relative paths.
  const candidates = explicit
    ? [explicit]
    : [
        path.join(dir, 'toneai-mcp.json'),
        path.join(process.cwd(), '..', 'config', 'toneai-mcp.json'),
        path.join(process.cwd(), '..', '..', 'config', 'toneai-mcp.json'),
        path.join(process.cwd(), 'toneai-mcp.json'),
        path.join(process.cwd(), '..', '..', 'toneai-mcp.json'),
        path.join(process.cwd(), '..', '..', '..', 'toneai-mcp.json'),
      ]
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.servers && typeof parsed.servers === 'object') {
        console.log(`[mcp] loaded config from ${p}`)
        return parsed
      }
    } catch { /* try next */ }
  }
  return null
}

async function connectServer(id: string, cfg: McpServerConfig): Promise<McpServerState> {
  const label = cfg.label ?? id
  try {
    const client = new Client({ name: 'toneai-kat', version: '0.1.0' }, { capabilities: {} })
    if (cfg.type === 'http') {
      const transport = new StreamableHTTPClientTransport(new URL(cfg.url))
      await client.connect(transport)
    } else if (cfg.type === 'stdio') {
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args,
        env: cfg.env,
      })
      await client.connect(transport)
    } else {
      throw new Error(`Unknown transport type: ${(cfg as { type: string }).type}`)
    }

    const { tools } = await client.listTools()
    const mapped: McpTool[] = tools.map(t => ({
      name: `${id}${NAMESPACE_SEP}${t.name}`,
      originalName: t.name,
      serverId: id,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
    console.log(`[mcp] ${id}: connected, ${mapped.length} tools`)
    return { id, label, client, tools: mapped, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[mcp] ${id}: connect failed — ${msg}`)
    return { id, label, client: null, tools: [], error: msg }
  }
}

export async function initMcp(): Promise<void> {
  if (initStarted) return initPromise!
  initStarted = true
  initPromise = (async () => {
    const cfg = loadConfig()
    if (!cfg) {
      console.log('[mcp] no toneai-mcp.json found, MCP disabled')
      return
    }
    const entries = Object.entries(cfg.servers)
    const results = await Promise.all(entries.map(([id, c]) => connectServer(id, c)))
    for (const r of results) state.set(r.id, r)
  })()
  return initPromise
}

export interface PublicMcpServer {
  id: string
  label: string
  toolCount: number
  available: boolean
  error: string | null
}

export async function listServers(): Promise<PublicMcpServer[]> {
  await initMcp()
  return Array.from(state.values()).map(s => ({
    id: s.id,
    label: s.label,
    toolCount: s.tools.length,
    available: s.client !== null,
    error: s.error,
  }))
}

// Returns OpenAI-format tool definitions for the requested server IDs.
// Servers that failed to connect or aren't in the config are silently skipped.
export async function getToolsForServers(serverIds: string[]) {
  await initMcp()
  const out: { type: 'function'; function: { name: string; description?: string; parameters: unknown } }[] = []
  for (const id of serverIds) {
    const s = state.get(id)
    if (!s || !s.client) continue
    for (const t of s.tools) {
      out.push({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })
    }
  }
  return out
}

// Returns true if `name` is namespaced (i.e. belongs to an MCP server).
export function isMcpToolName(name: string): boolean {
  return name.includes(NAMESPACE_SEP) && state.has(name.split(NAMESPACE_SEP)[0])
}

// Execute a tool call by routing to the owning MCP server.
// `name` is the namespaced wire name (`<serverId>__<toolName>`).
export async function executeMcpToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  await initMcp()
  const sepIdx = name.indexOf(NAMESPACE_SEP)
  if (sepIdx < 0) throw new Error(`Not a namespaced MCP tool: ${name}`)
  const serverId = name.slice(0, sepIdx)
  const toolName = name.slice(sepIdx + NAMESPACE_SEP.length)
  const s = state.get(serverId)
  if (!s || !s.client) throw new Error(`MCP server '${serverId}' is not available`)
  const result = await s.client.callTool({ name: toolName, arguments: args })
  // Tool results are an array of content blocks. Flatten text blocks for the
  // model. Non-text content (images, embedded resources) is summarized to
  // keep the tool message a simple string for token.js's tool role.
  const content = result.content as Array<{ type: string; text?: string }> | undefined
  if (!Array.isArray(content)) return JSON.stringify(result)
  const parts: string[] = []
  for (const c of content) {
    if (c.type === 'text' && typeof c.text === 'string') parts.push(c.text)
    else parts.push(`[${c.type} content]`)
  }
  return parts.join('\n\n')
}
