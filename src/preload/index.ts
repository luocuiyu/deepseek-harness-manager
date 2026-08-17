import { contextBridge, ipcRenderer } from 'electron'
import type { DshLauncherApi, LauncherEvent } from '../shared/types'

const api: DshLauncherApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  start: () => ipcRenderer.invoke('harness:start'),
  stop: () => ipcRenderer.invoke('harness:stop'),
  restart: () => ipcRenderer.invoke('harness:restart'),
  openUi: () => ipcRenderer.invoke('harness:openUi'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  getSessionOverview: () => ipcRenderer.invoke('sessions:overview'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  installPlugin: (spec) => ipcRenderer.invoke('plugins:install', spec),
  removePlugin: (name) => ipcRenderer.invoke('plugins:remove', name),
  setPluginEnabled: (name, enabled) => ipcRenderer.invoke('plugins:setEnabled', name, enabled),
  listAgentPresets: () => ipcRenderer.invoke('agent-presets:list'),
  openAgentPreset: (id) => ipcRenderer.invoke('agent-presets:open', id),
  removeAgentPreset: (id, force) => ipcRenderer.invoke('agent-presets:remove', id, force),
  openAgentPresetTrash: () => ipcRenderer.invoke('agent-presets:trash:open'),
  restoreAgentPreset: (trashId) => ipcRenderer.invoke('agent-presets:trash:restore', trashId),
  deleteAgentPresetPermanently: (trashId) => ipcRenderer.invoke('agent-presets:trash:delete', trashId),
  repairDeps: () => ipcRenderer.invoke('build:repair'),
  rebuild: () => ipcRenderer.invoke('build:rebuild'),
  downloadHarness: () => ipcRenderer.invoke('download:harness'),
  prepareDsh: () => ipcRenderer.invoke('dsh:prepare'),
  downloadPlugin: (url, subdir) => ipcRenderer.invoke('download:plugin', url, subdir),
  getBalance: () => ipcRenderer.invoke('balance:get'),
  searchMarket: (page, query) => ipcRenderer.invoke('market:search', page, query),
  fetchMarketReadme: (owner, repo) => ipcRenderer.invoke('market:readme', owner, repo),
  getUpdateState: () => ipcRenderer.invoke('updates:get'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  skipUpdate: (version) => ipcRenderer.invoke('updates:skip', version),
  confirmOpenExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setDshActive: (active, reload) => ipcRenderer.send('dsh:set-active', active, reload),
  setDshSidebarWidth: (width) => ipcRenderer.send('dsh:set-sidebar-width', width),
  setOrbVisible: (visible) => ipcRenderer.send('orb:set-visible', visible),
  orbDragStart: (ox, oy) => ipcRenderer.send('orb:drag-start', ox, oy),
  orbDragMove: (sx, sy) => ipcRenderer.send('orb:drag-move', sx, sy),
  orbDragEnd: () => ipcRenderer.send('orb:drag-end'),
  orbClick: () => ipcRenderer.send('orb:click'),
  onOrbClicked: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('orb:clicked', listener)
    return () => {
      ipcRenderer.removeListener('orb:clicked', listener)
    }
  },
  onEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, data: LauncherEvent): void => cb(data)
    ipcRenderer.on('harness:event', listener)
    return () => {
      ipcRenderer.removeListener('harness:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('dshLauncher', api)
