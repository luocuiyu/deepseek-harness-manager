// Checks the actual packaged executable with isolated settings and a local DSH
// layout fixture. Does not install, repair shortcuts, or touch the user's DSH.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')

const repo = path.resolve(__dirname, '..')
const exe = path.join(repo, 'release/win-unpacked/DeepSeek Harness Manager.exe')
const expectedVersion = require('../package.json').version
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-packaged-test-'))
let child
let fixture
const clients = []
let errors = ''

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(check, label) {
  for (let i = 0; i < 120; i++) {
    if (child && child.exitCode !== null) throw new Error(`Packaged application exited early (${child.exitCode})`)
    if (await check()) return
    await pause(100)
  }
  throw new Error(`Timed out: ${label}`)
}

async function inspect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  const pending = new Map()
  let id = 0
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data)
    const item = pending.get(result.id)
    if (!item) return
    pending.delete(result.id)
    clearTimeout(item.timer)
    result.error ? item.reject(new Error(result.error.message)) : item.resolve(result.result)
  })
  clients.push(socket)
  return async expression => {
    const result = await new Promise((resolve, reject) => {
      const call = ++id
      const timer = setTimeout(() => { pending.delete(call); reject(new Error('Inspector request timed out')) }, 8000)
      pending.set(call, { resolve, reject, timer })
      socket.send(JSON.stringify({ id: call, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
}

async function main() {
  assert.equal(fs.existsSync(exe), true, 'Build the Windows package first')
  fixture = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<!doctype html><html><body><main class="test_root" data-phase="hero"><div class="test_composerStack"><div class="test_card"><div role="textbox" contenteditable="true">打包后中文草稿</div></div></div></main></body></html>')
  })
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
  const port = fixture.address().port
  const reserve = http.createServer()
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve))
  const inspectorPort = reserve.address().port
  await new Promise(resolve => reserve.close(resolve))
  fs.writeFileSync(path.join(profile, 'launcher-config.json'), JSON.stringify({
    language: 'zh', port, autoStartOnLaunch: false, stopOnQuit: false,
    splashEnabled: false, closeToTray: false, glassEnabled: true,
    pluginDir: path.join(profile, 'plugins'), dshHome: path.join(profile, 'dsh')
  }))
  child = spawn(exe, [`--remote-debugging-port=${inspectorPort}`, '--remote-debugging-address=127.0.0.1'], {
    windowsHide: true,
    env: { ...process.env, DSH_MANAGER_SMOKE_PROFILE: profile },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.on('error', error => { errors += error.message })
  child.stdout.on('data', data => { errors = (errors + data.toString()).slice(-4000) })
  child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-4000) })
  const targets = async () => {
    try { return await fetch(`http://127.0.0.1:${inspectorPort}/json/list`).then(response => response.json()) } catch { return [] }
  }
  let target
  await waitFor(async () => { target = (await targets()).find(item => item.type === 'page' && item.url.includes('/renderer/index.html') && !item.url.includes('orb=1')); return Boolean(target) }, 'packaged renderer')
  const js = await inspect(target)
  await waitFor(() => js('Boolean(window.dshLauncher && document.querySelector(".welcome-hero"))'), 'preload bridge and welcome page')
  assert.equal((await js('window.dshLauncher.getUpdateState()')).currentVersion, expectedVersion)
  assert.equal((await js('window.dshLauncher.getConfig()')).port, port, 'Temporary user profile must be used')
  await waitFor(() => js('document.querySelector(".app-wallpaper img")?.naturalWidth === 1920'), 'packaged wallpaper')
  assert.equal(await js('document.querySelector(".welcome-hero h1").textContent'), '探索未至之境')
  assert.equal((await js('window.dshLauncher.getConfig()')).apiPresets[0].baseUrl, 'https://api.deepseek.com/anthropic')
  await waitFor(() => js('window.dshLauncher.getState().then(b => b.state.ready)'), 'fixture ready')
  await js('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "看看代码").click()')
  let guest
  await waitFor(async () => { guest = (await targets()).find(item => item.url.startsWith(`http://127.0.0.1:${port}`)); return Boolean(guest) }, 'packaged native DSH view')
  const guestJs = await inspect(guest)
  await waitFor(() => guestJs('Boolean(document.body && getComputedStyle(document.body).backgroundImage.includes("data:image/webp"))'), 'wallpaper read from app.asar')
  assert.equal(await guestJs('typeof window.dshLauncher'), 'undefined')
  await js('window.dshLauncher.setConfig({ glassEnabled: false })')
  await waitFor(() => guestJs('!getComputedStyle(document.body).backgroundImage.includes("data:image/webp")'), 'disable packaged guest theme')
  await js('window.dshLauncher.setConfig({ glassEnabled: true, wallpaperDim: 42 })')
  await waitFor(() => guestJs('Boolean(document.body && getComputedStyle(document.body).backgroundImage.includes("data:image/webp"))'), 'restore packaged guest theme')
  assert.equal(await guestJs('document.querySelector("[contenteditable]").textContent'), '打包后中文草稿')
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'launcher-config.json'), 'utf8')).wallpaperDim, 42)
  console.log(`PASS: packaged v${expectedVersion}, isolated profile, preload, wallpaper, native guest, saved appearance, Chinese draft`)
  await js('window.close()').catch(() => {})
}

const deadline = setTimeout(() => { console.error('Packaged smoke deadline exceeded'); if (child) child.kill(); process.exit(1) }, 45000)
main().then(() => { process.exitCode = 0 }).catch(error => { console.error(error); console.error(errors); process.exitCode = 1 }).finally(async () => {
  clearTimeout(deadline)
  for (const socket of clients) socket.close()
  if (fixture) fixture.close()
  if (child && child.exitCode === null) {
    for (let i = 0; i < 20 && child.exitCode === null; i++) await pause(100)
    if (child.exitCode === null) child.kill()
  }
})
