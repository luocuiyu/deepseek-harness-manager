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
  guest.on('console-message', event => { if (event.level === 'error') console.error('DSH renderer:', event.message) })
  await waitFor(() => guest.executeJavaScript('Boolean(document.body && document.querySelectorAll("button").length > 3 && document.body.textContent.length > 100)'), 'real upstream UI')
  assert.equal(await guest.executeJavaScript('document.body.textContent.includes("authentication required")'), false)
  assert.equal(new URL(guest.getURL()).searchParams.has('token'), false, 'Token must exchange for a clean URL')
  const cookies = await guest.session.cookies.get({ url: `http://127.0.0.1:${port}` })
  assert.ok(cookies.some(cookie => cookie.name.startsWith('dsh-auth-') && cookie.httpOnly))
  assert.equal(await guest.executeJavaScript('typeof window.dshLauncher'), 'undefined')
  assert.equal(await js('Boolean(document.querySelector(".connection-card"))'), false)
  await guest.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '插件').click()`)
  await waitFor(() => guest.executeJavaScript(`Boolean(document.querySelector('[class*="_page"] [class*="_group"]:not([data-plugin-loading]) > [class*="_cards"]'))`), 'real upstream plugin page')
  // A fresh DSH_HOME shows its own first-run notice; dismiss only in this profile.
  await guest.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '继续')?.click()`)
  await pause(200)
  await guest.executeJavaScript(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => /关闭|Close/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''))?.click()`)
  const pluginStyle = await guest.executeJavaScript(`(() => {
    const list=document.querySelector('[class*="_page"] [class*="_group"] > [class*="_cards"]');
    return {background:getComputedStyle(list).backgroundColor,blur:getComputedStyle(list).backdropFilter,
      descriptions:list.textContent.length,descriptionColor:getComputedStyle(list.querySelector('[class*="_cardDesc"]')).color,
      overflow:document.documentElement.scrollWidth>innerWidth};
  })()`)
  assert.equal(pluginStyle.background, 'rgba(33, 46, 69, 0.84)')
  assert.ok(pluginStyle.blur.includes('22px') && pluginStyle.descriptions > 50, JSON.stringify(pluginStyle))
  assert.equal(pluginStyle.overflow, false)
  console.log('Real plugin styles:', JSON.stringify(pluginStyle))
  const luminance = rgb => rgb.map(x=>{const c=x/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0)
  const fg=pluginStyle.descriptionColor.match(/[\d.]+/g).slice(0,3).map(Number)
  const bg=[33,46,69].map(x=>x*.84+255*.16) // Worst case: a pure-white wallpaper.
  const contrast=(luminance(fg)+.05)/(luminance(bg)+.05)
  assert.ok(contrast>=4.5, `Plugin descriptions contrast ${contrast.toFixed(2)}:1`)
  const output = process.env.SMOKE_OUTPUT || path.join(repo, 'out', 'smoke-real')
  fs.mkdirSync(output, { recursive: true })
  // Native child views need a compositor surface for capture. Keep the isolated
  // window transparent, unfocused and off the taskbar while allocating it.
  win.setOpacity(0)
  win.setSkipTaskbar(true)
  win.showInactive()
  await pause(250)
  await guest.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '继续')?.click()`)
  await pause(200)
  await guest.executeJavaScript(`document.querySelector('button[aria-label*="关闭"],button[title*="关闭"],button[aria-label*="Close"],button[title*="Close"],button[class*="_close"]')?.click()`)
  for (const [width, height] of [[1180, 760], [1920, 1080]]) {
    win.setContentSize(width, height)
    await pause(350)
    await win.webContents.capturePage(undefined, { stayHidden:true, stayAwake:true })
    await guest.capturePage(undefined, { stayHidden:true, stayAwake:true })
    await pause(150)
    await guest.capturePage(undefined, { stayHidden:true, stayAwake:true }).then(image => fs.writeFileSync(path.join(output, `plugins-${width}.png`), image.toPNG()))
    assert.equal(await guest.executeJavaScript('document.documentElement.scrollWidth > innerWidth'), false)
  }
  console.log('PASS: real plugin page reading surfaces and compact/wide layout')
  win.hide()
  console.log('PASS: real upstream DSH --no-open, configured port, redacted startup URL, HttpOnly authentication cookie, actual embedded UI')
  await js('window.dshLauncher.stop()')
}

const deadline = setTimeout(() => { console.error('Real DSH smoke deadline exceeded'); app.quit(); app.exit(1) }, 120000)
main().then(() => { clearTimeout(deadline); app.quit() }).catch(error => { console.error(error.message); clearTimeout(deadline); app.quit(); app.exit(1) })
