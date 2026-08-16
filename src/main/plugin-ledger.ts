import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PluginOrigin, ProvenanceConfidence } from '../shared/types'

export interface PluginLedgerEntry {
  profile: string
  name: string
  origin: PluginOrigin
  confidence: ProvenanceConfidence
  sourceUrl?: string
  installedAt: number
}

interface LedgerFile {
  version: 1
  entries: PluginLedgerEntry[]
}

function ledgerPath(): string {
  return join(app.getPath('userData'), 'plugin-provenance.json')
}

function readLedger(): LedgerFile {
  try {
    const value = JSON.parse(readFileSync(ledgerPath(), 'utf8')) as Partial<LedgerFile>
    return { version: 1, entries: Array.isArray(value.entries) ? value.entries : [] }
  } catch {
    return { version: 1, entries: [] }
  }
}

function writeLedger(value: LedgerFile): void {
  const path = ledgerPath()
  const temporary = `${path}.tmp`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
}

export function getPluginRecord(profile: string, name: string): PluginLedgerEntry | undefined {
  return readLedger().entries.find((entry) => entry.profile === profile && entry.name === name)
}

export function recordPluginInstall(entry: PluginLedgerEntry): void {
  const ledger = readLedger()
  ledger.entries = ledger.entries.filter((item) => !(item.profile === entry.profile && item.name === entry.name))
  ledger.entries.push(entry)
  writeLedger(ledger)
}

export function recordPluginRemoval(profile: string, name: string): void {
  const ledger = readLedger()
  const next = ledger.entries.filter((entry) => !(entry.profile === profile && entry.name === name))
  if (next.length !== ledger.entries.length) writeLedger({ version: 1, entries: next })
}
