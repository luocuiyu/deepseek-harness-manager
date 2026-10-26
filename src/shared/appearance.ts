import type { ApiPreset } from './types'

export const SIDEBAR_EXPANDED = 174
export const SIDEBAR_COLLAPSED = 56
export const GLASS_DEFAULTS = { glassEnabled: true, wallpaperDim: 36, glassBlur: 22 }
export const DEEPSEEK_MESSAGES_BASE = 'https://api.deepseek.com/anthropic'

/** Only the shipped official preset is migrated; custom gateways stay verbatim. */
export function migrateOfficialPreset(preset: ApiPreset): ApiPreset {
  if (preset.id === 'deepseek-official' && /^https:\/\/api\.deepseek\.com\/?$/.test(preset.baseUrl)) {
    return { ...preset, baseUrl: DEEPSEEK_MESSAGES_BASE }
  }
  return preset
}

export function clampAppearance(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
