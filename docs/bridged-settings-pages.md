# 设置页补入口：怎么识别，怎么渲染

## 问题

宿主把「侧栏面板」和「设置页」做成两套注册：

- 面板入口 = `sidebar.panellist` 里的一行图标 + 同 id 的 root 作用域 `main` keyed 条目；
- 设置页 = `settings.section` 里的一个 id。

多数插件两者都注册。少数只注册 `settings.section`，于是它的页面只能从设置弹窗里翻到——
侧栏没有入口，也没法被单独选中。设置弹窗的打开状态是宿主私有的，没有公开 API 能直接定位到
某个 section，所以「点一行就打开那个设置页」只能由本插件自己造一页。

## 识别

宿主的槽条目确实带有 `registrant`，但在当前客户端里它**不能用来区分插件**：client runner 把
大量插件放在同一个 fiber 里 apply，实测 `account/general/models/plugins/agent-presets` 以及
`plan-mode`、`bili`、`workspace-control-settings`、`composer-rewind-settings` 这些设置页的
`registrant` 都是同一个 `tk`，侧栏里大多数行也是 `tk`；只有插件市场是它自己的 `dsh-market`。
按 registrant 过滤会把所有第三方设置页都当成「已有入口」。

因此改为按**侧栏归属**判断，一个设置页有入口当且仅当满足任一条：

1. 它的 id 等于某个 `sidebar.panellist` 的 id；
2. 去掉末尾 `-settings` 后的 id 等于某个面板 id（`panel-control-settings` ↔ `panel-control`）；
3. 某个面板 id 以 `-<id>` 结尾（`market` ↔ `dsh-market`）；
4. 它的 label 与某个面板 label 相同（`market` / `workspace-control-settings` 都命中）。

内置设置页没有面板，因此单独列一组 id 排除：`account`、`general`、`models`、`agent-presets`、
`plugins`（`plugins` 同时也有面板，列在这里只是双保险）。剩下的每个 section 补一行，id 为
`dpc-bridge-<section id>`，order 85（在普通入口之后、本插件之前）。标题取该 section 的 label；
与已有行撞名时追加 ` · <section id>`。

这套判断不读第三方包内部文件，也不依赖插件白名单；代价是**启发式**：一个第三方设置页若恰好
与某个面板同名/id 同源，会被当成已有入口；未来新增的内置设置页若不在上面的 id 列表里，会被
多补一行（此时把它加进 `CORE_SECTION_IDS` 即可）。

## 渲染

桥接面板自己注册同 id 的 `main` keyed 条目，并在该条目上声明一个自有子槽（`dpc-bridge-slot-<section id>`）。
之所以不直接用 `ctx.slots.renderSlot('settings.section', ...)`：ctx 级 `renderSlot` 只渲染 `root`，
子槽只能通过「声明了它的那个条目的 props 面」渲染；`settings.section` 由设置壳声明，本插件无权调用。
因此桥接条目把原 section 的组件以同一份 `inject/store/locale` 重新注册进自有子槽，再通过宿主注入的
`props.renderSlot(slotName, { close: back }, {})` 渲染它。

这样 section 的 `inject`、`store`、locale `t`、`useStore` 和 error boundary 仍由宿主照常提供；直接调用
section 组件会缺这些。面板只负责外壳：顶部一条 40px 的栏（「返回对话」+ 来源包名短名，
查不到包名时退回 section id），下面一块随页面滚动的主体。`close` 与设置壳里一样只做「关掉这一页」，这里落回对话
（`layout.selectPanel(null)`）。

桥接面板不常驻：开关关闭、section 消失、插件卸载时，`dispose()` 成对撤掉 `main` 与
`sidebar.panellist` 注册；若当时正停在这一页，先 `selectPanel(null)` 回到对话，避免选中一个
已经不存在的 key。

## 同步

`settings.section`、`sidebar.panellist` 与 locale 任意一处变化都会触发一次同步，120ms 去抖。
启动时还会按 `[350, 900, 2000, 4200, 8000, 15000]ms` 主动重扫：boot 清单的顺序不是应用顺序，
排在后面的插件可能在第一次同步之后才注册设置页。`settings.section` 槽声明时会重新建立订阅，
因为槽声明之前 `subscribe` 观察不到这个注册表。

同步本身只做增删对账，不重建未变化的行；注册成对失败时回滚已注册的那一半。

开关存在 `prefs.bridge`（默认 `true`），在「侧栏布局」卡片里；它和排序、隐藏、分组是正交的：
补出来的行可以像普通行一样拖动、隐藏、分组，关掉开关才会整体消失。

## 验证

- `npm run check`：`layout-smoke` 断言桥接的常量、持久化字段与自有子槽渲染没有被改掉；
  `bridge-smoke` 在假 `ctx` 上验证识别、成对注册、开关撤回与返回对话。
- 刷新插件后看 `~/.dsh/panel-control/host.log`：`bridge-scan` 行记录每次扫描看到的 section 与
  侧栏条目（`id:registrant`），`kind=bridge` 行记录最终补出的 id。目标 section 在 `sections`
  里却没进 `ids`，说明它被归属规则当成了已有入口（或 id 不在内置列表里而被排除）；一直不在
  `sections` 里，是注册时序问题。
- `bridge-smoke` 里另有一条晚注册用例：先启动、后注册 section，订阅必须把新行补出来。
- 界面：侧栏应多出对应行；点开后是完整设置页，顶部「返回对话」可退回；设置 → 面板管理里
  「侧栏布局」应出现开关。

## 边界

- 第三方设置页在设置壳外渲染时，若它依赖弹窗的私有上下文（宽度、滚动容器、`close` 之外的 props），
  可能和设置弹窗里不完全一致；本插件只保证宿主注入的公开部分齐全。
- 补出来的行参与自动分类，会被分进 2–4 个组之一；想固定位置就手动拖动或分组。
- 识别是启发式：设置页 id / label 与面板重合时视为已有入口；新增内置设置页需要加进
  `CORE_SECTION_IDS`。同一个包注册多个设置页会补多行，这是有意的。
