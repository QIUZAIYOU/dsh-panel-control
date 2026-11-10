# dsh-panel-control · 侧栏面板管理

DeepSeek Harness 的侧栏入口会越装越多。这个插件给顶部那一列加上排序、隐藏和分组，下面的会话和工作区就不会被挤掉。

![界面预览：左右树与自动分类](https://raw.githubusercontent.com/QIUZAIYOU/dsh-panel-control/v0.10.3/assets/screenshot-panel.png)

*界面预览 · 示例数据*

## 功能

- **分组树**：设置页左边是未分组入口，右边是分组。拖进组里就归类，拖到组内某个位置就排序；拖回左边就移出分组。只要有一个分组里已经有入口，未分组入口就不再出现在侧栏，左栏只作暂存区。
- **排序**：拖动行首把手调整顺序。组内顺序就是侧栏里的顺序，拖动组标题调整组与组的先后；也可以按名称排序或恢复默认。
- **隐藏与重命名**：行尾眼睛隐藏入口，铅笔修改显示名。两者只改这份安装的显示层，不影响插件加载，也不写插件自己的配置。
- **折叠**：侧栏里点分组标题收起该组，`Enter` 或空格同样可以切换，状态写进配置。设置页里隐藏的分组默认收起；组标题前的箭头只影响设置页视图，不改变侧栏显隐。
- **自动分类**：用当前 profile 的默认模型把入口分成 2 到 4 组。手动拖过的入口会锁定，点「只分未动过的」会跳过它们；「全部分类」会重新分配所有入口，但不清除锁定，之后的自动分类仍会跳过它们。
- **设置页补入口**：第三方插件只注册了设置页、没有侧栏入口时，自动补一行；点开是宿主渲染的完整设置页。可以在「侧栏布局」里整体关掉。
- **侧栏溢出**：入口过多时，导航列表会限高并滚动，下方的会话与工作区列表不会被压到零高（[讨论 #12083](https://github.com/deepseek-ai/deepseek-harness/discussions/12083)）。
- **自身保护**：面板管理自己不可隐藏，避免把自己锁在门外；未接管的节点（如「更多」）始终排在最后。

## 界面

侧栏分组效果：

![侧栏分组效果](https://raw.githubusercontent.com/QIUZAIYOU/dsh-panel-control/v0.10.3/assets/screenshot-sidebar-groups.png)

设置页从上到下是：标题与提示、自动分类、分组树、侧栏布局、诊断。侧栏导航里的「面板管理」和 **设置 → 面板管理** 打开同一套界面。

删除分组不会删除入口。成员回到左栏暂存区；只要还有别的分组里已经有入口，成员就不再显示在侧栏。补出的设置页入口沿用原名称，重名时附带 id 区分。

## 安装

要求 DeepSeek Harness `>= 0.2.1-rc.3`。

```bash
cd C:/Users/<you>/.dsh/profiles/desktop
npm install dsh-panel-control@0.10.3
```

把包名加进同一目录 `package.json` 的 `dsh.profile.bundles`：

```jsonc
"dsh": { "profile": { "bundles": [ ..., "dsh-panel-control" ] } }
```

装好后重载一次页面（界面里的刷新按钮，或重启 DSH）。

## 配置

布局写在 Host 侧：`~/.dsh/panel-control/prefs.json`，包括顺序、隐藏、分组、名称、折叠和各类开关。

页面 origin 是 Host 的 loopback 端口，每次启动都会换端口，所以 `localStorage` 只作镜像。真实配置在 Host 侧，按安装维度生效，不跟随工作区。

「侧栏布局」里可以调整高度兜底与上限、分组折叠、设置页入口、包名标签和分组成员数。成员数默认关闭。

## 排错

- **侧栏没有「面板管理」**：先重载页面。仍然没有，就看 `~/.dsh/panel-control/host.log` 与 `client.log`。
- **设置页入口没补出来，或补出来和设置弹窗不一样**：查看 `host.log` 里的 `bridge-scan`。`wiring` 的 `i/l/s` 分别对应 inject、locale、store。详见 [设置页补入口](docs/bridged-settings-pages.md)。
- **界面改了却没变化**：页面可能还在用旧的 bundle revision，重载一次。
- **改了代码没反应**：确认 `BUILD_STAMP` 与 `package.json` 版本一致，再运行 `npm run check`。

## 开发

```bash
npm run check     # 语法、宿主路由、布局、桥接与改名断言
npm run smoke     # 只跑宿主路由
npm run doctor    # 体检 profile 安装状态
```

进一步材料：[侧栏布局](docs/sidebar-layout.md)、[重命名](docs/renaming-panels.md)、[设置页补入口](docs/bridged-settings-pages.md)、[界面规范](docs/ui-design-notes.md)。

## 边界

- 自动分类会把入口名称发给当前 profile 配置的模型服务商。不想发送就关掉开关，分组仍然可以手动编辑。
- 依赖宿主侧栏的 DOM 结构（`[class*="panelList"]` 与面板按钮的 `aria-label`），官方大改版时需要跟进。
- 只写 `style.order`、`style.display` 与 `data-dpc-*` 属性，不移动 React 节点，也不改宿主代码。
- 排序、隐藏、分组只影响本机这份安装。
- 设置页归属按 section id 和 label 识别，是启发式规则。与面板同名的第三方设置页会被视为已有入口；如果第三方设置页依赖设置弹窗的私有上下文，可能出现布局差异。

## 许可

MIT
