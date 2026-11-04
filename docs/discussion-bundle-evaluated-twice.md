# 「同一个 client bundle 被求值两次」：一个插件让另一个插件整条消失的排查记录

> 本文记录一次真实故障：插件 A 一旦启用，插件 B 的侧栏入口和全部功能就**整体消失**，看起来像 B 被平台「移除」了。最终定位到的根因不是两个插件的功能冲突，而是 **A 的客户端 bundle 在同一个 document 里被当作经典脚本求值了两次**：第二次在解析阶段抛 `SyntaxError`，而这条错误发生在「组合批」执行过程中，**打断了整轮插件启动**，排在 A 后面出场的 B 永远轮不到 `apply()`。

---

## 1. 现象

- 环境：DSH 桌面端（Web 前端壳 `dsh-app://app`），Cordis 插件体系，插件用本地 `link:` 安装。
- 症状：启用**面板管理**（dsh-panel-control）后，**工作区管理**（dsh-workspace-control）的侧栏入口立即消失，会话菜单项与相关工具一并不可用；插件管理里它仍显示为「运行」。
- 关键对照：**关掉面板管理并刷新页面，工作区管理立刻回来。** 因果成立，但不是功能冲突。
- 更迷惑的是：面板管理自己有时也「不运行」——同一进程里冷启动成功、刷新后失效，行为不稳定。

## 2. 环境

| 项 | 值 |
| --- | --- |
| 桌面端 | DSH Desktop（Web 前端壳 `dsh-app://app`） |
| 插件机制 | Cordis：宿主半边（Node）+ 客户端半边（`client.js` bundle） |
| 安装方式 | `dsh.profile.bundles` 列表 + `dependencies: link:` |
| 干扰项 | `dsh-unlag`（刷新/热重载插件，会代理 `/plugins/` 路由并按图重拼组合批） |
| 系统 | Windows 11 |

## 3. 走过的弯路（这部分比结论更有用）

| # | 假设 | 为什么被否掉 |
| --- | --- | --- |
| 1 | 「模块图每次启动都在重组，页面冻结的清单对不上」 | 同一形状的 26 项批重复出现，结果时好时坏 ⇒ 是竞态 + 另一条独立路径，不是单纯的图抖动 |
| 2 | 宿主侧把「过期组合批」用「单模块字节」顶替 | 服务器日志 13 条 bundle 请求**全是 single**，没有一次 combo 走到该分支；修好后症状依旧 |
| 3 | 单个模块 import 失败会连坐其它插件 | 读源码：`reconcile` 每包独立 try/catch，失败只进 `failures`，不中止别人 |
| 4 | 我们的插件把对方隐藏了（hidden 列表 / 侧栏 `display:none`） | `prefs.json` 里 `hidden=[]`；而且即使 DOM 全隐藏，槽表也应该还有对方条目——实际没有 |
| 5 | 页面自动刷新打断了批次加载 | `reloadPage` 只挂在用户手动点击的按钮上，没有自动调用点 |

> 教训：**「槽表里没有它」比「DOM 里没有它」是强得多的判据。** `entriesOfSlot` 返回已注册条目且不按可见性过滤，所以「槽表无条目」直接排除所有 CSS/DOM 解释，把问题逼进「客户端模块到底有没有执行」这一层。

## 4. 真正的证据来自页面内部

宿主日志只能看 HTTP 状态码，而这里所有 bundle 都是 200，宿主侧完全看不出问题。突破口是**让插件自己在页面里留痕**：

1. **模块顶层就写 localStorage**：`client.js` 一执行就记一条（阶段序列 `top → build → factory → apply → ready`，加上 `typeof window.__ModuleLoader__` 与 boot 清单摘要）。阶段停在 `factory` 就说明「脚本跑了，但 apply 没被调用」。
2. **`window.addEventListener('error', ..., true)` + unhandledrejection + 包装 console.error/warn**，把原文写进同一个值。
3. 离线读 Chromium 的 LevelDB（`Local Storage/leveldb` 下的 `*.log`/`*.ldb`，值按 UTF-16LE 解码）——不需要 DevTools，也不需要人工盯界面。

拿到的决定性一行：

```text
Uncaught SyntaxError: Identifier 'PAGE_LOG' has already been declared
  @ dsh-app://app/plugins/??dsh-panel-control/client.js&rev=4bbae3358a87:1
```

以及更早一批重复注册错误（说明这是同一个实例的第二次执行）：

```text
Error: keyed slot "main" already has an entry for key "panel-control" at priority 0
list slot "sidebar.panellist" already has an entry with id "panel-control"
list slot "settings.section" already has an entry with id "panel-control-settings"
```

## 5. 根因链条

机制（`dsh-client-modules/lib/client.js`）：

1. `start()` 先 `await Promise.all(desired.plugins.map(...))` 再 `await loader.await()`，**没有 per-entry 失败隔离**：一轮里抛出即整轮中止。
2. 同一 bundle 执行两次时，`register` 会抛 `client-modules: duplicate factory registration for "<id>" (bundle executed twice without invalidate?)`；但如果脚本带顶层 `const`，它在**解析阶段**就死了，连这句友好错误都拿不到，只剩 `SyntaxError`。
3. 对立即加载的插件，平台会发一条独立单包 URL；同一份代码又出现在组合批里（批用于补齐增量模块）。两条路径各执行一次 ⇒ 双求值。`invalidate(id, rev)` 本应在重载时清工厂，但「同 rev 被两个入口各执行一次」不经过它。

**症状对应**：批内顺序上 dsh-workspace-control 恰好紧跟在本插件后面（多次日志都是 `[dsh-panel-control], dsh-workspace-control` 相邻），所以整轮一断它第一个陪葬 → 入口、菜单、工具全没 → 看起来「像被移除了」。插件管理读宿主状态，宿主半边一直活着，所以仍显示「运行」。

## 6. 修复（插件侧，已上线 v0.6.4）

1. **整份 `client.js` 包进 IIFE**，杜绝顶层 `const/let` 落到全局词法作用域——双求值从此最多是「重复注册」，不再是 `SyntaxError`。
2. **注册调用全部 try/catch**：撞 duplicate 时 `console.warn` 并保留第一个实例，绝不外抛。
3. **不做跨版本「早退」优化**：停用插件时平台会 delete 工厂，重开必须重新注册；早退会导致 `import failed` 启动崩溃（我们踩过）。
4. 声明 `immediately: true`，拥有独立单包 URL，不依赖组合批是否包含自己。
5. 删掉一切「自己造 `/plugins/` 请求」的探针——那会额外制造 duplicate factory registration，等于自己给自己下毒。

验证：连续 4 次冷启动 + 1 次停用/启用，`slots` 同时含两个插件、侧栏两条入口均 shown、page-log 0 条、崩溃目录无新增 `web-boot` 日志。

## 7. 给平台的建议（按收益排序）

1. **`loader.start()` 做 per-entry 隔离**：单条 create/apply 失败只把该条目记进 `failures`，不要中止整轮。今天「一个插件写错一行」= 「后面所有插件静默消失」。
2. **bundle 执行幂等化**：同一 `(id, rev)` 在同一个 document 内第二次执行直接跳过；或注入前比对 rev，已注册就不再插 `<script>`。
3. **重复注册可降级为警告**（opt-in）：撞 id 时若两份 label/locale 相同，保留先注册者。
4. **启动失败要能看见**：`web boot: 1 entry did not activate` 应带上是哪一条，以及被中止后继条目的完整列表。
5. 文档补一句：`client.js` 是经典脚本，**必须**自包 IIFE；顶层 `const` 在双求值场景下是致命错误。

## 8. 给插件作者的防御清单

- [ ] 整份 `client.js` 包 IIFE，不往 window 写裸 `const/let`。
- [ ] 所有 `ctx.slots.register` / `ctx.provide` / 工具注册包 try/catch，撞重复只警告。
- [ ] 不要主动请求 `/plugins/...`：那不是探针，是自伤。
- [ ] 别在 `dsh-app://` 页面用 `performance.getEntriesByType('resource')` 观测网络：非 http(s) 协议不计数，永远是 0。
- [ ] 页面内取证优先写 `localStorage`（模块顶层就写），离线读 LevelDB，可留档且不依赖人工。
- [ ] 「插件没出现」先查 `ctx.slots.entriesOfSlot(...)`：**槽表有 = 渲染问题；槽表无 = 执行问题**。
- [ ] 宿主侧日志记录**所有** bundle 请求与状态码（不止自己），否则 404 / 双求值完全不可见。
- [ ] 把平台报的 duplicate registration 原文贴进 issue，它通常直接指向双求值。

---

**一句话总结**：这不是「两个插件冲突」，而是「一个插件被平台执行了两次，第二次在解析期爆炸，把整批插件的启动循环炸断了」。诊断的关键不在宿主 HTTP 日志（全是 200），而在让页面自己把执行阶段写到硬盘上。