import { app, type WebContents } from 'electron'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from './config'
import { clampAppearance, GLASS_DEFAULTS } from '../shared/appearance'
import glassCss from './dsh-glass.css?raw'

const here = dirname(fileURLToPath(import.meta.url))
let wallpaper: string | undefined
const inserted = new WeakMap<WebContents, string>()
const revisions = new WeakMap<WebContents, number>()

/** Style only the configured local DSH origin; no preload or Node bridge in the guest. */
function isDsh(contents: WebContents): boolean {
  try { return new URL(contents.getURL()).origin === `http://127.0.0.1:${getConfig().port}` } catch { return false }
}

function wallpaperUrl(): string {
  if (wallpaper) return wallpaper
  const path = app.isPackaged
    ? join(here, '../renderer/wallpaper.webp')
    : join(app.getAppPath(), 'src/renderer/public/wallpaper.webp')
  wallpaper = `url("data:image/webp;base64,${readFileSync(path).toString('base64')}")`
  return wallpaper
}

export async function applyDshAppearance(contents: WebContents): Promise<void> {
  const revision = (revisions.get(contents) ?? 0) + 1
  revisions.set(contents, revision)
  try {
    const old = inserted.get(contents)
    inserted.delete(contents)
    if (old && !contents.isDestroyed()) await contents.removeInsertedCSS(old)
    if (contents.isDestroyed() || !isDsh(contents) || revisions.get(contents) !== revision) return
    const config = getConfig()
    if (!config.glassEnabled) return
    const dim = clampAppearance(config.wallpaperDim, GLASS_DEFAULTS.wallpaperDim, 15, 75) / 100
    const blur = clampAppearance(config.glassBlur, GLASS_DEFAULTS.glassBlur, 0, 32)
    const css = `:root { --manager-wallpaper: ${wallpaperUrl()}; --manager-dim: ${dim}; --manager-blur: ${blur}px; }\n${glassCss}`
    const key = await contents.insertCSS(css, { cssOrigin: 'author' })
    if (contents.isDestroyed()) return
    if (revisions.get(contents) !== revision) await contents.removeInsertedCSS(key)
    else inserted.set(contents, key)
  } catch {
    // A guest navigation/close may race the style update. Preserve the native UI.
    console.warn('[appearance] Embedded theme could not be applied.')
  }
}
