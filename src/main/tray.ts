// System tray: keeps the launcher alive in the background when the window is
// closed with closeToTray enabled, and provides Show/Quit actions. The icon is
// a generated PNG embedded as base64 so no resource path exists to break in
// dev vs packaged builds. The icon always carries a coloured corner dot
// (green/yellow/red) mirroring dsh's runtime state — the dot is drawn into the
// bitmap in memory, so there is still no resource file to go missing.
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import * as dshStatus from './dsh-status'
import { getConfig } from './config'
import { t } from './i18n'
import { APP_NAME } from '../shared/brand'

// Embedded 32px application icon; the runtime status dot is drawn below.
const ICON_BASE64 = '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'

let tray: Tray | null = null
let win: BrowserWindow | null = null
let quitting = false
let notified = false

// Status-dot colour per light (RGBA). The dot sits in the bottom-right corner.
// null = no dot (light 'off').
const DOT_COLORS: Record<Exclude<dshStatus.DshLight, 'off'>, [number, number, number]> = {
  green: [0x34, 0xd3, 0x64],
  yellow: [0xf2, 0xb5, 0x0c],
  red: [0xef, 0x44, 0x44]
}
/** Cached status icons so setImage doesn't redraw every poll. */
const iconCache = new Map<string, Electron.NativeImage>()

/** Base icon + an optional coloured dot, rendered into the bitmap in memory. */
function makeTrayIcon(light: dshStatus.DshLight): Electron.NativeImage {
  const key = `light:${light}`
  const cached = iconCache.get(key)
  if (cached) return cached
  const base = nativeImage.createFromDataURL(`data:image/png;base64,${ICON_BASE64}`)
  const color = light === 'off' ? null : DOT_COLORS[light]
  if (!color) {
    iconCache.set(key, base)
    return base
  }
  const size = base.getSize()
  const bmp = base.toBitmap()
  const stride = size.width * 4
  // ~10px dot, ~1px inset from the bottom-right corner.
  const cx = size.width - 6
  const cy = size.height - 6
  const r = 5
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r * r) {
        // toBitmap/createFromBitmap on Windows are BGRA — write B,G,R so the
        // colours aren't swapped (a yellow dot was rendering blue before this).
        const i = y * stride + x * 4
        bmp[i] = color[2]     // B
        bmp[i + 1] = color[1] // G
        bmp[i + 2] = color[0] // R
        bmp[i + 3] = 255      // A
      }
    }
  }
  const icon = nativeImage.createFromBitmap(bmp, { width: size.width, height: size.height })
  iconCache.set(key, icon)
  return icon
}

export function isQuitting(): boolean {
  return quitting
}

/** Set before app.quit() so the window's close handler doesn't hide to tray. */
export function markQuitting(): void {
  quitting = true
}

/**
 * Bring the launcher window to the front — used by the tray menu, tray
 * double-click, and the single-instance handler when the desktop shortcut is
 * re-run while the app is already hidden to the tray.
 */
export function showLauncher(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// Status text per light (zh, en) — used for the hover tooltip and the status
// line at the top of the right-click menu.
const STATUS_TEXT: Record<dshStatus.DshLight, [string, string]> = {
  off: ['DSH 未运行', 'DSH not running'],
  green: ['DSH 运行中', 'DSH running'],
  yellow: ['DSH 等待处理', 'DSH awaiting input'],
  red: ['DSH 报错', 'DSH error']
}

/** Human-readable status in the current UI language. */
function statusLine(light: dshStatus.DshLight): string {
  const [zh, en] = STATUS_TEXT[light]
  return t(zh, en)
}

/** Tray hover tooltip, e.g. "DSH Manager — DSH 运行中". */
function tooltip(light: dshStatus.DshLight): string {
  const [zh, en] = STATUS_TEXT[light]
  return t(`${APP_NAME} — ${zh}`, `${APP_NAME} — ${en}`)
}

/** Small filled dot used as the icon of the menu's status line. */
function dotIcon(light: dshStatus.DshLight): Electron.NativeImage {
  const color = light === 'off' ? [0x9a, 0x9a, 0x9a] : DOT_COLORS[light]
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const r = 5.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - (size / 2 - 0.5)
      const dy = y - (size / 2 - 0.5)
      if (dx * dx + dy * dy <= r * r) {
        // BGRA byte order (see makeTrayIcon).
        const i = (y * size + x) * 4
        buf[i] = color[2]     // B
        buf[i + 1] = color[1] // G
        buf[i + 2] = color[0] // R
        buf[i + 3] = 255
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

/** Right-click menu; the first line is the live dsh status (disabled). */
function buildMenu(light: dshStatus.DshLight): Electron.Menu {
  return Menu.buildFromTemplate([
    { label: statusLine(light), enabled: false, icon: dotIcon(light) },
    { type: 'separator' },
    { label: t('显示主界面', 'Show Launcher'), click: showLauncher },
    { type: 'separator' },
    {
      label: t('退出', 'Quit'),
      click: () => {
        markQuitting()
        app.quit()
      }
    }
  ])
}

export function initTray(window: BrowserWindow): void {
  win = window
  tray = new Tray(makeTrayIcon('off'))
  // Status light: mirror dsh's runtime state in the tray icon (always on).
  // The light also drives the hover tooltip and the menu's status line, so all
  // three are refreshed together whenever the light changes. onDshLight fires
  // immediately with the current state, so this also seeds the initial values.
  let menu = buildMenu('off')
  const off = dshStatus.onDshLight((light) => {
    if (!tray) return
    tray.setImage(makeTrayIcon(light))
    tray.setToolTip(tooltip(light))
    menu = buildMenu(light)
  })
  win.on('closed', () => {
    off()
    win = null
  })
  // Left-click (and double-click) brings the window back. On Windows a context
  // menu attached via setContextMenu swallows the left click, so the menu is
  // popped up manually on right-click only.
  tray.on('click', showLauncher)
  tray.on('double-click', showLauncher)
  tray.on('right-click', () => tray?.popUpContextMenu(menu))
}

/**
 * Called from the window `close` handler. Returns true when the close was
 * swallowed and the window hidden to the tray instead.
 */
export function hideToTray(): boolean {
  if (quitting || !getConfig().closeToTray) return false
  win?.hide()
  if (!notified) {
    notified = true
    tray?.displayBalloon({
      title: APP_NAME,
      content: t('已最小化到系统托盘,仍在后台运行。', 'Minimized to system tray; still running in the background.')
    })
  }
  return true
}
