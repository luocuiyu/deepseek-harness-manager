import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { api, type SessionOverview, type SessionSummary } from '../lib/api'
import { useHarness } from '../hooks/useHarness'
import { useI18n } from '../i18n'
import { RefreshIcon } from '../lib/icons'

function formatTime(value: number, language: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value))
}

function formatTokens(value: number | null): string {
  if (value === null) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
}

function SessionCard({ session, selected, onSelect, lang }: { session: SessionSummary; selected: boolean; onSelect: () => void; lang: 'zh' | 'en' }): JSX.Element {
  const title = session.title || session.cwd.split(/[\\/]/).filter(Boolean).pop() || session.sessionId.slice(0, 10)
  return (
    <button
      onClick={onSelect}
      className="card w-full p-3.5 text-left transition-colors"
      style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)', background: selected ? 'var(--accent-soft)' : 'var(--panel)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[13px] truncate">{title}</div>
          <div className="mono text-[10.5px] mt-1 truncate" style={{ color: 'var(--muted)' }}>{session.cwd || session.sessionId}</div>
        </div>
        <span className="badge shrink-0" style={{ color: session.running ? 'var(--ok)' : 'var(--muted)', background: 'var(--bg-soft)' }}>
          <span className="badge-dot" style={{ background: session.running ? 'var(--ok)' : 'var(--muted)' }} />
          {session.running ? (lang === 'zh' ? '运行中' : 'Running') : (lang === 'zh' ? '已暂停' : 'Idle')}
        </span>
      </div>
      <div className="mt-2 flex gap-3 text-[11px]" style={{ color: 'var(--muted)' }}>
        <span>{formatTime(session.updatedAt, lang)}</span>
        {session.origin === 'subagent' && <span>{lang === 'zh' ? '子代理' : 'Subagent'}</span>}
        {session.agentPreset && <span>{session.agentPreset}</span>}
      </div>
    </button>
  )
}

export function Sessions({ onOpenDsh }: { onOpenDsh: () => void }): JSX.Element {
  const { state } = useHarness()
  const { lang } = useI18n()
  const [data, setData] = useState<SessionOverview | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const ready = state?.status === 'running' || state?.status === 'external'
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await api.getSessionOverview()
      setData(next)
      setSelectedId((current) => current || next.sessions[0]?.sessionId || '')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ready) void load()
  }, [ready, load])

  useEffect(() => {
    if (!ready) return
    const timer = setInterval(() => void load(), 10_000)
    return () => clearInterval(timer)
  }, [ready, load])

  const sessions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return data?.sessions ?? []
    return (data?.sessions ?? []).filter((session) =>
      [session.title, session.cwd, session.sessionId, session.agentPreset].some((value) => value?.toLowerCase().includes(needle))
    )
  }, [data, query])
  const selected = data?.sessions.find((session) => session.sessionId === selectedId) ?? sessions[0]

  if (!ready) {
    return (
      <div className="p-5 max-w-[1050px]">
        <div className="panel p-8 text-center">
          <h2 className="text-[18px] font-semibold">{lang === 'zh' ? '会话观察台' : 'Session observer'}</h2>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>
            {lang === 'zh' ? '启动 DeepSeek Harness 后即可读取本机会话和插件可用性。' : 'Start DeepSeek Harness to inspect local sessions and plugin availability.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4 max-w-[1150px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold">{lang === 'zh' ? '会话观察台' : 'Session observer'}</h2>
          <p className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>
            {data?.hostName || 'DeepSeek Harness'} {data?.hostVersion ? `· ${data.hostVersion}` : ''} · profile {data?.profile}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void load()}><RefreshIcon /> {lang === 'zh' ? '刷新' : 'Refresh'}</button>
      </div>

      {data && !data.ok && <div className="card p-3 text-[12px]" style={{ color: 'var(--warn)' }}>{data.error}</div>}

      <div className="grid grid-cols-[minmax(300px,0.9fr)_minmax(360px,1.1fr)] gap-4 items-start">
        <section className="space-y-2.5">
          <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === 'zh' ? '搜索标题、目录或会话 ID…' : 'Search title, directory, or session ID…'} />
          <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{lang === 'zh' ? `共 ${sessions.length} 个会话` : `${sessions.length} sessions`}</div>
          <div className="space-y-2 max-h-[590px] overflow-y-auto pr-1">
            {sessions.map((session) => <SessionCard key={session.sessionId} session={session} selected={selected?.sessionId === session.sessionId} onSelect={() => setSelectedId(session.sessionId)} lang={lang} />)}
            {sessions.length === 0 && <div className="card p-5 text-[13px]" style={{ color: 'var(--muted)' }}>{lang === 'zh' ? '暂无匹配会话。' : 'No matching sessions.'}</div>}
          </div>
        </section>

        <section className="space-y-3 sticky top-5">
          {selected ? (
            <div className="panel p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{selected.title || (lang === 'zh' ? '未命名会话' : 'Untitled session')}</h3>
                  <div className="mono text-[10.5px] mt-1 break-all" style={{ color: 'var(--muted)' }}>{selected.sessionId}</div>
                </div>
                <button className="btn btn-primary btn-sm shrink-0" onClick={onOpenDsh}>{lang === 'zh' ? '进入 DSH' : 'Open DSH'}</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  [lang === 'zh' ? 'Token 用量' : 'Token usage', formatTokens(selected.tokenUsage)],
                  [lang === 'zh' ? '上下文压力' : 'Context pressure', selected.contextPressure === null ? '—' : `${Math.round(selected.contextPressure <= 1 ? selected.contextPressure * 100 : selected.contextPressure)}%`],
                  [lang === 'zh' ? '轮次' : 'Turns', selected.turnCount ?? '—']
                ].map(([label, value]) => <div className="card p-3" key={String(label)}><div className="text-[10.5px]" style={{ color: 'var(--muted)' }}>{label}</div><div className="mono mt-1 font-semibold">{value}</div></div>)}
              </div>
              <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-[12px]">
                <dt style={{ color: 'var(--muted)' }}>{lang === 'zh' ? '工作目录' : 'Directory'}</dt><dd className="mono break-all">{selected.cwd || '—'}</dd>
                <dt style={{ color: 'var(--muted)' }}>{lang === 'zh' ? '模型' : 'Model'}</dt><dd>{selected.model || '—'}</dd>
                <dt style={{ color: 'var(--muted)' }}>{lang === 'zh' ? '代理预设' : 'Agent preset'}</dt><dd>{selected.agentPreset || '—'}</dd>
                <dt style={{ color: 'var(--muted)' }}>{lang === 'zh' ? '父会话' : 'Parent'}</dt><dd className="mono break-all">{selected.parentSessionId || '—'}</dd>
              </dl>
            </div>
          ) : null}

          <div className="panel p-4">
            <div className="flex items-center justify-between"><h3 className="section-title">{lang === 'zh' ? '当前 profile 可用插件' : 'Plugins available to this profile'}</h3><span className="badge">{data?.plugins.length ?? 0}</span></div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--muted)' }}>
              {lang === 'zh' ? '此处表示会话可用范围，不等同于该会话已经调用。来源标签来自安装台账；旧安装会标为推断。' : 'Availability does not mean a session actually invoked a plugin. Provenance comes from the install ledger; legacy entries are inferred.'}
            </p>
            <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto">
              {(data?.plugins ?? []).map((plugin) => (
                <div key={plugin.name} className="card p-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="mono text-[11.5px] truncate">{plugin.name}</div><div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{plugin.originConfidence === 'confirmed' ? (lang === 'zh' ? '已确认' : 'Confirmed') : (lang === 'zh' ? '推断' : 'Inferred')}</div></div>
                  <span className="badge shrink-0" style={{ color: plugin.origin === 'official' ? 'var(--accent)' : 'var(--muted)', background: 'var(--bg-soft)' }}>{plugin.origin}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
