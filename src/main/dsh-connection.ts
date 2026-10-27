import { StringDecoder } from 'node:string_decoder'

export interface DshScope { port: number; dshHome: string }

/** The web profile owns these flags; the manager always keeps it in-app. */
export function managedArgs(base: string[], profile: string, port: number): string[] {
  if (profile !== 'web') return [...base, profile]
  const args: string[] = []
  for (let i = 0; i < base.length; i++) {
    const arg = base[i]
    if (arg === '--open' || arg === '--no-open') continue
    if (arg === '--port') { i++; continue }
    if (arg.startsWith('--port=') || arg.startsWith('--open=')) continue
    args.push(arg)
  }
  return [...args, profile, '--no-open', '--port', String(port)]
}

/** Accept only this local listener's root URL; never navigate to pasted hosts. */
export function localLaunchUrl(raw: string, scope: DshScope, requireToken = true): string | null {
  if (raw.length > 4096 || /[\r\n\t]/.test(raw)) return null
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null
    if (Number(url.port || 80) !== scope.port || url.pathname !== '/' || url.username || url.password || url.hash) return null
    const tokens = url.searchParams.getAll('token')
    if (tokens.length > 1 || (requireToken && tokens.length !== 1)) return null
    if (tokens.length && (!tokens[0] || tokens[0].length > 2048 || /\s/.test(tokens[0]))) return null
    const target = new URL(`http://127.0.0.1:${scope.port}/`)
    if (tokens.length) target.searchParams.set('token', tokens[0])
    return target.href
  } catch { return null }
}

export function redactLaunchTokens(line: string): string {
  return line.replace(/([?&](?:token|access_token)=)[^\s&#"'<>]*/gi, '$1[REDACTED]')
}

/** Process-scoped launch tokens stay in memory, never config/renderer/logs. */
export class DshConnection {
  private scope: DshScope | null = null
  private url: string | null = null
  private announced = false
  reset(scope: DshScope): void { this.scope = { ...scope }; this.url = null; this.announced = false }
  private matches(scope: DshScope): boolean { return this.scope?.port === scope.port && this.scope.dshHome === scope.dshHome }
  observe(line: string, scope: DshScope): void {
    for (const candidate of line.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
      const url = localLaunchUrl(candidate, scope, false)
      if (!url || (!new URL(url).searchParams.has('token') && !/dsh web:/i.test(line))) continue
      if (!this.matches(scope)) this.reset(scope)
      this.url = url
      this.announced = true
    }
  }
  enter(raw: string, scope: DshScope): boolean {
    const url = localLaunchUrl(raw, scope)
    if (!url) return false
    if (!this.matches(scope)) this.reset(scope)
    this.url = url; this.announced = true
    return true
  }
  isAnnounced(scope: DshScope): boolean { return this.matches(scope) && this.announced }
  getUrl(scope: DshScope): string { return this.matches(scope) && this.url ? this.url : `http://127.0.0.1:${scope.port}/` }
}

/** Preserve UTF-8 and URLs across arbitrarily split stdout/stderr chunks. */
export function lineCollector(emit: (line: string) => void): { write: (chunk: Buffer) => void; end: () => void } {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  return {
    write(chunk) {
      const lines = (pending + decoder.write(chunk)).split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) emit(line)
    },
    end() { const tail = pending + decoder.end(); if (tail) emit(tail); pending = '' }
  }
}

export const dshConnection = new DshConnection()
