# dsh-panel-control · 侧栏面板管理

管理 DeepSeek Harness 侧栏顶部那一列插件入口：排序、隐藏、分组、折叠。导航项变多时，也为下方的会话与工作区列表留出空间。

![界面预览：左右树与自动分类](https://raw.githubusercontent.com/QIUZAIYOU/dsh-panel-control/v0.10.2/assets/screenshot-panel.png)

*界面预览 · 示例数据*

## 功能

- **分组树** — 设置页左边是未分组入口，右边是分组。拖进组里即归类，拖到组内某个位置即排序；拖回左边就是移出分组。只要有一个已填充分组，未分组入口就不再出现在侧栏，左栏只作暂存区。
- **排序** — 拖动行首把手调整顺序。组内顺序就是侧栏里的顺序，拖动组标题调整组与组的先后；也可以按名称排序或恢复默认。
- **隐藏与重命名** — 行尾眼睛隐藏入口，铅笔修改显示名。两者都只改这份安装的显示层，不影响插件加载，也不写插件自己的配置。
- **折叠** — 侧栏里点分组标题收起该组，`Enter` / 空格同样可切换，状态写进配置。设置页里隐藏的分组默认收起；组标题前的箭头只影响设置页视图，不改变侧栏显隐。
- **自动分类** — 用当前 profile 的默认模型把入口分成 2–4 组。手动拖过的入口会锁定，安全按钮「只分未动过的」跳过它们；「全部分类」一次性重新分配所有入口，但不清除锁定，之后的自动分类仍会跳过。
- **设置页补入口** — 第三方插件只注册了设置页、没有侧栏入口时，自动补一行；点开是宿主渲染的完整设置页。可在「侧栏布局」里整体关掉。
- **侧栏溢出兜底** — 给导航列表加上限高与滚动，避免下方的会话/工作区列表被压到零高（[讨论 #12083](https://github.com/deepseek-ai/deepseek-harness/discussions/12083)）。
- **面板管理自己不可隐藏** — 避免把自己锁在门外；未接管的节点（如「更多」）始终排在最后。

## 界面

侧栏分组效果：

![侧栏分组效果](https://raw.githubusercontent.com/QIUZAIYOU/dsh-panel-control/v0.10.2/assets/screenshot-sidebar-groups.png)

两个入口：侧栏导航里的「面板管理」，以及 **设置 → 面板管理**。两边是同一套管理界面。

删除分组不会删除入口：成员回到左栏暂存区，只要还有其它已填充分组，就不再显示在侧栏。补出的设置页入口沿用设置页自己的名称，重复时附带 id 区分。

## 安装

要求 DeepSeek Harness `>= 0.2.1-rc.3`。

```bash
cd C:/Users/<you>/.dsh/profiles/desktop
npm install dsh-panel-control@0.10.2
```

把包名加进同一目录 `package.json` 的 `dsh.profile.bundles`：

```jsonc
"dsh": { "profile": { "bundles": [ ..., "dsh-panel-control" ] } }
```

装好后需要一次页面重载（界面里的刷新按钮，或重启 DSH）。

## 配置

布局写在 Host 侧：`~/.dsh/panel-control/prefs.json`。包含顺序、隐藏项、分组、分组隐藏状态、自定义名称、折叠状态、布局开关、设置页入口开关、包名标签开关、分组成员数开关、手动锁定项与分类结果。

页面 origin 是 Host 的 loopback 端口，每次启动都会换端口，所以 `localStorage` 只作为镜像；真实配置在 Host 侧，按安装维度生效，不跟随工作区。

「侧栏布局」里可以调整：高度兜底与上限、分组折叠、设置页入口、包名标签、分组成员数。成员数默认关闭。

## 排错

- **侧栏没有「面板管理」**：先重载页面；仍没有，看 `~/.dsh/panel-control/host.log` 与 `client.log`。
- **设置页入口没补出来，或补出来和设置弹窗不一样**：查看 `host.log` 的 `bridge-scan`；`wiring` 的 `i/l/s` 分别对应 inject / locale / store。详见 [设置页补入口](docs/bridged-settings-pages.md)。
- **界面改了却没变化**：页面可能还在用旧的 bundle revision，重载一次。
- **改了代码没反应**：确认 `BUILD_STAMP` 与 `package.json` 版本一致，并运行 `npm run check`。

## 开发

```bash
npm run check     # 语法、宿主路由、布局、桥接与改名断言
npm run smoke     # 只跑宿主路由
npm run doctor    # 体检 profile 安装状态
```

进一步材料：[侧栏布局](docs/sidebar-layout.md)、[重命名](docs/renaming-panels.md)、[设置页补入口](docs/bridged-settings-pages.md)、[界面规范](docs/ui-design-notes.md)。

## 边界

- 自动分类会把入口名称发给当前 profile 配置的模型服务商；不想要就关掉开关，分组仍可手动编辑。
- 依赖宿主侧栏的 DOM 结构（`[class*="panelList"]` 与面板按钮的 `aria-label`），官方大改版时需要跟进。
- 只写 `style.order`、`style.display` 与 `data-dpc-*` 属性，不移动 React 节点，不改宿主代码。
- 排序、隐藏、分组都只影响本机这份安装。
- 设置页归属按 section id / label 识别，是启发式：与面板同名的第三方设置页会被视为已有入口。第三方设置页若依赖设置弹窗的私有上下文，可能出现布局差异。

## 许可

MIT
