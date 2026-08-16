# DeepSeek Harness Manager

面向 Windows 的 DeepSeek Harness 桌面管理器。双击蓝色鲸鱼图标即可启动本机 DSH，并在应用自身窗口中打开 `http://127.0.0.1:3080/`，任务栏显示本应用图标，无需手动保留终端或另开浏览器。

> 社区项目，非 DeepSeek 官方产品。基于 [MarcoG-h/DSH-Launcher](https://github.com/MarcoG-h/DSH-Launcher) 开发，并保留原作者归属。

## 当前功能

- 内嵌 DSH：使用 Electron 原生 `WebContentsView`，DSH 页面与管理器同窗运行。
- 一键启动：首次启动默认直接执行 `npx @deepseek-ai/dsh web`，端口就绪后自动进入内嵌页面；同时支持停止、重启、关闭到托盘和单实例唤醒。
- 免 Node 部署：可下载便携 Node、pnpm 与 `@deepseek-ai/dsh` 运行环境。
- 会话观察台：查看会话状态、目录、父子关系、代理预设，以及 DSH 提供的 Token/上下文统计。
- 插件管理：本地安装、GitHub 插件市场、启用、停用和卸载。
- 插件来源：展示官方、用户安装、本地开发、第三方、历史推断，并标明来源可信度。
- API 管理：多厂商预设、余额查询和快捷切换。
- 安全存储：API Key 与 GitHub Token 使用 Electron `safeStorage`（Windows DPAPI）加密，普通配置文件不保存明文。
- 故障诊断：导出脱敏配置、运行状态、会话概览和最近日志。

插件属于当前 DSH profile 的“可用能力”，不代表某一会话已经实际调用。会话观察台会明确显示这一边界，避免产生误导。

## 开发

需要 Node.js 22+ 与 pnpm：

```powershell
pnpm install
pnpm typecheck
pnpm dev
```

构建 Windows 安装包：

```powershell
pnpm dist
```

产物位于 `release/`。已有 Node/npx 的电脑可直接使用默认 npx 模式；没有 Node 的电脑可在“设置”中执行“快速离线部署”。

## 数据与安全

- 普通配置：Electron `userData/launcher-config.json`
- 加密凭据：Electron `userData/launcher-secrets.bin`
- 插件来源台账：Electron `userData/plugin-provenance.json`
- DSH 数据：默认 `~/.dsh`

诊断报告只记录 Key/Token 是否已配置，不包含秘密值。

## 许可证与归属

本项目基于 MIT 许可的 DSH Launcher 修改。详情见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。DeepSeek、DeepSeek Harness 及相关标识归其各自权利人所有。
