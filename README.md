# dsh-panel-control · 侧栏面板管理

管理 **DeepSeek Harness 侧栏顶部、新会话按钮下方、工作区上方** 的那一列入口（插件 / 插件市场 / 自动化任务 / IM 机器人 / 灵枢 / 工作区管理 …）。

这块区域在实现里叫 **全局面板导航区**，由 `@deepseek-ai/dsh-client-ui-sidebar` 渲染 `sidebar.panellist` 这个列表槽：每个插件把自己的面板注册成槽里的一个 entry，「更多」是由 `sidebar.panellist.actions` 撑起来的溢出菜单。顺序只由注册时的 `order` 决定，宿主没有提供任何运行时接口去改别人的 `order`，所以本插件用一层 DOM 适配器（CSS `order` + `display` + 分组分隔线）实现，不侵入宿主代码。

## 功能

- **排序**：拖拽行首的 `⠿`，或用 `↑` `↓` 逐格移动；「按名称排序」一键 A→Z；「恢复默认」回到插件注册时的原始顺序。
- **隐藏**：每行右侧的 `●` 开关。隐藏项只是不显示，仍留在列表里，随时可以放回来（也可以在「更多」菜单里临时恢复）。隐藏不会写任何插件配置，也不会影响该插件本身是否加载。
- **分组**：新建分组（如「创作」「系统」）并给入口分配分组后，侧栏导航区会在组与组之间插入一条**带标题的分隔线**，同组入口自动排在一起；组的先后顺序 = 组在侧栏里第一次出现的顺序。侧栏折叠成图标条时自动不显示标题、不插分隔线。
- 插件自己的「面板管理」行固定显示，不可隐藏（防止把自己锁在门外）；未接管的节点（如「更多」）始终排在最后。
- 布局持久化在 `localStorage` 的 `dsh.panel-control.v1`，按安装维度生效，不跟随工作区。

入口有两处：侧栏导航里的「面板管理」行（滑块图标），以及 **设置 → 面板管理**。

![面板管理](assets/screenshot-panel.png)

侧栏里分组后的效果（`创作` / `系统` 两个标题，`自动化任务` 已被隐藏）：

![侧栏分组效果](assets/screenshot-sidebar-groups.png)

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

- 插件是纯客户端的：`index.js` 只导出空的 `apply()`，全部逻辑在 `client.js`。
- 定位导航区：优先 `[class*="panelList"]`，失败时用已知面板的 `button[aria-label]` 反查公共父节点。
- 行身份：以 `sidebar.panellist` 的 `entriesOfSlot()` 顺序（按 `order` 稳定排序）为位置主键，用 DOM 的 `aria-label` 做二次校验，宿主重渲染后自动重新对齐。
- 应用方式只写 `style.order` / `style.display` / `data-dpc-group`，不移动 DOM 节点，避免与 React 的 reconciliation 打架。
- 变更来源：`MutationObserver`（childList + class/style 属性）、`window.resize`、`ctx.slots.subscribe('sidebar.panellist')`、`ctx.locale.subscribe` 都汇入一次 `requestAnimationFrame` 去抖的 `schedule()`；应用期间暂停 observer 防止自激，签名不变时短路。
- 语言：注册 `locale` 命名空间 `dsh-panel-control`，中英双语，跟随界面语言切换。

## 自测

`.scratch/harness.html` 是一个不依赖 DSH 的引擎测试页：伪造 `panelList` DOM、假 `react`、假 `ctx`，直接驱动 `testables.createEngine()`，覆盖排序 / 隐藏 / 分组分隔线 / 折叠态 / 新注册项 / 脏数据清洗，当前 **21 项全部通过**。

```bash
python -m http.server 8787 --bind 127.0.0.1   # 在仓库根目录
# 打开 http://127.0.0.1:8787/.scratch/harness.html
```

## 边界

- 宿主若改动 `panelList` 的 class 命名或行结构，需要同步更新选择器；已做多级回退，但仍是 DOM 适配层。
- 隐藏/分组只影响本机这份侧栏渲染，不改动任何插件自身配置。
- 插件销毁时移除注入的 `style` 节点与 observer；`localStorage` 里的布局会保留，重新装回后接着用（想清空就在面板里点「恢复默认」）。
