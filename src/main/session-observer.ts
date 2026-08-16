import { net } from 'electron'
import { getConfig } from './config'
import { listInstalled } from './plugins'
import type { SessionOverview, SessionSummary } from '../shared/types'

type JsonObject = Record<string, unknown>

async function callDsh(method: string, payload: JsonObject = {}): Promise<unknown> {
  const { port } = getConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await net.fetch(`http://127.0.0.1:${port}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: crypto.randomUUID(),
        method,
        payload
      }),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`DSH API ${method} returned HTTP ${response.status}`)
    const body = (await response.json()) as { result?: { ok?: boolean; value?: unknown; error?: unknown } }
    if (body.result?.ok !== true) throw new Error(String(body.result?.error ?? `DSH API ${method} failed`))
    return body.result.value
  } finally {
    clearTimeout(timer)
  }
}

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function projection(source: JsonObject, key: string): JsonObject {
  const projections = record(source.projections)
  const value = projections[key]
  if (value && typeof value === 'object') {
    const wrapped = record(value)
    return record(wrapped.value ?? value)
  }
  return {}
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberOrNull(value)
    if (parsed !== null) return parsed
  }
  return null
}

function normalizeSession(value: unknown): SessionSummary {
  const item = record(value)
  const tokenUsage = projection(item, 'tokenUsage')
  const pressure = projection(item, 'contextPressure')
  const stats = projection(item, 'sessionStats')
  const titleProjection = projection(item, 'title')
  const title = stringOrNull(item.title) ?? stringOrNull(titleProjection.title) ?? stringOrNull(titleProjection.text) ?? ''

  return {
    sessionId: String(item.sessionId ?? item.id ?? ''),
    title,
    cwd: String(item.cwd ?? ''),
    updatedAt: readNumber(item.updatedAt, item.createdAt) ?? 0,
    running: Boolean(item.running),
    blank: Boolean(item.blank),
    parentSessionId: stringOrNull(item.parentSessionId),
    origin: stringOrNull(item.origin),
    agentPreset: stringOrNull(item.agentPreset),
    model: stringOrNull(item.model) ?? stringOrNull(record(item.models).current),
    tokenUsage: readNumber(tokenUsage.totalTokens, tokenUsage.total, tokenUsage.tokens, item.tokenUsage),
    contextPressure: readNumber(pressure.ratio, pressure.pressure, pressure.value, item.contextPressure),
    turnCount: readNumber(stats.turnCount, stats.turns, stats.messageCount)
  }
}

/** Read-only health/catalog snapshot. Plugin availability is profile-wide, not falsely attributed to a session. */
export async function getSessionOverview(): Promise<SessionOverview> {
  const cfg = getConfig()
  try {
    const [hostRaw, sessionsRaw] = await Promise.all([callDsh('host.describe'), callDsh('session.list')])
    const host = record(hostRaw)
    const catalog = record(sessionsRaw)
    const rawItems = Array.isArray(catalog.items)
      ? catalog.items
      : Array.isArray(sessionsRaw)
        ? sessionsRaw
        : []
    const sessions = rawItems
      .map(normalizeSession)
      .filter((item) => item.sessionId)
      .sort((a, b) => b.updatedAt - a.updatedAt)

    return {
      ok: true,
      profile: cfg.profile,
      hostName: String(host.name ?? host.hostName ?? host.id ?? 'DeepSeek Harness'),
      hostVersion: String(host.version ?? host.hostVersion ?? ''),
      sessions,
      plugins: listInstalled(cfg.profile).installed
    }
  } catch (error) {
    return {
      ok: false,
      profile: cfg.profile,
      hostName: 'DeepSeek Harness',
      hostVersion: '',
      sessions: [],
      plugins: listInstalled(cfg.profile).installed,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
