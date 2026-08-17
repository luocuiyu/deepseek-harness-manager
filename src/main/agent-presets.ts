import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { app, shell } from 'electron'
import { getConfig } from './config'
import { getState } from './harness'
import { getSessionOverview } from './session-observer'
import { t } from './i18n'
import type { AgentPresetInfo, AgentPresetListResult, AgentPresetTrashInfo, CmdResult, RemoveAgentPresetResult, SessionSummary } from '../shared/types'

interface TrashMetadata {
  presetId: string
  name: string
  description: string
  originalPath: string
  deletedAt: number
}

function presetRoot(): string {
  return join(getConfig().dshHome, '.agent-presets')
}

function trashRoot(): string {
  return join(app.getPath('userData'), 'agent-preset-trash')
}

function scalar(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'))
  if (!match) return ''
  const value = match[1].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function treeStats(root: string): { fileCount: number; totalBytes: number; updatedAt: number } {
  let fileCount = 0
  let totalBytes = 0
  let updatedAt = 0
  const pending = [root]
  while (pending.length) {
    const dir = pending.pop()
    if (!dir) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      try {
        const stat = statSync(path)
        fileCount += 1
        totalBytes += stat.size
        updatedAt = Math.max(updatedAt, stat.mtimeMs)
      } catch {
        // A concurrently edited preset may disappear between readdir and stat.
      }
    }
  }
  return { fileCount, totalBytes, updatedAt }
}

function sessionUsesPreset(session: SessionSummary, id: string, name: string): boolean {
  const selected = session.agentPreset?.trim().toLowerCase()
  return Boolean(selected && (selected === id.toLowerCase() || selected === name.toLowerCase()))
}

function safePresetPath(id: string): string | null {
  if (!id || id === '.' || id === '..' || basename(id) !== id || /[\\/]/.test(id)) return null
  const root = resolve(presetRoot())
  const target = resolve(root, id)
  return target.startsWith(`${root}${sep}`) ? target : null
}

function safeTrashPath(id: string): string | null {
  if (!id || id === '.' || id === '..' || basename(id) !== id || /[\\/]/.test(id)) return null
  const root = resolve(trashRoot())
  const target = resolve(root, id)
  return target.startsWith(`${root}${sep}`) ? target : null
}

function moveDirectory(source: string, target: string): void {
  try {
    renameSync(source, target)
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EXDEV') throw error
    cpSync(source, target, { recursive: true, errorOnExist: true })
    rmSync(source, { recursive: true, force: false })
  }
}

function listTrash(): AgentPresetTrashInfo[] {
  const root = trashRoot()
  if (!existsSync(root)) return []
  const items: AgentPresetTrashInfo[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const wrapper = join(root, entry.name)
    const payload = join(wrapper, 'preset')
    if (!existsSync(payload)) continue
    try {
      const metadata = JSON.parse(readFileSync(join(wrapper, 'metadata.json'), 'utf8')) as TrashMetadata
      const stats = treeStats(payload)
      items.push({
        trashId: entry.name,
        presetId: String(metadata.presetId),
        name: String(metadata.name),
        description: String(metadata.description ?? ''),
        originalPath: String(metadata.originalPath),
        deletedAt: Number(metadata.deletedAt) || 0,
        fileCount: stats.fileCount,
        totalBytes: stats.totalBytes
      })
    } catch {
      // Ignore incomplete/corrupt entries instead of offering unsafe actions.
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt)
}

export async function listAgentPresets(): Promise<AgentPresetListResult> {
  const root = presetRoot()
  let sessions: SessionSummary[] = []
  let usageAvailable = false
  let usageError: string | undefined

  if (getState().ready) {
    const overview = await getSessionOverview()
    sessions = overview.sessions
    usageAvailable = overview.ok
    usageError = overview.error
  } else {
    usageError = t('DSH 未运行,暂时无法核对实时会话占用。', 'DSH is not running, so live session usage cannot be checked.')
  }

  if (!existsSync(root)) return { root, presets: [], trashRoot: trashRoot(), trash: listTrash(), usageAvailable, usageError }

  const presets: AgentPresetInfo[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name)
    const configPath = join(path, 'preset.yml')
    if (!existsSync(configPath)) continue
    let source = ''
    try {
      source = readFileSync(configPath, 'utf8')
    } catch {
      continue
    }
    const name = scalar(source, 'name') || entry.name
    const stats = treeStats(path)
    presets.push({
      id: entry.name,
      name,
      description: scalar(source, 'description'),
      path,
      configPath,
      origin: 'user-directory',
      originConfidence: 'high',
      ...stats,
      usedBySessions: sessions
        .filter((session) => sessionUsesPreset(session, entry.name, name))
        .map((session) => ({ sessionId: session.sessionId, title: session.title, running: session.running }))
    })
  }

  presets.sort((a, b) => a.name.localeCompare(b.name))
  return { root, presets, trashRoot: trashRoot(), trash: listTrash(), usageAvailable, usageError }
}

export async function openAgentPreset(id?: string): Promise<{ ok: boolean; error?: string }> {
  const target = id ? safePresetPath(id) : presetRoot()
  if (!target || !existsSync(target)) {
    return { ok: false, error: t('代理预设目录不存在。', 'The agent preset directory does not exist.') }
  }
  const error = await shell.openPath(target)
  return error ? { ok: false, error } : { ok: true }
}

export async function removeAgentPreset(id: string, force = false): Promise<RemoveAgentPresetResult> {
  const target = safePresetPath(id)
  if (!target || !existsSync(target)) {
    return { ok: false, code: null, error: t('代理预设不存在或路径无效。', 'The agent preset does not exist or its path is invalid.') }
  }

  const current = await listAgentPresets()
  const preset = current.presets.find((item) => item.id === id)
  if (!preset) {
    return { ok: false, code: null, error: t('目录不是有效的代理预设。', 'The directory is not a valid agent preset.') }
  }
  if (!force && (!current.usageAvailable || preset.usedBySessions.length > 0)) {
    return {
      ok: false,
      code: null,
      blocked: true,
      usedBySessions: preset.usedBySessions,
      error: preset.usedBySessions.length
        ? t('仍有会话选择了该预设;确认影响后才能移除。', 'Sessions still select this preset; confirm the impact before removing it.')
        : current.usageError
    }
  }

  const root = trashRoot()
  const trashId = `${Date.now()}-${crypto.randomUUID()}-${id}`
  const wrapper = join(root, trashId)
  const payload = join(wrapper, 'preset')
  try {
    mkdirSync(root, { recursive: true })
    mkdirSync(wrapper, { recursive: false })
    moveDirectory(target, payload)
    const metadata: TrashMetadata = {
      presetId: id,
      name: preset.name,
      description: preset.description,
      originalPath: target,
      deletedAt: Date.now()
    }
    writeFileSync(join(wrapper, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8')
    return { ok: true, code: 0, recoverable: true, usedBySessions: preset.usedBySessions }
  } catch (error) {
    try {
      if (existsSync(payload) && !existsSync(target)) moveDirectory(payload, target)
      if (existsSync(wrapper)) rmSync(wrapper, { recursive: true, force: true })
    } catch {
      // Preserve the original error; any remaining files stay in the private trash root.
    }
    return { ok: false, code: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function openAgentPresetTrash(): Promise<{ ok: boolean; error?: string }> {
  const root = trashRoot()
  mkdirSync(root, { recursive: true })
  const error = await shell.openPath(root)
  return error ? { ok: false, error } : { ok: true }
}

export function restoreAgentPreset(trashId: string): CmdResult {
  const wrapper = safeTrashPath(trashId)
  if (!wrapper || !existsSync(wrapper)) return { ok: false, code: null, error: t('回收站项目不存在。', 'The trash item does not exist.') }
  try {
    const metadata = JSON.parse(readFileSync(join(wrapper, 'metadata.json'), 'utf8')) as TrashMetadata
    const target = safePresetPath(String(metadata.presetId))
    const payload = join(wrapper, 'preset')
    if (!target || !existsSync(payload)) return { ok: false, code: null, error: t('回收站项目不完整或路径无效。', 'The trash item is incomplete or has an invalid path.') }
    if (existsSync(target)) return { ok: false, code: null, error: t('同名代理预设已经存在,请先处理冲突。', 'An agent preset with the same ID already exists; resolve the conflict first.') }
    mkdirSync(presetRoot(), { recursive: true })
    moveDirectory(payload, target)
    rmSync(wrapper, { recursive: true, force: true })
    return { ok: true, code: 0 }
  } catch (error) {
    return { ok: false, code: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export function deleteAgentPresetPermanently(trashId: string): CmdResult {
  const wrapper = safeTrashPath(trashId)
  if (!wrapper || !existsSync(wrapper)) return { ok: false, code: null, error: t('回收站项目不存在。', 'The trash item does not exist.') }
  try {
    rmSync(wrapper, { recursive: true, force: false })
    return { ok: true, code: 0 }
  } catch (error) {
    return { ok: false, code: null, error: error instanceof Error ? error.message : String(error) }
  }
}
