# 侧栏布局：为什么是兜底而不是改包

## 问题

`@deepseek-ai/dsh-client-ui-sidebar` 的 `.root` 下，`panelList` 与 `regionArea` 是兄弟节点：

```css
.hHd-Xa_panelList  { flex: none; }
.hHd-Xa_regionArea { flex: 1; overflow: hidden; }
```

导航项超过窗口能容纳的高度后，列表按内容高度独占，`regionArea` 分到的高度趋近 0，`overflow:hidden`
把内容裁掉，而全页没有任何可滚动容器——滚轮"失效"只是现象。官方包在 0.2.1-rc.4 上如此，桌面浏览器
压到约 700px 也能复现。

## 做法

1. **不改官方包**。类名是构建时哈希（`hHd-Xa_`、`wtg9ga_`），每次发版都会变，任何按类名写的补丁都会碎。
   插件只加自己的属性：`data-dpc-list`、`data-dpc-unbounded`、`data-dpc-region`。
2. **CSS 只依赖属性**，写在 `SIDEBAR_CSS`：
   - 列表 `flex:0 1 auto;min-height:0;overflow-y:auto;max-height:max(120px,var(--dpc-panellist-max,45vh))`
   - 上限「不限」时加 `data-dpc-unbounded` → `max-height:none`（仍然可滚）
   - 区域 `flex:1 1 auto;min-height:min(120px,18vh)`，保证会话区永远有位置
3. **每次 apply 重新打标**（列表可能被 React 重建）；`destroy()` 逐个移除属性与 `--dpc-panellist-max`。
4. **分组标题即折叠按钮**。标题本来由本插件插入，所以点击处理不碰 React 的节点；折叠只是给组员按钮
   写 `display:none` + `data-dpc-collapsed`，与「隐藏」是两条独立的状态。
5. **分组显隐是第三种状态**，存在 `prefs.hiddenGroups`（组 id 数组）。引擎用 `hiddenIdsOf()` 把它和
   `prefs.hidden` 合成最终隐藏集合，再统一写 `display:none` + `data-dpc-hidden`。它不往 `hidden` 里批量
   写成员，所以「显示整组」不会把组内原本手动隐藏的行一起放出来；固定行 `panel-control` 永不被组隐藏。
6. **分组成员数是可选显示**，由 `prefs.counts` 控制，默认关闭。打开后设置页分组行显示成员数，侧栏
   分组标题也带同样的数字；关掉时两处都不渲染（侧栏连 `dpc-sepCount` 节点都不创建），顶部工具栏的
   「N 个入口 · 隐藏 M 个」不受它影响。`counts` 进入 apply 签名，切换开关会立刻重画分组标题。
7. **组内顺序不另存字段**。`prefs.order` 仍是所有入口的唯一顺序；分组只是按 `prefs.assign` 过滤它。
   设置页读同一份 `order`：左栏是未分组项，右栏每个组按 `order` 过滤出成员。拖一行进组时，
   `moveRowToGroup()` 在一次 `commit` 里同时改 `order`（移到目标前或末尾）和 `assign`，所以侧栏不会
   先按旧组渲染一帧再跳。组标题拖动只调 `moveGroupBefore()` 改 `prefs.groups` 的先后。
8. **左栏是暂存区，不是侧栏的「未分组」区**。只要至少有一个已填充的分组，`readPlan()` 就把未分组
   入口加入 `hiddenIds`，侧栏不渲染它们；`panel-control` 自己例外，并在 blocks 末尾保留一个无标题
   的尾部块，保证管理器仍可达。没有任何已填充分组时（新装、或所有组都空）仍回退到显示全部入口，
   不会出现空白侧栏。
9. **设置页的组收起是视图状态，不写 prefs**。右栏里隐藏组默认收起、可见组默认展开；`groupFold`
   只存本次访问的显式覆盖。组标题前的 chevron 只改这个覆盖，不碰 `hiddenGroups`；眼睛切换前会
   清掉覆盖，让组回到「隐藏即收起、显示即展开」的默认。拖到收起组标题上归类后自动展开，否则
   用户会以为拖拽没生效。折叠时整段 `ul.dpc-treeChildren` 不挂载，不只是 `display:none`。
10. **安全分类只碰用户没动过的入口；「全部分类」是一次性覆盖**。`prefs.autoSkip` 记手动锁定：拖拽归类/排序时
   `moveRowToGroup()` 在同一次 commit 里加锁；删除分组时，被清掉 `assign` 的成员也加锁。
   旧文件没有 `autoSkip`，`autoSkipSet()` 用现有数据反推：`autoFiled` 里已有记录、但当前 `assign`
   为空或指向不存在的组，只可能是被手动拖出或随组删除。设置页给两个手动入口：
   `classifyNow('new')` 请求前过滤锁定项，`applyClassification()` 再过滤模型返回的 id；
   `classifyNow('all')` 把全部入口发给模型，`applyClassification(..., 'all')` 绕过 skip，
   但不清 `autoSkip`，所以之后的安全分类仍遵守锁定。自动开关的 unseen 同时排除 `autoFiled` 与 `autoSkip`。

## 边界

- 窄侧栏（宽度 < `WIDE_MIN_WIDTH`=64px）不渲染标题、不折叠：那里没有空间放 caret 和计数。
- 设置里关掉「高度兜底」后两个属性都会被移除，行为完全回到官方默认；用户随时能退回。
- 上限夹在 0–70vh；`sanitize()` 会把历史文件里缺失的字段补成默认值（guard/collapse 默认开，panelMax 45）。
- 折叠状态按组 id 保存；组被删除后残留的 id 无害，`sanitize()` 会去重并限长。
- 分组隐藏也按组 id 保存：新加入该组的入口会随组一起隐藏；删除分组时同时清掉它的隐藏标记。
- 设置页的组收起不保存：刷新页面后，隐藏组仍默认收起、可见组仍默认展开；只有眼睛的显隐状态会持久化。
- 分组成员数默认关闭；旧配置没有 `counts` 字段时 `sanitize()` 补成 `false`，不会因为升级突然多出数字。
- 删除分组不删除入口：`assign` 里的成员被清掉后，按 `order` 回到左栏暂存区，并从侧栏消失（如果还有其它已填充分组）。
- 组内顺序就是 `order` 里的相对顺序；从组里拖回左栏会保留它在 `order` 里的位置，只是不再有 `assign`，也不再显示在侧栏。
- 手动锁定是一次性的：拖进组、拖出组、组内排序、删除组都会锁定该入口；之后再点「只分未动过的」或打开自动开关都不会改它。「全部分类」是一次性覆盖：这次会把锁定项一起重新分配，但不清除锁定，下一次安全分类仍会跳过它们。
- 没有任何已填充分组时，左栏入口仍会显示在侧栏；这是为了避免新装或清空分组后侧栏变空。

## 验证

- `npm run check` 跑 `scripts/layout-smoke.mjs` 与 `scripts/names-smoke.mjs`：断言属性钩子、CSS 三条规则、
  chevron/`data-collapsed`/条件渲染，以及隐藏组默认收起、可见组默认展开；`names-smoke` 的两个自动分类
  场景分别断言：安全模式不把手动锁定项放进模型请求、也不会被返回结果重新分组；自动开关关闭时两个手动
  按钮都在，全部分类会把锁定项一起发出去、重新分配，但 `autoSkip` 保持不变，并校验 `BUILD_STAMP` 与
  `package.json` 版本一致。
- 运行时：`[data-dpc-list]` 的 `getComputedStyle(...).overflowY` 应为 `auto`，上限 45vh 时
  `maxHeight` 为 `max(120px, 45vh)`；点标题后该组按钮 `display:none`、标题仍在；设置页里隐藏组的
  `data-collapsed="true"`，且 DOM 中没有它的 `ul.dpc-treeChildren`。
