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

## 边界

- 窄侧栏（宽度 < `WIDE_MIN_WIDTH`=64px）不渲染标题、不折叠：那里没有空间放 caret 和计数。
- 设置里关掉「高度兜底」后两个属性都会被移除，行为完全回到官方默认；用户随时能退回。
- 上限夹在 0–70vh；`sanitize()` 会把历史文件里缺失的字段补成默认值（guard/collapse 默认开，panelMax 45）。
- 折叠状态按组 id 保存；组被删除后残留的 id 无害，`sanitize()` 会去重并限长。

## 验证

- `npm run check` 跑 `scripts/layout-smoke.mjs`：断言属性钩子、CSS 三条规则、`BUILD_STAMP` 与
  `package.json` 版本一致。
- 运行时：`[data-dpc-list]` 的 `getComputedStyle(...).overflowY` 应为 `auto`，上限 45vh 时
  `maxHeight` 为 `max(120px, 45vh)`；点标题后该组按钮 `display:none`、标题仍在。
