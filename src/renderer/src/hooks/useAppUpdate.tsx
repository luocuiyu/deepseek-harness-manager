import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { api, type AppUpdateState } from '../lib/api'

interface AppUpdateContextValue {
  state: AppUpdateState | null
  overlayOpen: boolean
  showOverlay(): void
  hideOverlay(): void
  download(): void
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null)

function shouldOpen(next: AppUpdateState): boolean {
  return next.status === 'downloading' || next.status === 'downloaded' || (next.status === 'error' && Boolean(next.availableVersion))
}

export function AppUpdateProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AppUpdateState | null>(null)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const previousStatus = useRef<AppUpdateState['status'] | null>(null)

  const applyState = useCallback((next: AppUpdateState): void => {
    const changed = previousStatus.current !== next.status
    previousStatus.current = next.status
    setState(next)
    if (shouldOpen(next) && changed) {
      setOverlayOpen(true)
    }
  }, [])

  useEffect(() => {
    void api.getUpdateState().then(applyState)
    return api.onEvent((event) => {
      if (event.type === 'update') applyState(event.state)
    })
  }, [applyState])

  const download = useCallback((): void => {
    setOverlayOpen(true)
    void api.downloadUpdate().then(applyState)
  }, [applyState])

  return (
    <AppUpdateContext.Provider
      value={{
        state,
        overlayOpen,
        showOverlay: () => setOverlayOpen(true),
        hideOverlay: () => setOverlayOpen(false),
        download
      }}
    >
      {children}
    </AppUpdateContext.Provider>
  )
}

export function useAppUpdate(): AppUpdateContextValue {
  const value = useContext(AppUpdateContext)
  if (!value) throw new Error('useAppUpdate must be used inside AppUpdateProvider')
  return value
}
