# dsh-panel-control · 侧栏面板管理

管理 DeepSeek Harness 侧栏顶部那一列插件入口（插件、插件市场、自动化任务、灵枢、工作区管理……）：排序、隐藏、分组、折叠；导航项变多时，还会托住下方的会话与工作区列表。

## 功能

- **排序** — 拖动行首把手任意换位；一键按名称 A→Z；一键恢复注册时的默认顺序。
- **隐藏** — 行右侧的眼睛图标。隐藏项仍留在列表里，随时放回；不影响插件是否加载，也不写插件自己的配置。
- **重命名** — 行右侧的铅笔图标把名称改成你熟悉的叫法，`Enter` 或失焦保存，`Esc` 取消，清空即恢复原名。改名只改侧栏显示，不动插件自己的配置；宽侧栏下改过名的行会在最右侧显示插件包名小标签（省略 `dsh-` 前缀，可在「侧栏布局」里关掉），避免时间久了忘记它原本是谁。
- **分组** — 新建分组（如「创作」「系统」）并把入口分进去，侧栏会在组与组之间插入带标题的分隔线。组的先后由设置里的分组列表拖动决定，与注册顺序、分类结果无关。分组行右侧的眼睛可以整组隐藏；它只覆盖分组状态，组内单行原有的隐藏状态会原样保留。
- **分组折叠** — 点分组标题收起该组，只留标题与计数；`Enter` / 空格同样可切换，状态写进配置。侧栏收成图标条时不显示标题，也不折叠。
- **侧栏溢出兜底** — 导航项变多时，官方侧栏会把下方的会话/工作区列表压到 0 高且无法滚动（[讨论 #12083](https://github.com/deepseek-ai/deepseek-harness/discussions/12083)）。本插件给导航列表加上限高与滚动，给下方区域留最小高度。
- **自动分类** — 用当前 profile 的默认模型读入口名称，自动分成 2–4 组。只处理没见过的入口，不会改动你排好的顺序；随时可手动「重新分类」。
- **设置页补入口** — 有的第三方插件只注册了设置页（`settings.section`），却没给面板入口，设置页只能从设置弹窗里翻到。本插件为这类插件自动补一行侧栏入口：点开就是宿主渲染的完整设置页，顶部带「返回对话」；不依赖插件白名单，整体可在「侧栏布局」里关掉。
- **面板管理自己不可隐藏** — 避免把自己锁在门外；未接管的节点（如「更多」）始终排在最后。

## 界面

![面板管理](assets/screenshot-panel.png)

侧栏分组后的效果：

![侧栏分组效果](assets/screenshot-sidebar-groups.png)

两个入口：侧栏导航里的「面板管理」行，以及 **设置 → 面板管理**（同一套管理界面整块嵌在设置页）。

补出来的设置页入口也出现在同一个侧栏列表里，排在普通入口之后、本插件自己之前；标题沿用设置页自己的名称，重复时附带设置页 id 以区分。

改过名的入口仍把原来的注册名留在按钮属性里，引擎靠它把自己映射回同一条注册，所以宿主的排序、重渲染和后续重扫都不受影响；行尾标签显示的是插件包名（由 Host 从安装目录的 `package.json` 解析，`dsh-` 前缀已省略），屏幕阅读器与工具提示读到的则是你设定的显示名。

## 安装

要求 DeepSeek Harness `>= 0.2.1-rc.3`（更旧的版本缺少本插件依赖的槽与模块图接口，宿主会拒绝加载）。

从 npm 安装（推荐）：

```bash
cd C:/Users/<you>/.dsh/profiles/desktop
npm install dsh-panel-control@0.9.4
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
- 设置页入口开关（默认开）。关掉后补出来的行会连同注册一起撤掉，不只是藏起来；
- 包名标签开关（默认开）。关掉后改名仍然生效，只是行尾不再显示包名；
- 分组成员数开关（默认关）。打开后设置页分组行与侧栏分组标题都显示该组入口数，关掉两处都不显示；
- 折叠状态按分组 id 记在配置里，重启后保留。

## 配置与存储

布局写在 Host 侧：`~/.dsh/panel-control/prefs.json`（`~` 是这个 profile 的用户目录）。包含顺序、单行隐藏项、分组、分组隐藏状态、自定义名称、折叠状态、布局开关、设置页入口开关、包名标签开关、分组成员数开关与分类结果。

页面 origin 是 Host 的 loopback 端口，每次启动都会换端口，`localStorage` 会因此"看起来每次清空"——所以真实存储放在 Host 侧，`localStorage` 只留镜像；读不到 Host 时才回退到镜像。配置按安装维度生效，不跟随工作区。

## 排错

- **侧栏没有「面板管理」**：先重载一次页面。仍没有，看 `~/.dsh/panel-control/host.log` 与 `client.log`。
- **设置页入口没补出来**：`host.log` 里先搜 `bridge-scan`，启动后的前几次扫描会列出当时可见的设置页（`id:registrant`）和侧栏条目；再搜 `kind=bridge` 看最终补出的 id。目标插件出现在 `sections` 里但 `ids` 没它，说明它的 section id 或 label 与某个已有面板重合，被归属规则当成了已有入口；始终不出现，是它的设置页注册得比扫描更晚（见 `docs/bridged-settings-pages.md`）。
- **补出的设置页和设置弹窗里不一样（英文、缺控件）**：先看同一条 `bridge-scan` 的 `wiring` 字段，`i/l/s` 分别表示该 section 的 inject / locale / store 是否带到了桥接条目上；三个都缺多半是宿主条目结构变了（注册面在条目顶层，不在 `options` 里）。若 `wiring` 齐全但页面仍不同，则是该设置页依赖设置弹窗的私有上下文，属于边界情况。
- **插件管理显示运行，界面却没变化**：页面多半还在用旧的 bundle revision（刚改过 `client.js` 时常见），重载一次即可。
- **改了代码没反应**：确认 `BUILD_STAMP` 与 `package.json` 的版本一致，并跑一遍 `npm run check`。

## 开发与测试

```bash
npm run check     # 语法检查 + 宿主路由 smoke + 布局/桥接/改名静态与行为断言
npm run smoke     # 只跑宿主路由用例
npm run doctor    # 体检 profile 安装状态
```

- `.scratch/harness.html`：引擎测试页（伪造 DOM 与 ctx），覆盖排序、隐藏、分组、折叠、脏数据清洗。
- `scripts/host-smoke.mjs`：驱动宿主侧路由，覆盖设置读写、分类请求与 bundle 兜底。
- `scripts/layout-smoke.mjs`：断言侧栏布局的 CSS 钩子与关键数值，并校验 `BUILD_STAMP` 与版本号一致。
- `scripts/bridge-smoke.mjs`：在假 ctx 上跑 `client.js`，断言只给「有设置页、没有侧栏入口」的第三方插件补行，且成对注册 main、开关关闭后整体撤回、桥接页经自有子槽交给宿主渲染并能返回对话。
- `scripts/names-smoke.mjs`：用迷你 DOM 驱动真实引擎，断言改名覆盖宿主标题与 `aria-label`、包名标签的位置与开关、清空恢复、窄侧栏不出标签、重复名称仍能按位置映射、未知包不显示标签，以及 `dispose` 后 DOM 原样归还。

进一步材料：[docs/sidebar-layout.md](docs/sidebar-layout.md)（布局与折叠实现）、[docs/renaming-panels.md](docs/renaming-panels.md)（重命名与包名标签）、[docs/bridged-settings-pages.md](docs/bridged-settings-pages.md)（设置页补入口的识别与渲染）、[docs/ui-design-notes.md](docs/ui-design-notes.md)（界面规范与踩坑）、[docs/discussion-bundle-evaluated-twice.md](docs/discussion-bundle-evaluated-twice.md)（bundle 被求值两次的事故复盘）。

## 边界

- 自动分类会把入口名称发给当前 profile 配置的模型服务商；不想要就关掉开关，分组仍可手动编辑。
- 分类结果只是建议，可以整体重排或改名。
- 依赖宿主侧栏的 DOM 结构（`[class*="panelList"]` 与面板按钮的 `aria-label`），官方大改版时需要跟进。
- 重命名只覆盖侧栏的显示层：宿主标题文本、`aria-label` 与包名标签都是本插件写的，插件自己的配置和入口 id 不变；宿主重渲染后由下一次扫描补回。图标条模式没有标题文本，只改可访问名称，也不显示包名标签。包名由 Host 从模块所在安装目录的 `package.json` 解析（模块 id 不等于包名，例如 `dsh-enhance-ui` → `@wufeng0105/dsh-enhance`），接口不可用或解析不到时该行不显示标签。
- 只写 `style.order`、`style.display` 与 `data-dpc-*` 属性，不移动 React 节点，不改宿主代码。
- 排序、隐藏、分组都只影响本机这份安装。
- 设置页入口按「section id / label 是否已被某个面板占用」识别归属，不依赖插件声明的注册者（client runner 会把多个插件报成同一个名字）；代价是启发式：与面板同名的第三方设置页会被视为已有入口，新增内置设置页需要更新 `CORE_SECTION_IDS`。第三方设置页按宿主渲染器原位渲染，若它自己依赖设置弹窗的私有上下文，可能出现布局差异。

## 许可

MIT
