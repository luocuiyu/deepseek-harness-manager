import { useMemo } from 'react'
import type { JSX } from 'react'
import { api } from '../lib/api'
import { DownloadIcon, PowerIcon, RefreshIcon } from '../lib/icons'
import { useI18n } from '../i18n'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { renderMarkdown } from '../lib/markdown'

function size(value: number | null): string {
  if (value == null) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function AppUpdaterPanel(): JSX.Element {
  const { t } = useI18n()
  const { state, download } = useAppUpdate()
  const releaseNotesHtml = useMemo(() => state?.releaseNotes ? renderMarkdown(state.releaseNotes) : '', [state?.releaseNotes])

  const statusText = !state
    ? t('updates.loading')
    : state.status === 'checking'
      ? t('updates.checking')
      : state.status === 'available'
        ? t('updates.available', { version: state.availableVersion ?? '' })
        : state.status === 'downloading'
          ? t('updates.downloading', { progress: Math.round(state.progress ?? 0) })
          : state.status === 'downloaded'
            ? t('updates.downloaded', { version: state.availableVersion ?? '' })
            : state.status === 'not-available'
              ? t('updates.latest')
              : state.status === 'error'
                ? t('updates.failed')
                : t('updates.ready')

  return (
    <section className="space-y-4">
      <div className="panel p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="section-title">{t('updates.title')}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>{t('updates.description')}</p>
          </div>
          <span className="badge" style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}>
            v{state?.currentVersion ?? '—'}
          </span>
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-[13px]">{statusText}</div>
              {state?.checkedAt && <div className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>{t('updates.checkedAt')} {new Date(state.checkedAt).toLocaleString()}</div>}
            </div>
            <div className="flex gap-2">
              {(state?.status === 'available' || state?.status === 'error') && state?.availableVersion && (
                <button className="btn btn-primary btn-sm" onClick={download}>
                  <DownloadIcon /> {t('updates.download')}
                </button>
              )}
              {state?.status === 'available' && state.availableVersion && (
                <button className="btn btn-ghost btn-sm" onClick={() => void api.skipUpdate(state.availableVersion!)}>{t('updates.skip')}</button>
              )}
              {state?.status === 'downloaded' && (
                <button className="btn btn-primary btn-sm" onClick={() => void api.installUpdate()}>
                  <PowerIcon /> {t('updates.restartInstall')}
                </button>
              )}
              {state?.status !== 'checking' && state?.status !== 'downloading' && state?.status !== 'downloaded' && (
                <button className="btn btn-ghost btn-sm" onClick={() => void api.checkForUpdates()}>
                  <RefreshIcon /> {t('updates.checkNow')}
                </button>
              )}
            </div>
          </div>

          {state?.status === 'downloading' && (
            <div className="space-y-1.5">
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--bg-soft)' }}
                role="progressbar"
                aria-label={t('updates.downloadProgress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(state.progress ?? 0)}
              >
                <div className="h-full transition-all" style={{ width: `${Math.max(0, Math.min(100, state.progress ?? 0))}%`, background: 'var(--accent)' }} />
              </div>
              <div className="flex justify-between text-[10.5px]" style={{ color: 'var(--muted)' }}>
                <span>{size(state.transferred)} / {size(state.total)}</span>
                <span>{size(state.bytesPerSecond)}/s</span>
              </div>
            </div>
          )}

          {state?.error && <p className="text-[12px] break-words" style={{ color: 'var(--err)' }}>{state.error}</p>}
          {(state?.releaseName || state?.releaseNotes) && (
            <div className="border-t pt-3 space-y-1.5" style={{ borderColor: 'var(--border)' }}>
              {state.releaseName && <div className="font-medium text-[12.5px]">{state.releaseName}</div>}
              {state.releaseNotes && (
                <div
                  className="market-md max-h-52 overflow-auto select-text"
                  style={{ color: 'var(--muted)' }}
                  dangerouslySetInnerHTML={{ __html: releaseNotesHtml }}
                  onClick={(event) => {
                    const anchor = (event.target as Element).closest('a')
                    const href = anchor?.getAttribute('href')
                    if (!href || !/^https?:/i.test(href)) return
                    event.preventDefault()
                    void api.confirmOpenExternal(href)
                  }}
                />
              )}
            </div>
          )}
        </div>

        <div className="text-[13px]">
          <div>
            <div>{t('updates.autoCheck')}</div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>{t('updates.autoCheckHint')}</div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>{t('updates.sourceHint')}</p>
      </div>
    </section>
  )
}
