# 大肥鱼 (DaFeiYu)

A Windows desktop control center for DeepSeek Harness. It starts the local DSH service and embeds `http://127.0.0.1:3080/` in its own Electron window, so the taskbar keeps the app's character icon and no terminal or external browser is required.

This is an independent community project, not an official DeepSeek product. It is based on [MarcoG-h/DSH-Launcher](https://github.com/MarcoG-h/DSH-Launcher).

Features include an `npx @deepseek-ai/dsh web` default launch mode, Node.js installation guidance, DSH pre-download and validation, embedded DSH, service and tray controls, a read-only session observer, plugin management and provenance, API presets, Windows DPAPI-backed secret storage, and redacted diagnostic exports.

Plugin availability is profile-wide and does not prove a specific session invoked a plugin. The UI labels this distinction explicitly.

## v0.3.2 — 大肥鱼

The product is now named 大肥鱼 (DaFeiYu). A user-supplied character image is used for the installer, executable, shortcuts, tray and UI. The existing application ID, package name, user-data directory and update repository remain stable for upgrades.

## v0.3.1 — Authentication and responsive layout

The embedded workspace exchanges the real DSH startup token for a browser cookie. Managed web launches use `--no-open` and the configured port, while an unauthenticated external instance can be connected using its printed local URL. Tokens stay out of config and logs. Management pages center and expand on wide screens, deployment settings use two columns, and native-view bounds follow UI zoom. Verification now includes the real upstream DSH web runtime.

## v0.3.0 — Silver-blue glass

A wallpaper welcome page, compact sidebar, adjustable glass surfaces and a skippable startup reveal. Appearance updates preserve the embedded DSH editor and its draft. The shipped official Messages endpoint is corrected to `/anthropic`, with a narrowly scoped migration that preserves custom gateways.

Download the Windows x64 installer from [Releases](https://github.com/luocuiyu/deepseek-harness-manager/releases/latest). Release assets include `latest.yml` and a blockmap for in-app updates. See [CHANGELOG.md](CHANGELOG.md) for release details.

## Development

```powershell
pnpm install
pnpm typecheck
pnpm dev
```

Build the Windows installer with `pnpm dist`; artifacts are written to `release/`.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution and licensing details.
