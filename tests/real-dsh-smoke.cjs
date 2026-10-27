// Optional upstream integration test. DSH_REAL_CLI names an already installed
// @deepseek-ai/dsh/lib/bin.js. Uses a new DSH_HOME and port; never calls a model.
const { app, BrowserWindow, webContents } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { pathToFileURL } = require('node:url')

const repo = path.resolve(__dirname, '..')
const cli = process.env.DSH_REAL_CLI
if (!cli || !fs.existsSync(cli)) throw new Error('Set DSH_REAL_CLI to an installed @deepseek-ai/dsh/lib/bin.js')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-real-test-'))
process.env.DSH_MANAGER_SMOKE_PROFILE = profile
app.setPath('userData', profile)
app.setAppPath(repo)
app.disableHardwareAcceleration()
BrowserWindow.prototype.show = function () {}
let win
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(check, label) {
  for (let i = 0; i < 360; i++) {
    if (await check()) return
    await pause(250)
  }
  throw new Error(`Timed out: ${label}`)
}

async function main() {
  const reserve = http.createServer()
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
  const port = reserve.address().port
  await new Promise(resolve => reserve.close(resolve))
  fs.writeFileSync(path.join(profile, 'launcher-config.json'), JSON.stringify({
    installMode: 'source', harnessRepo: profile,
    nodePath: process.env.DSH_NODE_PATH || 'node', launchArgs: [path.resolve(cli)],
    profile: 'web', port, language: 'zh', autoStartOnLaunch: true,
    splashEnabled: false, closeToTray: false, stopOnQuit: true,
    startupTimeoutMs: 90000, glassEnabled: true,
    dshHome: path.join(profile, 'dsh'), pluginDir: path.join(profile, 'plugins')
  }))
  const created = new Promise(resolve => app.once('browser-window-created', (_event, next) => { win = next; resolve() }))
  await import(pathToFileURL(path.join(repo, 'out/main/index.js')).href)
  await created
  const js = code => win.webContents.executeJavaScript(code)
  await waitFor(() => js('Boolean(window.dshLauncher && document.querySelector(".welcome-hero"))'), 'manager bridge')
  console.log('Waiting for isolated upstream DSH web to announce its authenticated URL…')
  await waitFor(async () => {
    const boot = await js('window.dshLauncher.getState()')
    if (boot.state.status === 'error') throw new Error(boot.state.lastError || 'Upstream startup error')
    return boot.state.status === 'running'
  }, 'real DSH startup')
  const boot = await js('window.dshLauncher.getState()')
  assert.ok(boot.log.some(item => item.line.includes('--no-open') && item.line.includes(`--port ${port}`)))
  assert.ok(boot.log.some(item => item.line.startsWith('dsh web: ') && item.line.includes('token=[REDACTED]')))
  assert.equal(boot.log.some(item => /opening the default browser/i.test(item.line)), false)
  assert.equal(boot.log.some(item => /[?&]token=(?!\[REDACTED\])/.test(item.line)), false)
  await js('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "看看代码").click()')
  let guest
  await waitFor(() => { guest = webContents.getAllWebContents().find(item => item.getURL().startsWith(`http://127.0.0.1:${port}`)); return Boolean(guest) }, 'real embedded web view')
  await waitFor(() => guest.executeJavaScript('Boolean(document.body && document.querySelectorAll("button").length > 3 && document.body.textContent.length > 100)'), 'real upstream UI')
  assert.equal(await guest.executeJavaScript('document.body.textContent.includes("authentication required")'), false)
  assert.equal(new URL(guest.getURL()).searchParams.has('token'), false, 'Token must exchange for a clean URL')
  const cookies = await guest.session.cookies.get({ url: `http://127.0.0.1:${port}` })
  assert.ok(cookies.some(cookie => cookie.name.startsWith('dsh-auth-') && cookie.httpOnly))
  assert.equal(await guest.executeJavaScript('typeof window.dshLauncher'), 'undefined')
  assert.equal(await js('Boolean(document.querySelector(".connection-card"))'), false)
  console.log('PASS: real upstream DSH --no-open, configured port, redacted startup URL, HttpOnly authentication cookie, actual embedded UI')
  await js('window.dshLauncher.stop()')
}

const deadline = setTimeout(() => { console.error('Real DSH smoke deadline exceeded'); app.quit(); app.exit(1) }, 120000)
main().then(() => { clearTimeout(deadline); app.quit() }).catch(error => { console.error(error.message); clearTimeout(deadline); app.quit(); app.exit(1) })
