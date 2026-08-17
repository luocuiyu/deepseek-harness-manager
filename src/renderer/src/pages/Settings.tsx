import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api, type ApiPreset, type LauncherConfig } from '../lib/api'
import { useHarness } from '../hooks/useHarness'
import { useI18n } from '../i18n'
import { TaskConsole } from '../components/TaskConsole'
import { Toggle } from '../components/Toggle'
import { AppUpdaterPanel } from '../components/AppUpdaterPanel'
import { DownloadIcon, RefreshIcon, PowerIcon, PlusIcon, TrashIcon } from '../lib/icons'
import whaleIcon from '../assets/whale.png'
import rueIcon from '../assets/rue.png'
import proto1Icon from '../assets/proto1.png'
import cedricIcon from '../assets/cedric.png'

function Field({ label, value, onChange, mono = true, hint }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; hint?: string }): JSX.Element {
  return (
    <div>
      <label className="label">{label}</label>
      <input className={`input ${mono ? 'mono' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>{hint}</p>
      )}
    </div>
  )
}

export type SettingsTab = 'dsh' | 'api' | 'update' | 'system'

export function Settings({ tab, onTabChange }: { tab: SettingsTab; onTabChange: (tab: SettingsTab) => void }): JSX.Element {
  const { config, saveConfig, tasks, refresh } = useHarness()
  const { t, lang } = useI18n()
  const [form, setForm] = useState<Partial<LauncherConfig>>({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dlBusy, setDlBusy] = useState(false)
  const [dlDone, setDlDone] = useState(false)
  const [dshBusy, setDshBusy] = useState(false)
  const [dshDone, setDshDone] = useState(false)
  const [diagnosticsDone, setDiagnosticsDone] = useState(false)
  // API presets are edited in a dedicated local state (nested array in config).
  const [presets, setPresets] = useState<ApiPreset[]>([])
  const [activeId, setActiveId] = useState('deepseek-official')

  useEffect(() => {
    if (config) {
      setForm((f) => ({ ...f, ...config }))
      setPresets((config.apiPresets ?? []).map((p) => ({ ...p })))
      setActiveId(config.activeApiPresetId ?? 'deepseek-official')
    }
  }, [config])

  const set = (k: keyof LauncherConfig) => (v: string | number | boolean | string[]) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (tab === 'system') {
      // System settings persist on every change — no Save button to forget
      // (checked a box at the top and left without saving was easy to do).
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      void saveConfig({ [k]: v } as Partial<LauncherConfig>)
    } else {
      setSaved(false)
    }
  }

  const doSave = async (): Promise<void> => {
    await saveConfig({
      ...(form as Partial<LauncherConfig>),
      apiPresets: presets,
      activeApiPresetId: activeId
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // --- API preset editing (local state, persisted together with doSave) ---
  const updatePreset = (id: string, patch: Partial<ApiPreset>): void => {
    setPresets((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    setSaved(false)
  }
  const setActivePreset = (id: string): void => {
    setActiveId(id)
    setSaved(false)
  }
  const removePreset = (id: string): void => {
    setPresets((ps) => {
      const next = ps.filter((p) => p.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? '')
      return next
    })
    setSaved(false)
  }
  const addPreset = (): void => {
    const id = `custom-${Date.now()}`
    setPresets((ps) => [...ps, { id, name: t('settings.newPresetName'), baseUrl: '', balanceUrl: '', apiKey: '' }])
    setSaved(false)
  }

  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(label)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const doDownload = async (): Promise<void> => {
    setDlBusy(true)
    setDlDone(false)
    try {
      const r = await api.downloadHarness()
      await refresh() // pull the auto-configured paths into the form
      setDlDone(r.ok)
    } finally {
      setDlBusy(false)
    }
  }

  const doPrepareDsh = async (): Promise<void> => {
    setDshBusy(true)
    setDshDone(false)
    try {
      const r = await api.prepareDsh()
      await refresh()
      setDshDone(r.ok)
      if (r.ok) {
        await saveConfig({ autoStartOnLaunch: true })
      }
    } finally {
      setDshBusy(false)
    }
  }

  const downloadTask = tasks['download:harness']
  const repairTask = tasks['repair']
  const buildTask = tasks['build']
  const prepareTask = tasks['dsh:prepare']

  return (
    <div className="p-5 space-y-5 max-w-[900px]">
      <h2 className="text-[18px] font-semibold">{t('settings.title')}</h2>

      {/* tab bar — click to jump straight to the section */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['dsh', 'api', 'update', 'system'] as const).map((k) => (
          <button
            key={k}
            className="border-b-2 px-3 pb-2 text-[13px] font-medium transition-colors"
            style={{
              color: tab === k ? 'var(--accent)' : 'var(--muted)',
              borderColor: tab === k ? 'var(--accent)' : 'transparent'
            }}
            onClick={() => onTabChange(k)}
          >
            {k === 'dsh' ? t('settings.dshTitle') : k === 'api' ? t('settings.apiTitle') : k === 'update' ? t('settings.updateAppTitle') : t('settings.systemTitle')}
          </button>
        ))}
      </div>

      {tab === 'dsh' && (
      <section className="space-y-4">
        {/* Step 1: system Node.js environment */}
        <div className="panel p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 space-y-1">
              <h3 className="section-title">{t('settings.environmentTitle')}</h3>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('settings.environmentDesc')}
              </p>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('settings.environmentRequirement')} <span className="mono">node --version</span>
              </p>
            </div>
            <button
              className="btn btn-primary shrink-0"
              onClick={() => void api.confirmOpenExternal(lang === 'zh' ? 'https://nodejs.org/zh-cn/download' : 'https://nodejs.org/en/download')}
            >
              <DownloadIcon /> {t('settings.downloadNode')}
            </button>
          </div>
        </div>

        {/* Step 2: npm-distributed DeepSeek Harness */}
        <div className="panel p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 space-y-1">
              <h3 className="section-title">{t('settings.deployDshTitle')}</h3>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('settings.deployDshDesc')}
              </p>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('settings.currentMode')}
                <span className="badge ml-2" style={{ color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 14%, transparent)' }}>
                  {form.installMode === 'source' ? t('settings.modeSource') : t('settings.modeNpx')}
                </span>
              </p>
            </div>
            <button className="btn btn-primary shrink-0" disabled={dshBusy || form.installMode === 'source'} onClick={() => void doPrepareDsh()}>
              <DownloadIcon /> {dshBusy ? t('settings.deployingDsh') : t('settings.deployDshBtn')}
            </button>
          </div>
          {dshDone && <p className="text-[12.5px]" style={{ color: 'var(--ok)' }}>{t('settings.deployDshDone')}</p>}
          {prepareTask && <TaskConsole task={prepareTask} />}
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{t('settings.userDataSafe')}</p>
        </div>

        {/* Source-mode download — advanced */}
        <details className="panel p-4 space-y-3">
          <summary
            className="cursor-pointer select-none text-[12px] font-medium"
            style={{ color: 'var(--muted)' }}
          >
            {t('settings.sourceTitle')}
          </summary>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--warn)' }}>
            {t('settings.sourceDesc')}
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>
            {t('settings.sourceDesc2.pre')} <span className="mono">{form.harnessRepoUrl}</span> {t('settings.sourceDesc2.to')}{' '}
            <span className="mono">{form.harnessRepo}</span> {t('settings.sourceDesc2.mid')} <span className="mono">git pull</span> + <span className="mono">pnpm install</span>{t('settings.sourceDesc2.tail')}
          </p>
          <button className="btn btn-ghost btn-sm" disabled={dlBusy} onClick={() => void doDownload()}>
            <DownloadIcon /> {dlBusy ? t('settings.downloading') : t('settings.downloadBtn')}
          </button>
          {dlDone && (
            <p className="text-[12px]" style={{ color: 'var(--ok)' }}>
              {t('settings.downloadDone')}
            </p>
          )}
          {downloadTask && <TaskConsole task={downloadTask} />}
          {repairTask && <TaskConsole task={repairTask} />}
        </details>

        {/* Maintenance — source mode only */}
        {form.installMode === 'source' && (
          <div className="panel p-5 space-y-4">
            <h3 className="section-title">{t('settings.maintenanceTitle')}</h3>
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              {t('settings.maintenanceDesc.pre')} <span className="mono">zod</span>{t('settings.maintenanceDesc.tail')}
            </p>
            <div className="flex gap-2">
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void run('repair', api.repairDeps)}>
                <RefreshIcon /> {t('settings.repair')}
              </button>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void run('build', api.rebuild)}>
                <PowerIcon /> {t('settings.rebuild')}
              </button>
            </div>
            {repairTask && (
              <div>
                <TaskConsole task={repairTask} />
              </div>
            )}
            {buildTask && (
              <div>
                <TaskConsole task={buildTask} />
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {tab === 'api' && (
      <section className="space-y-4">
        <div className="panel p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              {t('settings.apiDesc')} <span className="mono">~/.dsh/.credentials.yaml</span>{t('settings.apiDesc.tail')}
            </p>
          </div>
          <Field label={t('settings.deepseekApiKey')} value={form.deepseekApiKey ?? ''} onChange={set('deepseekApiKey')} mono={false} hint={t('settings.deepseekApiKeyHint')} />
          <div className="space-y-3">
            {presets.length === 0 && (
              <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                {t('settings.noPresets')}
              </p>
            )}
            {presets.map((p) => {
              const isActive = p.id === activeId
              return (
                <div
                  key={p.id}
                  className="border rounded-lg p-3 space-y-2.5"
                  style={{
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    background: isActive ? 'var(--accent-soft)' : 'transparent'
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <input
                        className="input mono"
                        value={p.name}
                        placeholder={t('settings.presetNamePlaceholder')}
                        onChange={(e) => updatePreset(p.id, { name: e.target.value })}
                        style={{ width: 180 }}
                      />
                      {isActive && (
                        <span className="badge" style={{ color: '#fff', background: 'var(--accent)' }}>
                          {t('settings.current')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!isActive && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setActivePreset(p.id)}>
                          {t('settings.setActive')}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => removePreset(p.id)}
                        disabled={presets.length <= 1}
                      >
                        <TrashIcon /> {t('settings.delete')}
                      </button>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="label">{t('settings.baseUrl')}</label>
                      <input
                        className="input mono"
                        value={p.baseUrl}
                        placeholder="https://api.deepseek.com"
                        onChange={(e) => updatePreset(p.id, { baseUrl: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">{t('settings.balanceUrl')}</label>
                      <input
                        className="input mono"
                        value={p.balanceUrl}
                        placeholder="https://api.deepseek.com/user/balance"
                        onChange={(e) => updatePreset(p.id, { balanceUrl: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">{t('settings.apiKey')}</label>
                      <input
                        className="input mono"
                        type="password"
                        value={p.apiKey ?? ''}
                        placeholder="sk-…"
                        onChange={(e) => updatePreset(p.id, { apiKey: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={addPreset}>
              <PlusIcon /> {t('settings.addPreset')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => void doSave()}>
              {saved ? t('settings.saved') : t('settings.save')}
            </button>
          </div>
        </div>
      </section>
      )}

      {tab === 'update' && <AppUpdaterPanel />}

      {tab === 'system' && (
      <section className="space-y-4">
        <div className="panel p-5 space-y-5">
          {/* app-level options */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('settings.language')}</label>
              <select className="input" value={form.language ?? 'zh'} onChange={(e) => set('language')(e.target.value)}>
                <option value="zh">{t('settings.langZh')}</option>
                <option value="en">{t('settings.langEn')}</option>
              </select>
            </div>
            <div>
              <label className="label">{t('settings.marketPageSize')}</label>
              <input
                className="input mono"
                type="number"
                min={10}
                max={50}
                step={1}
                value={form.marketPageSize ?? 30}
                onChange={(e) => set('marketPageSize')(Number(e.target.value) || 30)}
              />
            </div>
          </div>
          <div>
            <label className="label">{t('settings.githubToken')}</label>
            <input
              className="input mono"
              type="password"
              value={form.githubToken ?? ''}
              placeholder="ghp_…"
              onChange={(e) => set('githubToken')(e.target.value)}
            />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>{t('settings.githubTokenHint')}</p>
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span>{t('settings.closeToTray')}</span>
            <Toggle checked={form.closeToTray ?? true} onChange={(v) => set('closeToTray')(v)} />
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span>{t('settings.floatingWhale')}</span>
            <Toggle checked={form.floatingWhale ?? false} onChange={(v) => set('floatingWhale')(v)} />
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span>{t('settings.splashEnabled')}</span>
            <Toggle checked={form.splashEnabled ?? true} onChange={(v) => set('splashEnabled')(v)} />
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span>{t('settings.autoStartOnLaunch')}</span>
            <Toggle checked={form.autoStartOnLaunch ?? false} onChange={(v) => set('autoStartOnLaunch')(v)} />
          </div>

          {/* paths & launch */}
          <div className="space-y-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <h3 className="section-title">{t('settings.pathsTitle')}</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('settings.runMode')}</label>
                <select className="input" value={form.installMode ?? 'npx'} onChange={(e) => set('installMode')(e.target.value)}>
                  <option value="npx">{t('settings.modeOptionNpx')}</option>
                  <option value="source">{t('settings.modeOptionSource')}</option>
                </select>
              </div>
              <Field label={t('settings.harnessRepo')} value={form.harnessRepo ?? ''} onChange={set('harnessRepo')} hint={t('settings.harnessRepoHint')} />
              <Field label={t('settings.harnessRepoUrl')} value={form.harnessRepoUrl ?? ''} onChange={set('harnessRepoUrl')} hint={t('settings.harnessRepoUrlHint')} />
              <Field label={t('settings.dshHome')} value={form.dshHome ?? ''} onChange={set('dshHome')} hint={t('settings.dshHomeHint')} />
              <Field label={t('settings.pluginDir')} value={form.pluginDir ?? ''} onChange={set('pluginDir')} hint={t('settings.pluginDirHint')} />
              <div>
                <label className="label">{t('settings.port')}</label>
                <input className="input mono" type="number" value={form.port ?? 3080} onChange={(e) => set('port')(Number(e.target.value) || 3080)} />
              </div>
              <Field label={t('settings.profile')} value={form.profile ?? ''} onChange={set('profile')} hint={t('settings.profileHint')} />
              <Field label={t('settings.nodePath')} value={form.nodePath ?? ''} onChange={set('nodePath')} />
            </div>
            <Field
              label={t('settings.launchArgs')}
              value={(form.launchArgs ?? []).join(' ')}
              onChange={(v) => set('launchArgs')(v.split(/\s+/).filter(Boolean))}
              hint={`${t('settings.launchArgsHint')} ${form.nodePath ?? 'node'} ${[...(form.launchArgs ?? []), form.profile ?? 'web'].join(' ')}`}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t('settings.buildCmd')} value={form.buildCmd ?? ''} onChange={set('buildCmd')} />
              <Field label={t('settings.pnpm')} value={form.pnpm ?? ''} onChange={set('pnpm')} />
            </div>
            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.stopOnQuit ?? true}
                  onChange={(e) => set('stopOnQuit')(e.target.checked)}
                />
                {t('settings.stopOnQuit')}
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('settings.startupTimeout')}</label>
                <input
                  className="input mono"
                  type="number"
                  value={form.startupTimeoutMs ?? 90000}
                  onChange={(e) => set('startupTimeoutMs')(Number(e.target.value) || 90000)}
                />
              </div>
            </div>
          </div>

          <p className="pt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
            {t('settings.autoSavedHint')}
          </p>
        </div>
      </section>
      )}

      {/* app icon — above the author attribution */}
      <div className="panel p-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="section-title">{lang === 'zh' ? '故障诊断' : 'Diagnostics'}</h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
            {lang === 'zh' ? '导出已脱敏的配置、运行状态、会话概览和最近日志；API Key 与令牌不会写入报告。' : 'Export redacted configuration, runtime state, session overview, and recent logs. API keys and tokens are excluded.'}
          </p>
        </div>
        <button className="btn btn-ghost shrink-0" onClick={async () => { const result = await api.exportDiagnostics(); setDiagnosticsDone(result.ok); setTimeout(() => setDiagnosticsDone(false), 2500) }}>
          <DownloadIcon /> {diagnosticsDone ? (lang === 'zh' ? '已导出 ✓' : 'Exported ✓') : (lang === 'zh' ? '导出报告' : 'Export report')}
        </button>
      </div>

      <div className="flex justify-center pt-2 select-none">
        <img
          src={whaleIcon}
          alt="DeepSeek Harness Manager"
          draggable={false}
          className="w-24 h-24 rounded-3xl object-cover border"
          style={{ background: '#fff', borderColor: 'rgba(128,128,128,0.25)' }}
        />
      </div>

      {/* author attribution — faint, with the three little character icons (no labels) */}
      <footer
        className="flex items-center justify-center gap-2 pt-2 select-none text-[10.5px]"
        style={{ color: 'var(--muted)', opacity: 0.55 }}
      >
        <span>Based on DSH Launcher by MarcoG-h · Community edition</span>
        <img src={rueIcon} alt="rue" title="rue" className="h-4 w-4 rounded-full object-cover" draggable={false} />
        <img src={proto1Icon} alt="proto1" title="proto1" className="h-4 w-4 rounded-full object-cover" draggable={false} />
        <img src={cedricIcon} alt="credit" title="credit" className="h-4 w-4 rounded-full object-cover" draggable={false} />
      </footer>
    </div>
  )
}
