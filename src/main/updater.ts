import { app, BrowserWindow, dialog, Notification } from 'electron'
import updaterPackage from 'electron-updater'
import { broadcast } from './bus'
import { getConfig, setConfig } from './config'
import { t } from './i18n'
import { showLauncher } from './tray'
import type { AppUpdateState } from '../shared/types'

// electron-updater is published as CommonJS. Electron runs this bundled main
// entry as ESM, so a named import crashes before the first window is created.
const { autoUpdater } = updaterPackage

let initialized = false
let manualCheck = false
let promptedVersion = ''
let state: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  releaseName: null,
  releaseNotes: null,
  releaseDate: null,
  progress: null,
  transferred: null,
  total: null,
  bytesPerSecond: null,
  error: null,
  checkedAt: null
}

function notes(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === 'object' && 'note' in item ? String(item.note ?? '') : ''))
      .filter(Boolean)
      .join('\n\n') || null
  }
  return null
}

function syncTaskbarProgress(next: AppUpdateState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (next.status === 'downloading') {
      win.setProgressBar(Math.max(0.01, Math.min(1, (next.progress ?? 0) / 100)), { mode: 'normal' })
    } else if (next.status === 'downloaded') {
      win.setProgressBar(1, { mode: 'normal' })
    } else if (next.status === 'error' && next.availableVersion) {
      win.setProgressBar(1, { mode: 'error' })
    } else {
      win.setProgressBar(-1)
    }
  }
}

function notifyWhenBackground(title: string, body: string): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.some((win) => win.isFocused())) return
  if (!Notification.isSupported()) return
  const notice = new Notification({ title, body })
  notice.on('click', showLauncher)
  notice.show()
}

function update(patch: Partial<AppUpdateState>): AppUpdateState {
  state = { ...state, ...patch }
  syncTaskbarProgress(state)
  broadcast({ type: 'update', state: { ...state } })
  return { ...state }
}

async function promptAvailable(version: string, releaseName?: string | null): Promise<void> {
  if (promptedVersion === version) return
  promptedVersion = version
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: [t('下载更新', 'Download update'), t('稍后处理', 'Later'), t('跳过此版本', 'Skip this version')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: t('发现软件更新', 'Software update available'),
    message: t(`发现 DeepSeek Harness Manager v${version}`, `DeepSeek Harness Manager v${version} is available`),
    detail: releaseName || t('可以立即下载,安装前还会再次等待你的确认。', 'You can download now; installation still waits for your confirmation.')
  })
  if (response === 0) {
    showLauncher()
    await downloadUpdate()
  }
  if (response === 2) skipUpdate(version)
}

export function getUpdateState(): AppUpdateState {
  return { ...state, currentVersion: app.getVersion() }
}

export function initUpdater(): void {
  if (initialized) return
  initialized = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    update({ status: 'checking', error: null, checkedAt: Date.now() })
  })
  autoUpdater.on('update-available', (info) => {
    const skipped = getConfig().skippedUpdateVersion
    if (!manualCheck && skipped && skipped === info.version) {
      update({
        status: 'not-available',
        availableVersion: null,
        releaseName: null,
        releaseNotes: null,
        releaseDate: info.releaseDate ?? null,
        progress: null,
        error: null,
        checkedAt: Date.now()
      })
      return
    }
    update({
      status: 'available',
      availableVersion: info.version,
      releaseName: info.releaseName ?? null,
      releaseNotes: notes(info.releaseNotes),
      releaseDate: info.releaseDate ?? null,
      progress: null,
      transferred: null,
      total: null,
      bytesPerSecond: null,
      error: null,
      checkedAt: Date.now()
    })
    if (!manualCheck) void promptAvailable(info.version, info.releaseName)
  })
  autoUpdater.on('update-not-available', () => {
    update({
      status: 'not-available',
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      releaseDate: null,
      progress: null,
      error: null,
      checkedAt: Date.now()
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    update({
      status: 'downloading',
      progress: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      error: null
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    update({
      status: 'downloaded',
      availableVersion: info.version,
      releaseName: info.releaseName ?? state.releaseName,
      releaseNotes: notes(info.releaseNotes) ?? state.releaseNotes,
      releaseDate: info.releaseDate ?? state.releaseDate,
      progress: 100,
      error: null
    })
    notifyWhenBackground(
      t('软件更新已下载', 'Software update downloaded'),
      t(`v${info.version} 已准备好,打开应用即可重启安装。`, `v${info.version} is ready. Open the app to restart and install.`)
    )
  })
  autoUpdater.on('error', (error) => {
    update({ status: 'error', error: error.message, progress: null })
    if (state.availableVersion) {
      notifyWhenBackground(
        t('软件更新下载失败', 'Software update download failed'),
        t('打开应用可以重试或改用 GitHub Release 手动下载。', 'Open the app to retry or download manually from GitHub Releases.')
      )
    }
  })

  if (app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates(false)
    }, 6_000)
  }
}

export async function checkForUpdates(manual = true): Promise<AppUpdateState> {
  initUpdater()
  if (!app.isPackaged) {
    return update({
      status: 'error',
      error: t('开发模式不执行在线更新检查;请使用已安装版本测试。', 'Online update checks are disabled in development; test with an installed build.'),
      checkedAt: Date.now()
    })
  }
  manualCheck = manual
  if (manual && getConfig().skippedUpdateVersion) setConfig({ skippedUpdateVersion: '' })
  try {
    update({ status: 'checking', error: null, checkedAt: Date.now() })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    update({ status: 'error', error: error instanceof Error ? error.message : String(error), progress: null })
  } finally {
    manualCheck = false
  }
  return getUpdateState()
}

export async function downloadUpdate(): Promise<AppUpdateState> {
  initUpdater()
  if (state.status !== 'available' && state.status !== 'error') return getUpdateState()
  try {
    showLauncher()
    update({
      status: 'downloading',
      progress: 0,
      transferred: 0,
      total: null,
      bytesPerSecond: null,
      error: null
    })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    update({ status: 'error', error: error instanceof Error ? error.message : String(error), progress: null })
  }
  return getUpdateState()
}

export function installUpdate(): void {
  if (state.status !== 'downloaded') return
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
}

export function skipUpdate(version: string): AppUpdateState {
  const safeVersion = String(version).trim()
  if (safeVersion) setConfig({ skippedUpdateVersion: safeVersion })
  return update({
    status: 'not-available',
    availableVersion: null,
    releaseName: null,
    releaseNotes: null,
    releaseDate: null,
    progress: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    error: null
  })
}
