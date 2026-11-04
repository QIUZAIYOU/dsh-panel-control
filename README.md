# dsh-panel-control · 侧栏面板管理

管理 DeepSeek Harness 侧栏顶部那一列插件入口（插件、插件市场、自动化任务、灵枢、工作区管理……）：排序、隐藏、分组、折叠；导航项变多时，还会托住下方的会话与工作区列表。

## 功能

- **排序** — 拖动行首把手任意换位；一键按名称 A→Z；一键恢复注册时的默认顺序。
- **隐藏** — 行右侧的眼睛图标。隐藏项仍留在列表里，随时放回；不影响插件是否加载，也不写插件自己的配置。
- **分组** — 新建分组（如「创作」「系统」）并把入口分进去，侧栏会在组与组之间插入带标题的分隔线。组的先后由设置里的分组列表拖动决定，与注册顺序、分类结果无关。
- **分组折叠** — 点分组标题收起该组，只留标题与计数；`Enter` / 空格同样可切换，状态写进配置。侧栏收成图标条时不显示标题，也不折叠。
- **侧栏溢出兜底** — 导航项变多时，官方侧栏会把下方的会话/工作区列表压到 0 高且无法滚动（[讨论 #12083](https://github.com/deepseek-ai/deepseek-harness/discussions/12083)）。本插件给导航列表加上限高与滚动，给下方区域留最小高度。
- **自动分类** — 用当前 profile 的默认模型读入口名称，自动分成 2–4 组。只处理没见过的入口，不会改动你排好的顺序；随时可手动「重新分类」。
- **面板管理自己不可隐藏** — 避免把自己锁在门外；未接管的节点（如「更多」）始终排在最后。

## 界面

![面板管理](assets/screenshot-panel.png)

侧栏分组后的效果：

![侧栏分组效果](assets/screenshot-sidebar-groups.png)

两个入口：侧栏导航里的「面板管理」行，以及 **设置 → 面板管理**（同一套管理界面整块嵌在设置页）。

## 安装

从 npm 安装（推荐）：

```bash
cd C:/Users/<you>/.dsh/profiles/desktop
npm install dsh-panel-control@0.7.2
```

把包名加进同一目录 `package.json` 的 `dsh.profile.bundles`：

```jsonc
"dsh": { "profile": { "bundles": [ ..., "dsh-panel-control" ] } }
```

`npm install` 会把包（含 `client.js` 与 `cordis.patch.yml`）放进 profile 的 `node_modules`，不需要再建目录链接。

本地开发用 `link:` 指向工作副本，再建目录链接（免管理员）：

```bash
cd C:/Users/<you>/.dsh/profiles/desktop
cmd //c mklink /J node_modules\dsh-panel-control D:\Github\dsh-panel-control
```

装好后需要一次页面重载才会加载新的 bundle（界面里的刷新按钮，或重启 DSH）。

## 侧栏布局与折叠

官方 `dsh-client-ui-sidebar` 把导航列表设为 `flex: none`，把下方区域设为 `flex: 1; overflow: hidden`。导航项一多，列表独占高度，下方被压成 0 高且没有可滚动容器——滚轮看起来"失灵"，其实是没东西可滚。

本插件不改宿主代码，只从三个属性出发写 CSS：

| 属性 | 加在哪 | 作用 |
| --- | --- | --- |
| `data-dpc-list` | 导航列表容器 | `overflow-y: auto` + 高度上限 `max(120px, var(--dpc-panellist-max, 45vh))` |
| `data-dpc-unbounded` | 同上（选择「不限」时） | 取消高度上限，列表按内容撑开 |
| `data-dpc-region` | 列表下方的会话/工作区区域 | 保留最小高度 `min(120px, 18vh)` |

设置页「侧栏布局」卡片里可以调整：

- 高度兜底开关，以及 35 / 45 / 55 / 不限 四档上限；
- 分组折叠开关，以及「全部收起 / 全部展开」；
- 折叠状态按分组 id 记在配置里，重启后保留。

## 配置与存储

布局写在 Host 侧：`~/.dsh/panel-control/prefs.json`（`~` 是这个 profile 的用户目录）。包含顺序、隐藏项、分组、折叠状态、布局开关与分类结果。

页面 origin 是 Host 的 loopback 端口，每次启动都会换端口，`localStorage` 会因此"看起来每次清空"——所以真实存储放在 Host 侧，`localStorage` 只留镜像；读不到 Host 时才回退到镜像。配置按安装维度生效，不跟随工作区。

## 排错

- **侧栏没有「面板管理」**：先重载一次页面。仍没有，看 `~/.dsh/panel-control/host.log` 与 `client.log`。
- **插件管理显示运行，界面却没变化**：页面多半还在用旧的 bundle revision（刚改过 `client.js` 时常见），重载一次即可。
- **改了代码没反应**：确认 `BUILD_STAMP` 与 `package.json` 的版本一致，并跑一遍 `npm run check`。

## 开发与测试

```bash
npm run check     # 语法检查 + 宿主路由 smoke + 布局/版本静态断言
npm run smoke     # 只跑宿主路由用例
npm run doctor    # 体检 profile 安装状态
```

- `.scratch/harness.html`：引擎测试页（伪造 DOM 与 ctx），覆盖排序、隐藏、分组、折叠、脏数据清洗。
- `scripts/host-smoke.mjs`：驱动宿主侧路由，覆盖设置读写、分类请求与 bundle 兜底。
- `scripts/layout-smoke.mjs`：断言侧栏布局的 CSS 钩子与关键数值，并校验 `BUILD_STAMP` 与版本号一致。

进一步材料：[docs/sidebar-layout.md](docs/sidebar-layout.md)（布局与折叠实现）、[docs/ui-design-notes.md](docs/ui-design-notes.md)（界面规范与踩坑）、[docs/discussion-bundle-evaluated-twice.md](docs/discussion-bundle-evaluated-twice.md)（bundle 被求值两次的事故复盘）。

## 边界

- 自动分类会把入口名称发给当前 profile 配置的模型服务商；不想要就关掉开关，分组仍可手动编辑。
- 分类结果只是建议，可以整体重排或改名。
- 依赖宿主侧栏的 DOM 结构（`[class*="panelList"]` 与面板按钮的 `aria-label`），官方大改版时需要跟进。
- 只写 `style.order`、`style.display` 与 `data-dpc-*` 属性，不移动 React 节点，不改宿主代码。
- 排序、隐藏、分组都只影响本机这份安装。

## 许可

MIT
