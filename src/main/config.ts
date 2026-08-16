import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { ApiPreset, LauncherConfig } from '../shared/types'

const home = homedir()

function firstExisting(candidates: string[]): string {
  return candidates.find(c => c && existsSync(resolve(c))) ?? candidates.find(c => c) ?? ''
}

const DEFAULT_API_PRESETS: ApiPreset[] = [
  {
    id: 'deepseek-official',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    balanceUrl: 'https://api.deepseek.com/user/balance',
    apiKey: ''
  },
  {
    id: 'custom',
    name: '自定义 / 中转',
    baseUrl: '',
    balanceUrl: '',
    apiKey: ''
  }
]

function defaults(): LauncherConfig {
  const harnessRepo = firstExisting([process.env.DSH_REPO ?? '', join(home, 'deepseek-harness')])
  const hasSourceCheckout = Boolean(harnessRepo && existsSync(harnessRepo))
  const runtimeRoot = join(home, '.dsh-runtime')
  const systemLang = (app.getLocale() ?? 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  return {
    // A checked-out repo implies we're on the developer machine ⇒ source mode.
    // Anything else targets the portable runtime (sharing the launcher to others).
    installMode: hasSourceCheckout ? 'source' : 'npx',
    runtimeRoot,
    nodeVersion: '22.20.0',
    dshVersion: '0.1.0-rc.6',
    harnessRepo,
    harnessRepoUrl: 'https://github.com/deepseek-ai/deepseek-harness.git',
    dshHome: firstExisting([process.env.DSH_HOME ?? '', join(home, '.dsh')]),
    pluginDir: firstExisting([join(home, 'DSH-Plugin')]),
    profile: 'web',
    port: 3080,
    nodePath: hasSourceCheckout ? 'node' : process.platform === 'win32' ? 'npx.cmd' : 'npx',
    launchArgs: hasSourceCheckout ? ['apps/cli/lib/bin.js'] : ['@deepseek-ai/dsh'],
    buildCmd: 'pnpm run build',
    stopOnQuit: true,
    pnpm: 'pnpm',
    startupTimeoutMs: 90000,
    apiPresets: DEFAULT_API_PRESETS.map((p) => ({ ...p })),
    activeApiPresetId: 'deepseek-official',
    language: systemLang,
    closeToTray: true,
    splashEnabled: true,
    autoStartOnLaunch: true,
    floatingWhale: false,
    marketPageSize: 30,
    githubToken: ''
  }
}

/** The currently active API preset; falls back to the first preset (or DeepSeek official). */
export function getActiveApiPreset(): ApiPreset {
  const cfg = getConfig()
  const presets = cfg.apiPresets ?? []
  return presets.find((p) => p.id === cfg.activeApiPresetId) ?? presets[0] ?? DEFAULT_API_PRESETS[0]
}

let cache: LauncherConfig | null = null
let configPath = ''
let secretsPath = ''

function file(): string {
  if (!configPath) configPath = join(app.getPath('userData'), 'launcher-config.json')
  return configPath
}

function secretFile(): string {
  if (!secretsPath) secretsPath = join(app.getPath('userData'), 'launcher-secrets.bin')
  return secretsPath
}

interface StoredSecrets {
  deepseekApiKey?: string
  githubToken?: string
  presetKeys?: Record<string, string>
}

function readSecrets(): StoredSecrets {
  if (!safeStorage.isEncryptionAvailable()) return {}
  try {
    const encoded = readFileSync(secretFile(), 'utf8')
    return JSON.parse(safeStorage.decryptString(Buffer.from(encoded, 'base64'))) as StoredSecrets
  } catch {
    return {}
  }
}

function splitSecrets(config: LauncherConfig): { publicConfig: LauncherConfig; secrets: StoredSecrets } {
  const secrets: StoredSecrets = {
    deepseekApiKey: config.deepseekApiKey ?? '',
    githubToken: config.githubToken ?? '',
    presetKeys: Object.fromEntries(config.apiPresets.map((preset) => [preset.id, preset.apiKey ?? '']))
  }
  const publicConfig: LauncherConfig = {
    ...config,
    deepseekApiKey: '',
    githubToken: '',
    apiPresets: config.apiPresets.map((preset) => ({ ...preset, apiKey: '' }))
  }
  return { publicConfig, secrets }
}

function writeAtomic(path: string, data: string): void {
  const temporary = `${path}.tmp`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(temporary, data, 'utf8')
  renameSync(temporary, path)
}

function persist(config: LauncherConfig): void {
  const { publicConfig, secrets } = splitSecrets(config)
  writeAtomic(file(), JSON.stringify(publicConfig, null, 2))
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(secrets)).toString('base64')
    writeAtomic(secretFile(), encrypted)
  } else {
    console.warn('[security] OS credential encryption is unavailable; secrets are kept in memory and were not written to disk.')
  }
}

export function getConfig(): LauncherConfig {
  if (cache) return cache
  try {
    const raw = readFileSync(file(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<LauncherConfig>
    const base = { ...defaults(), ...parsed }
    const secrets = readSecrets()
    cache = {
      ...base,
      deepseekApiKey: secrets.deepseekApiKey ?? base.deepseekApiKey,
      githubToken: secrets.githubToken ?? base.githubToken,
      apiPresets: base.apiPresets.map((preset) => ({
        ...preset,
        apiKey: secrets.presetKeys?.[preset.id] ?? preset.apiKey
      }))
    }
    // One-time migration from legacy plaintext fields to Windows DPAPI-backed safeStorage.
    const hadPlaintextSecrets = Boolean(parsed.deepseekApiKey || parsed.githubToken || parsed.apiPresets?.some((preset) => preset.apiKey))
    if (hadPlaintextSecrets && safeStorage.isEncryptionAvailable()) persist(cache)
  } catch {
    cache = defaults()
  }
  return cache
}

export function setConfig(patch: Partial<LauncherConfig>): LauncherConfig {
  const next = { ...getConfig(), ...patch }
  cache = next
  try {
    persist(next)
  } catch (err) {
    console.error('failed to persist launcher config:', err)
  }
  return next
}
