import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useHarness } from '../hooks/useHarness'

/** One offline five-second film, without a title or logo over the artwork. */
export function SplashOverlay({ onDone }: { onDone: () => void }): JSX.Element | null {
  const { config } = useHarness()
  const done = useRef(onDone)
  const finished = useRef(false)
  const [reducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  done.current = onDone
  const enabled = Boolean(config?.splashEnabled)
  const finish = (): void => {
    if (finished.current) return
    finished.current = true
    done.current()
  }

  useEffect(() => {
    if (!enabled) return
    // Decode/network failures and suspended playback must never trap the user.
    const timer = setTimeout(finish, reducedMotion ? 100 : 6500)
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') finish() }
    window.addEventListener('keydown', key)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', key) }
  }, [enabled, reducedMotion])

  if (!enabled) return null
  const zh = config?.language !== 'en'
  return <div className="glass-splash" role="dialog" aria-label={zh ? '启动画面' : 'Starting'}>
    {!reducedMotion && <video className="glass-splash-video" src="./splash.mp4" autoPlay muted playsInline preload="auto" onEnded={finish} onError={finish} />}
    <button className="btn btn-ghost" onClick={finish}>{zh ? '跳过 · Esc' : 'Skip · Esc'}</button>
  </div>
}
