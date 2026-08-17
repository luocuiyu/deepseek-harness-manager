import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api, type AgentPresetListResult } from '../lib/api'
import { ExternalIcon, PlayIcon, RefreshIcon, TrashIcon } from '../lib/icons'
import { useI18n } from '../i18n'

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function AgentPresetsTab(): JSX.Element {
  const { t, lang } = useI18n()
  const [data, setData] = useState<AgentPresetListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.listAgentPresets())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (id: string, name: string, usedBy: string[]): Promise<void> => {
    const usageUnknown = !data?.usageAvailable
    const detail = usedBy.length
      ? t('presets.removeUsedDetail', { sessions: usedBy.join('、') })
      : usageUnknown
        ? t('presets.removeUnknownDetail')
        : t('presets.removeDetail')
    if (!window.confirm(`${t('presets.removeConfirm', { name })}\n\n${detail}`)) return
    setBusy(id)
    setError(null)
    try {
      const result = await api.removeAgentPreset(id, usageUnknown || usedBy.length > 0)
      if (!result.ok) throw new Error(result.error || t('presets.removeFailed'))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const restore = async (trashId: string): Promise<void> => {
    setBusy(trashId)
    setError(null)
    try {
      const result = await api.restoreAgentPreset(trashId)
      if (!result.ok) throw new Error(result.error || t('presets.restoreFailed'))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  const destroy = async (trashId: string, name: string): Promise<void> => {
    if (!window.confirm(t('presets.destroyConfirm', { name }))) return
    setBusy(trashId)
    setError(null)
    try {
      const result = await api.deleteAgentPresetPermanently(trashId)
      if (!result.ok) throw new Error(result.error || t('presets.destroyFailed'))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) {
    return <div className="card p-5 text-[13px]" style={{ color: 'var(--muted)' }}>{t('presets.loading')}</div>
  }

  const presets = data?.presets ?? []
  const trash = data?.trash ?? []
  return (
    <div className="space-y-4">
      <div className="panel p-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="section-title">{t('presets.title', { count: presets.length })}</h3>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>{t('presets.description')}</p>
          <p className="mt-2 mono text-[11px] break-all" style={{ color: 'var(--muted)' }}>{data?.root}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => void api.openAgentPreset()}>
            <ExternalIcon /> {t('presets.openRoot')}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void load()}>
            <RefreshIcon /> {t('market.refresh')}
          </button>
        </div>
      </div>

      {!data?.usageAvailable && data?.usageError && (
        <div className="card p-3 text-[12px]" style={{ color: 'var(--warn)' }}>{data.usageError} {t('presets.usageUnknown')}</div>
      )}
      {error && <div className="card p-3 text-[12px]" style={{ color: 'var(--err)' }}>{error}</div>}

      {presets.length === 0 ? (
        <div className="card p-5 text-[13px]" style={{ color: 'var(--muted)' }}>{t('presets.empty')}</div>
      ) : (
        <div className="grid gap-2.5">
          {presets.map((preset) => {
            const usedNames = preset.usedBySessions.map((session) => session.title || session.sessionId.slice(0, 8))
            return (
              <div key={preset.id} className="card p-4">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold">{preset.name}</span>
                      <span className="badge" style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}>{t('presets.userAdded')}</span>
                      {preset.usedBySessions.length > 0 ? (
                        <span className="badge" style={{ color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 14%, transparent)' }}>
                          {t('presets.inUse', { count: preset.usedBySessions.length })}
                        </span>
                      ) : data?.usageAvailable ? (
                        <span className="badge" style={{ color: 'var(--muted)', background: 'var(--bg-soft)' }}>{t('presets.notInUse')}</span>
                      ) : null}
                    </div>
                    {preset.description && <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{preset.description}</p>}
                    {usedNames.length > 0 && (
                      <p className="mt-2 text-[11.5px]" style={{ color: 'var(--ok)' }}>{t('presets.usedBy')}: {usedNames.join('、')}</p>
                    )}
                    <div className="mt-2 flex gap-x-4 gap-y-1 flex-wrap text-[11px]" style={{ color: 'var(--muted)' }}>
                      <span className="mono">{preset.id}</span>
                      <span>{t('presets.files', { count: preset.fileCount })} · {bytes(preset.totalBytes)}</span>
                      <span>{new Date(preset.updatedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    </div>
                    <div className="mt-1 mono text-[10.5px] break-all" style={{ color: 'var(--muted)' }}>{preset.path}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void api.openAgentPreset(preset.id)}>
                      <ExternalIcon /> {t('presets.openFolder')}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={busy !== null}
                      onClick={() => void remove(preset.id, preset.name, usedNames)}
                    >
                      <TrashIcon /> {busy === preset.id ? t('presets.removing') : t('presets.moveToTrash')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <section className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="section-title">{t('presets.trashTitle', { count: trash.length })}</h3>
            <p className="mt-1 text-[11.5px]" style={{ color: 'var(--muted)' }}>{t('presets.trashHint')}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => void api.openAgentPresetTrash()}>
            <ExternalIcon /> {t('presets.openTrash')}
          </button>
        </div>
        {trash.length === 0 ? (
          <div className="card p-4 text-[12.5px]" style={{ color: 'var(--muted)' }}>{t('presets.trashEmpty')}</div>
        ) : (
          <div className="grid gap-2.5">
            {trash.map((item) => (
              <div key={item.trashId} className="card p-4 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[13px]">{item.name}</div>
                  {item.description && <p className="mt-1 text-[12px] line-clamp-2" style={{ color: 'var(--muted)' }}>{item.description}</p>}
                  <div className="mt-2 flex gap-x-4 gap-y-1 flex-wrap text-[11px]" style={{ color: 'var(--muted)' }}>
                    <span className="mono">{item.presetId}</span>
                    <span>{t('presets.files', { count: item.fileCount })} · {bytes(item.totalBytes)}</span>
                    <span>{t('presets.deletedAt')} {new Date(item.deletedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void restore(item.trashId)}>
                    <PlayIcon /> {t('presets.restore')}
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={busy !== null} onClick={() => void destroy(item.trashId, item.name)}>
                    <TrashIcon /> {t('presets.destroy')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
