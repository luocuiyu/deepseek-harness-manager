import { app, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { getConfig } from './config'
import * as harness from './harness'
import { getSessionOverview } from './session-observer'
import type { CmdResult, LauncherConfig } from '../shared/types'

function sanitizedConfig(config: LauncherConfig): LauncherConfig {
  return {
    ...config,
    deepseekApiKey: config.deepseekApiKey ? '[configured]' : '',
    githubToken: config.githubToken ? '[configured]' : '',
    apiPresets: config.apiPresets.map((preset) => ({ ...preset, apiKey: preset.apiKey ? '[configured]' : '' }))
  }
}

export async function exportReport(): Promise<CmdResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const result = await dialog.showSaveDialog({
    title: '导出 DSH 诊断报告',
    defaultPath: `DSH-diagnostics-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return { ok: false, code: null, error: 'canceled' }

  const report = {
    generatedAt: new Date().toISOString(),
    launcher: { name: app.getName(), version: app.getVersion(), platform: process.platform, arch: process.arch },
    harness: harness.getState(),
    config: sanitizedConfig(getConfig()),
    sessions: await getSessionOverview(),
    recentLog: harness.getLog().slice(-300)
  }
  writeFileSync(result.filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return { ok: true, code: 0 }
}
