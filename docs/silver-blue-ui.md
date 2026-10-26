# 银蓝玻璃界面

默认启用用户选定的静态壁纸。首页欢迎区居中，174px 紧凑侧栏保留管理器的工作区、会话、插件、运行控制与设置入口。底部操作卡根据真实服务状态显示启动或进入工作区，不发送模拟消息。

- 「我的壁纸」或首页「外观」打开系统设置；玻璃开关、壁纸遮罩（15–75%）和模糊（0–32px）自动保存。
- 聊天区仍由原生 WebContentsView 承载，保留 DSH 自己的输入框、文件和模型功能。主题切换只更新 CSS，不重载页面或清空草稿。
- 首次启动显示 2.8 秒壁纸引导，可用 Esc 或跳过按钮立即关闭；系统减少动态效果时立即结束。关闭玻璃模式后仍使用原启动动画。
- 首页的「继续项目」进入真实会话观察台；会话选择与继续操作遵循现有 DSH 功能。DSH 就绪后首页保持显示，由用户进入工作区。

## 兼容修复

官方预设默认模型地址改为 `https://api.deepseek.com/anthropic`，用于当前 DSH 的 Messages 适配器。读取旧配置时，仅迁移 id 为 `deepseek-official` 且地址严格为原官方根地址的预设。余额地址、API Key 和自定义中转地址均保留。

参考：[DeepSeek Anthropic API 文档](https://api-docs.deepseek.com/guides/anthropic_api/)。

## 验证

需要系统 Node.js 24 或更新版本（测试使用 Node.js 原生 TypeScript 支持）：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm exec electron tests/desktop-smoke.cjs
```

桌面测试使用临时配置及随机本地端口的布局夹具，验证 1180/960 宽度、启动跳过、外观持久化、官方地址迁移、内嵌页面隔离、切换样式与中文草稿保留。不会启动或停止用户正在运行的 DSH 服务，也不会调用模型。截图默认写入 `out/smoke/`；可用 `SMOKE_OUTPUT` 指定目录。

聊天样式以 DSH 0.2.x 的 `--dsw-*` 令牌和描述性 CSS 模块后缀为适配边界，后续 DSH 大改布局时需重新检查。内嵌页面仅在配置的本机 DSH origin 应用主题，无 Node 或管理器 preload。认证、会话接口和运行时版本升级沿用原逻辑，本次未改动。

壁纸由项目所有者提供并选定，仓库使用同图压缩的 WebP 资源。
