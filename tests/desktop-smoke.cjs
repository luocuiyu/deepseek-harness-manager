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
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fixture) })
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
  assert.deepEqual(errors, [])
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'launcher-config.json'), 'utf8')).wallpaperDim, 48)
  server.close()
  console.log('PASS: home 1180/960, saved appearance, official endpoint migration, sandboxed native guest, live CSS updates, draft retention')
  clearTimeout(timeout)
  app.exit(0)
}

main().catch(error => { console.error(error); clearTimeout(timeout); app.exit(1) })
