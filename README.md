# dsh-panel-control · 侧栏面板管理

管理 **DeepSeek Harness 侧栏顶部、新会话按钮下方、工作区上方** 的那一列入口（插件 / 插件市场 / 自动化任务 / IM 机器人 / 灵枢 / 工作区管理 …）。

这块区域在实现里叫 **全局面板导航区**，由 `@deepseek-ai/dsh-client-ui-sidebar` 渲染 `sidebar.panellist` 这个列表槽：每个插件把自己的面板注册成槽里的一个 entry，「更多」是由 `sidebar.panellist.actions` 撑起来的溢出菜单。顺序只由注册时的 `order` 决定，宿主没有提供任何运行时接口去改别人的 `order`，所以本插件用一层 DOM 适配器（CSS `order` + `display` + 分组分隔线）实现，不侵入宿主代码。

## 功能

- **排序**：拖动行首的把手，或用行右侧的上移 / 下移按钮逐格移动；「按名称排序」一键 A→Z；「恢复默认」回到插件注册时的原始顺序。
- **隐藏**：每行右侧的眼睛图标。隐藏项只是不显示，仍留在列表里，随时可以放回来（也可以在「更多」菜单里临时恢复）。隐藏不会写任何插件配置，也不会影响该插件本身是否加载。
- **分组**：新建分组（如「创作」「系统」）并给入口分配分组后，侧栏导航区会在组与组之间插入一条**带标题的分隔线**，同组入口自动排在一起。**组的先后顺序完全由设置里的分组列表决定**——分组区和入口列表一样支持拖动行首把手排序（也可用行右侧的上移 / 下移），调完就是侧栏里的顺序，不随入口的注册顺序或分类结果漂移。侧栏折叠成图标条时自动不显示标题、不插分隔线。
- 插件自己的「面板管理」行固定显示，不可隐藏（防止把自己锁在门外）；未接管的节点（如「更多」）始终排在最后。
- **自动分类**：打开「自动分类」开关后，本插件会让当前 profile 的默认模型读一遍入口名称，把它们分成 2–4 组并写好分组名（如「插件扩展」「自动化」「核心功能」）。它**只处理自己还没见过的入口**：装上一个新插件时补一次分类，其余时候不会重跑，也不会改动你已经排好的顺序；想整体重来就手动点「重新分类」。开关只影响分组，不动排序/隐藏；分类结果同样只是本机偏好，不会写进任何插件配置。
- **布局存在 Host 的配置目录里**：`~/.dsh/panel-control/prefs.json`（`~` 是这个 profile 的用户目录）。渲染层的 origin 是 Host 的 loopback 端口，每次启动都会换端口，`localStorage` 会因此"看起来每次都清空"——所以真正的存储放在 Host 侧，`localStorage` 只留一份镜像，读不到 Host 时才回退。按安装维度生效，不跟随工作区。

入口有两处：侧栏导航里的「面板管理」行（滑块图标），以及 **设置 → 面板管理**。

![面板管理](assets/screenshot-panel.png)

侧栏里分组后的效果（模型自动分类出的 `插件扩展` / `自动化` / `核心功能`）：

![侧栏分组效果](assets/screenshot-sidebar-groups.png)

## 界面

页面按 DSH 插件的页面框架摆：滚动条在页面层、边距落在内容列上，正文列上限 960px 居中，`28px + --dsh-frame-top-clearance` 起头。颜色全部取自 `--dsw-*` 语义 token（深浅色主题共用一套规则，不写死颜色、不分支 `prefers-color-scheme`），层级靠表面台阶 + 发丝线而不是阴影。字号收敛成 11/12/13/16 四档，数字与 id 用等宽体 + `tabular-nums`。行一律单行：名称与注册 id 同行、行高 40，页头压成「标题 + 操作 / 副标题 · 计数 / 一行提示」三行，分组名输入框按内容收窄而不是拉成一条长框。图标统一 16px、描边 1.5 的自绘 SVG（没有 emoji，也没有借用字体里的箭头字符）。控件圆角 6–10，卡片 12，动效只有一个 `cubic-bezier(.16,1,.3,1)` 的 120ms 反馈与一次 180ms 入场，系统开启"减少动态效果"时全部关闭。

视觉规范沿用 [unslop](https://github.com/heydamir/unslop)（Damir Sokolovsky，CC BY 4.0）的思路，按 DSH 的 token 体系与页面框架改写；分组下拉是自绘的，因为原生 `<select>` 的选项列表由系统控件绘制，深色主题下会弹出白底白字。

把这套页面做出来时踩到的具体数字与坑（页面框架、单行行高、输入框居中、两套列表的统一重排、热替换时的样式表打架、无 DevTools 的现场验证）整理在 [docs/ui-design-notes.md](docs/ui-design-notes.md)。

## 安装

```bash
# 1. 放进全局 profile（本地开发用 link:）
#    C:/Users/<you>/.dsh/profiles/desktop/package.json
#    "dsh": { "profile": { "bundles": [ ..., "dsh-panel-control" ] } }
#    "dependencies": { ..., "dsh-panel-control": "link:D:/Github/dsh-panel-control" }
#
# 2. 建目录链接（免管理员）
cd C:/Users/<you>/.dsh/profiles/desktop
cmd //c mklink /J node_modules\\dsh-panel-control D:\\Github\\dsh-panel-control
```

装好后**不需要重启 DSH**：新增 bundle 会随下一次页面重载生效（`Ctrl+R`，或界面里的刷新）。

## 实现要点

- 两半：`client.js` 管布局（排序 / 隐藏 / 分组分隔线），`index.js`（Host）只做一件事——提供「让模型分类」的唯一一条路由。
- 客户端拿不到模型：`ctx.remote.llm.*` 只有 `listProviders` / `listConfigurableProviders` / `discoverModels` 三个只读方法，没有任何补全入口，所以模型调用必须落在 Host 侧。
- Host 路由：`ctx.connection.fetch.register({ path: '/api/dsh-panel-control/classify', methods: ['POST'], requestBody: 'buffered' })`，信封与 `/api` 网关一致（`{type:'client-request', rpcId, method, payload}` → `{type:'server-response', rpcId, result}`）；只接受 loopback 的 Host/Origin、只接受 `application/json`、请求体上限 64 KB、45 s 超时，一次请求最多 1 次模型调用。
- 模型调用：`ctx.agentDefaultModel.currentSelection()` 取默认 provider/model，`ctx.llm.prepareCall(...)` 后 `prepared.stream(prepared.config)` 收流并拼 `text-delta`。分类不需要思考预算，因此该次调用固定 `reasoningEffort: 'off'`（否则思考会吃掉输出额度、拿不到正文）；返回的 JSON 在 Host 侧就做白名单清洗（未知 id、重复 id、超过 4 组、超长组名都会被丢弃）。
- 设置读写也走同一条路由：`{method:'load'}` / `{method:'save'}`（原子写 `prefs.json`，上限 256 KB），另有 `{method:'report'}` 把客户端的异常与启动信息写进 `~/.dsh/panel-control/client.log`。Host 侧日志写在同目录的 `host.log`，出问题先看这两个文件。
- 干净降级：`connection` 或 `llm` 不可用时路由不注册 / 返回明确错误，客户端在开关下方显示原因，不影响布局功能。
- 启动稳定性（v0.3.0 修的三个真问题）：①`apply()` 里调用的 `applyInner` 曾是对象方法——方法名不在词法作用域里，`apply()` 直接 `ReferenceError`，于是"插件装了但没运行"，现已改成真正的函数；②`locale` 不再是硬依赖，`inject` 只留 `slots`，可选服务统一走 `optionalService(ctx, name)`（`ctx.get(name)` + `try`），缺服务只会降级不会让 `apply` 抛错；③宿主渲染侧栏可能晚于插件 apply，引擎启动改成 `[0,120,400,1000,2500,5000,9000,14000] ms` 重试 + 每 3 s 轮询直到找到导航区容器。
- 定位导航区：优先 `[class*="panelList"]`，失败时用已知面板的 `button[aria-label]` 反查公共父节点。
- 行身份：以 `sidebar.panellist` 的 `entriesOfSlot()` 顺序（按 `order` 稳定排序）为位置主键，用 DOM 的 `aria-label` 做二次校验，宿主重渲染后自动重新对齐。
- 应用方式只写 `style.order` / `style.display` / `data-dpc-group`，不移动 DOM 节点，避免与 React 的 reconciliation 打架。
- 变更来源：`MutationObserver`（childList + class/style 属性）、`window.resize`、`ctx.slots.subscribe('sidebar.panellist')`、`ctx.locale.subscribe` 都汇入一次 `requestAnimationFrame` 去抖的 `schedule()`；应用期间暂停 observer 防止自激，签名不变时短路。
- 语言：注册 `locale` 命名空间 `dsh-panel-control`，中英双语，跟随界面语言切换。

## 自测

`.scratch/harness.html` 是引擎测试页：伪造 `panelList` DOM、假 `react`、假 `ctx`，直接驱动 `testables.createEngine()`，覆盖排序 / 隐藏 / 分组分隔线 / 分组顺序不漂移 / 两套列表共用的拖拽重排规则 / 折叠态 / 新注册项 / 脏数据清洗，当前 **27 项全部通过**。`.scratch/apply-test.html` 另外用伪 Cordis 上下文调用真实的 `apply(ctx)`，断言它注册了 `locale` / `main` / `settings.section` / `sidebar.panellist` 四样东西——上一版的 `ReferenceError` 就是它抓出来的。

```bash
python -m http.server 8787 --bind 127.0.0.1   # 在仓库根目录
# 打开 http://127.0.0.1:8787/.scratch/harness.html
```

## 边界

- 自动分类会把**入口名称**（如「插件市场」「工作区管理」，不含任何会话内容、路径或凭据）发给当前 profile 配置的模型服务商；不想发就别开这个开关，它的结果也可以在面板里随手改。
- 分组是"建议"：模型只提出组名与归属，你可以在每行右侧的下拉里改成别的组，或直接改组名。
- 宿主若改动 `panelList` 的 class 命名或行结构，需要同步更新选择器；已做多级回退，但仍是 DOM 适配层。
- 隐藏/分组只影响本机这份侧栏渲染，不改动任何插件自身配置。
- 插件销毁时移除注入的 `style` 节点、observer 与轮询定时器；布局存在 `~/.dsh/panel-control/prefs.json`，重装或重启后接着用（想清空就在面板里点「恢复默认」，或直接删掉这个文件）。
