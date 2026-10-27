import { useState } from 'react'
import type { JSX } from 'react'
import { api } from '../lib/api'
import { useHarness } from '../hooks/useHarness'
import { useI18n } from '../i18n'
import { ChevronIcon, GearIcon, PanelIcon, SessionsIcon } from '../lib/icons'
import { StatusPill } from '../components/StatusPill'

interface Props { authRequired: boolean; onConnected: () => void; onOpenDsh: () => void; onSessions: () => void; onAppearance: () => void }

export function Welcome({ authRequired, onConnected, onOpenDsh, onSessions, onAppearance }: Props): JSX.Element {
  const { state, config, start, actionError, dismissError } = useHarness()
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const [busy, setBusy] = useState(false)
  const [authUrl, setAuthUrl] = useState('')
  const [authError, setAuthError] = useState('')
  async function connect(): Promise<void> {
    setBusy(true)
    try {
      const result = await api.connectDsh(authUrl)
      if (result.ok) { setAuthUrl(''); setAuthError(''); onConnected() }
      else setAuthError(result.error ?? 'Unable to connect')
    } finally { setBusy(false) }
  }
  const ready = state?.status === 'running' || state?.status === 'external'
  const starting = busy || state?.status === 'starting' || state?.status === 'stopping'
  const preset = config?.apiPresets.find(p => p.id === config.activeApiPresetId)

  async function enter(): Promise<void> {
    if (ready) { onOpenDsh(); return }
    setBusy(true)
    try { await start() } finally { setBusy(false) }
  }

  return (
    <section className="welcome-page" aria-label={zh ? '新的探索' : 'A new exploration'}>
      <div className="welcome-topline">
        <span><span className="welcome-star">✧</span> {zh ? '新的探索' : 'A new exploration'}</span>
        <button className="btn btn-ghost btn-sm" onClick={onAppearance}><GearIcon /> {zh ? '外观' : 'Appearance'}</button>
      </div>
      <div className="welcome-hero">
        <p className="welcome-eyebrow">YOUR SPACE. YOUR IDEAS.</p>
        <h1>{zh ? '探索未至之境' : 'Explore what’s next'}</h1>
        <p className="welcome-subtitle">{zh ? '从一个想法开始，或者继续上次的项目。' : 'Start with an idea, or pick up where you left off.'}</p>
        <div className="welcome-actions">
          <button className="btn btn-ghost" disabled={!ready} onClick={onOpenDsh}><PanelIcon /> {zh ? '看看代码' : 'Open workspace'}</button>
          <button className="btn btn-ghost" disabled={!ready} onClick={onSessions}><SessionsIcon /> {zh ? '继续项目' : 'Continue a project'}</button>
        </div>
      </div>
      <div className="welcome-bottom">
        {actionError && <div className="welcome-error" role="alert"><span>{actionError}</span><button onClick={dismissError} aria-label={zh ? '关闭错误' : 'Dismiss error'}>×</button></div>}
        {authRequired ? <form className="welcome-launch-card connection-card" onSubmit={event => { event.preventDefault(); void connect() }}>
          <h2>{zh ? '连接正在运行的 DSH' : 'Connect to running DSH'}</h2>
          <p className="welcome-launch-hint">{zh ? '这个实例需要启动链接认证。粘贴它在终端打印的完整链接（含 token），或在控制台通过 Manager 重启服务后再进入。' : 'Paste the full startup URL printed by this instance (including token), or restart it through Manager from the console.'}</p>
          <label className="label" htmlFor="dsh-auth-url">{zh ? '本机 DSH 启动链接' : 'Local DSH startup URL'}</label>
          <input id="dsh-auth-url" className="input" type="password" autoComplete="off" spellCheck={false} value={authUrl} onChange={event => setAuthUrl(event.target.value)} placeholder={`http://127.0.0.1:${config?.port ?? 3080}/?token=…`} />
          {authError && <p className="connection-error" role="alert">{authError}</p>}
          <div className="welcome-launch-row"><small>{zh ? '链接只用于本机连接，不写入配置或日志。' : 'Kept in memory; never saved to config or logs.'}</small><button className="btn btn-primary" disabled={busy || !authUrl.trim()}>{zh ? '连接工作区' : 'Connect'}</button></div>
        </form> : <div className="welcome-launch-card">
          <p>{zh ? '有什么想一起完成的？' : 'What shall we work on?'}</p>
          <span className="welcome-launch-hint">{ready ? (zh ? '进入工作区，开始编写你的任务。' : 'Open your workspace and write your next task.') : (zh ? '启动 DeepSeek Harness，让想法开始发生。' : 'Start DeepSeek Harness to bring your idea to life.')}</span>
          <div className="welcome-launch-row">
            <span className="welcome-provider">{preset?.name ?? 'DeepSeek'} <span>· {config?.profile ?? 'web'}</span></span>
            <button className="btn btn-primary" disabled={starting || !config} onClick={() => void enter()}>
              {starting ? (zh ? '正在启动…' : 'Starting…') : ready ? (zh ? '进入工作区' : 'Open workspace') : (zh ? '启动 Harness' : 'Start Harness')}<ChevronIcon dir="right" />
            </button>
          </div>
        </div>}
        <footer className="welcome-status"><span>◫ {zh ? '本地工作空间' : 'Local workspace'} · {config?.profile ?? 'web'}</span><StatusPill status={state?.status} /></footer>
      </div>
    </section>
  )
}
