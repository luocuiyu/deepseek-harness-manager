// Run after pnpm build: pnpm exec electron tests/desktop-smoke.cjs
// Uses a temporary userData directory and a local DSH layout fixture. Never
// launches/stops the user's DSH instance or touches their installed settings.
const { app, BrowserWindow, webContents } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { pathToFileURL } = require('node:url')

const repo = path.resolve(__dirname, '..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-manager-ui-test-'))
const output = process.env.SMOKE_OUTPUT || path.join(repo, 'out', 'smoke')
fs.mkdirSync(output, { recursive: true })
app.disableHardwareAcceleration()
app.setPath('userData', profile)
app.setAppPath(repo)
BrowserWindow.prototype.show = function () {}
const errors = []
app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_event, info) => errors.push(info.reason))
})
const timeout = setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1) }, 25000)

async function waitFor(check, label) {
  for (let i = 0; i < 80; i++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 80))
  }
  throw new Error(`Timed out: ${label}`)
}

async function main() {
  // Descriptive class suffixes and data-phase are the DSH 0.2.x layout contract.
  const fixture = `<!doctype html><html><head><style>
    :root{--dsw-alias-bg-base:white;--dsw-specific-input-major:white}
    body{margin:0;height:100vh} .wSkVaW_root{display:flex;flex-direction:column;height:100%;background:var(--dsw-alias-bg-base)}
    .wSkVaW_scrollBody{display:flex;flex-direction:column;flex:1;justify-content:center}
    .wSkVaW_composerHero{width:80%;align-self:center}.uV2eYG_card{padding:24px;background:var(--dsw-specific-input-major)}
  </style></head><body><main class="wSkVaW_root" data-phase="hero"><div class="wSkVaW_scrollBody"><div class="wSkVaW_composerHero wSkVaW_composerStack"><div class="uV2eYG_card"><div contenteditable="true" role="textbox">草稿</div></div></div></div></main></body></html>`
  let requireAuth = false
  const testToken = 'fixture-token-not-a-real-secret'
  let authExchanges = 0
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (requireAuth && url.searchParams.get('token') === testToken) {
      authExchanges++
      res.writeHead(303, { location: './', 'set-cookie': 'fixture-auth=ok; HttpOnly; SameSite=Strict; Path=/' })
      res.end(); return
    }
    if (requireAuth && !req.headers.cookie?.includes('fixture-auth=ok')) {
      res.writeHead(401, { 'content-type': 'text/plain' })
      res.end('dsh web authentication required; reopen the URL printed by dsh web.'); return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fixture)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  fs.writeFileSync(path.join(profile, 'launcher-config.json'), JSON.stringify({
    language: 'zh', port, autoStartOnLaunch: false, splashEnabled: true,
    closeToTray: false, stopOnQuit: false, glassEnabled: true,
    pluginDir: path.join(profile, 'plugins'), dshHome: path.join(profile, 'dsh'),
    apiPresets: [{ id: 'deepseek-official', name: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com', balanceUrl: '', apiKey: '' }]
  }))

  let win
  const created = new Promise(resolve => app.once('browser-window-created', (_event, next) => { win = next; resolve() }))
  await import(pathToFileURL(path.join(repo, 'out/main/index.js')).href)
  await created
  const js = code => win.webContents.executeJavaScript(code)
  await waitFor(() => js('Boolean(window.dshLauncher && document.querySelector(".welcome-hero"))'), 'welcome page')
  await waitFor(() => js('Boolean(document.querySelector(".glass-splash"))'), 'wallpaper startup splash')
  await js('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))')
  await waitFor(() => js('!document.querySelector(".glass-splash")'), 'Escape skips splash')
  assert.equal(await js('document.querySelector(".welcome-hero h1").textContent'), '探索未至之境')
  assert.equal(await js('getComputedStyle(document.querySelector(".welcome-hero")).textAlign'), 'center')
  assert.equal(await js('Math.round(document.querySelector("aside").getBoundingClientRect().width)'), 174)
  assert.equal(await js('document.querySelector(".app-wallpaper img").naturalWidth'), 1920)
  const config = await js('window.dshLauncher.getConfig()')
  assert.equal(config.apiPresets[0].baseUrl, 'https://api.deepseek.com/anthropic')
  await new Promise(resolve => setTimeout(resolve, 250))
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'home-1180.png'), image.toPNG()))

  await js('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "外观").click()')
  await waitFor(() => js('Boolean(document.querySelector(".appearance-panel"))'), 'appearance settings')
  await js('document.querySelector(".appearance-panel [role=switch]").click()')
  await waitFor(() => js('document.documentElement.dataset.glass === "false"'), 'classic appearance')
  assert.equal((await js('window.dshLauncher.getConfig()')).glassEnabled, false)
  await js('document.querySelector(".appearance-panel [role=switch]").click()')
  await waitFor(() => js('document.documentElement.dataset.glass === "true"'), 'glass appearance')
  await new Promise(resolve => setTimeout(resolve, 250))
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'appearance.png'), image.toPNG()))

  await js('Array.from(document.querySelectorAll(".settings-page button")).find(b => b.textContent.trim() === "DSH 部署 / 修复").click()')
  for (const [width, height] of [[1180,760], [1920,1080], [2560,1440]]) {
    win.setContentSize(width, height)
    await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
    await waitFor(() => js(`Math.abs(innerWidth - ${width}) < 1`), 'window resize acknowledged')
    await new Promise(resolve => setTimeout(resolve, 180))
    const layout = await js(`(() => { const main = document.querySelector('main'); const r = document.querySelector('.settings-page').getBoundingClientRect(); return { viewport: innerWidth, center: Math.abs(r.left + r.width / 2 - (main.getBoundingClientRect().left + main.clientWidth / 2)), width: r.width, available: main.clientWidth, columns: getComputedStyle(document.querySelector('.settings-deployment')).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth } })()`)
    assert.ok(layout.center < 2, JSON.stringify(layout))
    assert.ok(layout.width >= Math.min(1480, layout.available) - 1, JSON.stringify(layout))
    assert.equal(layout.columns, width >= 1450 ? 2 : 1)
    assert.equal(layout.overflow, false)
    if (width >= 1920) {
      await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      await new Promise(resolve => setTimeout(resolve, 100))
      await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, `settings-${width}.png`), image.toPNG()))
    }
  }
  await js('Array.from(document.querySelectorAll("nav button")).find(b => b.textContent.trim() === "新的探索").click()')
  win.setContentSize(960, 620)
  await waitFor(() => js('Boolean(document.querySelector(".welcome-launch-row"))'), 'compact home')
  const fits = await js(`(() => { const r = document.querySelector('.welcome-launch-row').getBoundingClientRect(); return r.bottom < innerHeight && r.right <= innerWidth })()`)
  assert.equal(fits, true)
  await new Promise(resolve => setTimeout(resolve, 250))
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  await new Promise(resolve => setTimeout(resolve, 100))
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }).then(image => fs.writeFileSync(path.join(output, 'home-960.png'), image.toPNG()))

  await waitFor(() => js('window.dshLauncher.getState().then(b => b.state.ready)'), 'isolated local fixture ready')
  await js('Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "看看代码").click()')
  let guest
  await waitFor(() => { guest = webContents.getAllWebContents().find(c => c.getURL().startsWith(`http://127.0.0.1:${port}`)); return Boolean(guest) }, 'native DSH guest')
  const guestJs = code => guest.executeJavaScript(code)
  await waitFor(() => guestJs('getComputedStyle(document.body).backgroundImage.includes("data:image/webp")'), 'embedded wallpaper')
  assert.equal(await guestJs('typeof window.dshLauncher'), 'undefined')
  assert.equal(await guestJs('typeof process'), 'undefined')
  assert.equal(await guestJs('getComputedStyle(document.querySelector(".wSkVaW_scrollBody")).justifyContent'), 'flex-end')
  await guestJs('document.querySelector("[contenteditable]").textContent = "中文草稿保持不变"')
  await js('window.dshLauncher.setConfig({ glassEnabled: false })')
  await waitFor(() => guestJs('!getComputedStyle(document.body).backgroundImage.includes("data:image/webp")'), 'guest theme disabled')
  await js('window.dshLauncher.setConfig({ glassEnabled: true, glassBlur: 12, wallpaperDim: 48 })')
  await waitFor(() => guestJs('getComputedStyle(document.body).backgroundImage.includes("data:image/webp")'), 'guest theme reapplied')
  assert.equal(await guestJs('document.querySelector("[contenteditable]").textContent'), '中文草稿保持不变')
  assert.equal(await guestJs('getComputedStyle(document.querySelector(".uV2eYG_card")).backdropFilter.includes("12px")'), true)
  win.webContents.setZoomFactor(1.25)
  await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  await new Promise(resolve => setTimeout(resolve, 250))
  const nativeGuest = win.contentView.children.find(child => child.webContents === guest)
  assert.equal(nativeGuest.getBounds().x, Math.round(56 * 1.25))
  assert.equal(guest.getZoomFactor(), 1.25)
  win.webContents.setZoomFactor(1)
  await new Promise(resolve => setTimeout(resolve, 150))
  requireAuth = true
  await guest.session.clearStorageData({ storages: ['cookies'] })
  await js('window.dshLauncher.setDshActive(true, true)')
  await waitFor(() => js('Boolean(document.querySelector(".connection-card"))'), '401 returns to connection form')
  assert.equal((await js('window.dshLauncher.connectDsh("https://example.com/?token=bad")')).ok, false)
  const entered = `http://127.0.0.1:${port}/?token=${testToken}`
  await js(`(() => { const input = document.querySelector('#dsh-auth-url'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(entered)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await new Promise(resolve => setTimeout(resolve, 100))
  await js('document.querySelector(".connection-card").requestSubmit()')
  await waitFor(() => guestJs('Boolean(document.querySelector("[contenteditable]"))'), 'authenticated native editor')
  assert.equal(authExchanges, 1)
  assert.equal(new URL(guest.getURL()).searchParams.has('token'), false)
  assert.equal(JSON.stringify(await js('window.dshLauncher.getConfig()')).includes(testToken), false)
  const stateAfterAuth = await js('window.dshLauncher.getState()')
  assert.equal(JSON.stringify(stateAfterAuth).includes(testToken), false)
  assert.deepEqual(errors, [])
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'launcher-config.json'), 'utf8')).wallpaperDim, 48)
  server.close()
  console.log('PASS: compact/maximized 1180/1920/2560 layout, 401 recovery, launch-token exchange, secret redaction, native editor draft, saved appearance')
  clearTimeout(timeout)
  app.exit(0)
}

main().catch(error => { console.error(error); clearTimeout(timeout); app.exit(1) })
