import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { DownloadIcon, ExternalIcon, PowerIcon, RefreshIcon } from '../lib/icons'

const RELEASE_URL = 'https://github.com/luocuiyu/deepseek-harness-manager/releases/latest'

function size(value: number | null): string {
  if (value == null) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

export function UpdateProgressOverlay({ onViewDetails }: { onViewDetails: () => void }): JSX.Element | null {
  const { state, overlayOpen, hideOverlay, download } = useAppUpdate()
  const { t } = useI18n()
  const [lastProgressAt, setLastProgressAt] = useState(Date.now())
  const [clock, setClock] = useState(Date.now())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (state?.status === 'downloading') setLastProgressAt(Date.now())
  }, [state?.status, state?.progress, state?.transferred])

  useEffect(() => {
    if (state?.status !== 'downloading') return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [state?.status])

  const eta = useMemo(() => {
    if (!state?.bytesPerSecond || state.total == null || state.transferred == null) return null
    return Math.max(0, (state.total - state.transferred) / state.bytesPerSecond)
  }, [state?.bytesPerSecond, state?.total, state?.transferred])

  if (!state || !overlayOpen) return null
  if (!['available', 'downloading', 'downloaded', 'error'].includes(state.status)) return null

  const percent = Math.max(0, Math.min(100, state.progress ?? 0))
  const slow = state.status === 'downloading' && clock - lastProgressAt > 15_000
  const title = state.status === 'available'
    ? t('updates.overlayPreparing')
    : state.status === 'downloading'
      ? t('updates.overlayDownloading', { version: state.availableVersion ?? '' })
      : state.status === 'downloaded'
        ? t('updates.overlayDownloaded', { version: state.availableVersion ?? '' })
        : t('updates.overlayFailed')

  return (
    <div className="fixed z-[100] right-5 bottom-5 w-[min(410px,calc(100vw-40px))]" aria-live="polite">
      <section className="panel p-5 shadow-2xl space-y-4" style={{ boxShadow: '0 18px 50px rgba(0,0,0,0.38)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold text-[14px]">{title}</div>
            <div className="mt-1 text-[11.5px]" style={{ color: 'var(--muted)' }}>
              {state.status === 'available'
                ? t('updates.connecting')
                : state.status === 'downloading'
                  ? slow ? t('updates.slowNetwork') : t('updates.backgroundHint')
                  : state.status === 'downloaded'
                    ? t('updates.installHint')
                    : t('updates.recoveryHint')}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={hideOverlay}>{t('updates.hide')}</button>
        </div>

        {(state.status === 'available' || state.status === 'downloading') && (
          <div className="space-y-2">
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{ background: 'var(--bg-soft)' }}
              role="progressbar"
              aria-label={t('updates.downloadProgress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
            >
              <div
                className={`h-full transition-[width] duration-200 ${state.status === 'available' ? 'progress-indeterminate' : ''}`}
                style={state.status === 'available' ? undefined : { width: `${percent}%`, background: 'var(--accent)' }}
              />
            </div>
            <div className="flex justify-between gap-4 text-[11px]" style={{ color: 'var(--muted)' }}>
              <span>{state.status === 'downloading' ? `${size(state.transferred)} / ${size(state.total)}` : t('updates.waitingForDownload')}</span>
              <span>{state.status === 'downloading' ? `${Math.round(percent)}% · ${size(state.bytesPerSecond)}/s` : '0%'}</span>
            </div>
            {eta != null && <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{t('updates.eta', { time: duration(eta) })}</div>}
          </div>
        )}

        {state.status === 'error' && state.error && (
          <div className="rounded-[9px] p-3 text-[11.5px] break-words select-text" style={{ color: 'var(--err)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.24)' }}>
            {state.error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onViewDetails}>{t('updates.viewDetails')}</button>
          {state.status === 'available' && (
            <button className="btn btn-primary btn-sm" onClick={download}><DownloadIcon />{t('updates.download')}</button>
          )}
          {state.status === 'downloaded' && (
            <button className="btn btn-primary btn-sm" onClick={() => void api.installUpdate()}><PowerIcon />{t('updates.restartInstall')}</button>
          )}
          {state.status === 'error' && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => void api.confirmOpenExternal(RELEASE_URL)}><ExternalIcon />{t('updates.manualDownload')}</button>
              {state.error && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    void api.copyText(state.error ?? '')
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1600)
                  }}
                >
                  {copied ? t('updates.copied') : t('updates.copyError')}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={download}><RefreshIcon />{t('updates.retry')}</button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
