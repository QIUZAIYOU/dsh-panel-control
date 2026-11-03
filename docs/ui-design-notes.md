# 面板管理的界面笔记

这份笔记是给"下一个插件页面"的：把 `sidebar.panellist` 管理页从"能用的表单"推到"像 DSH 自己的设置页"的过程中，真正反复踩到的几条。规则本身来自 `dsh-plugin-ui-design`（unslop 的 DSH 移植版，Damir Sokolovsky, CC BY 4.0），这里只记落地时的具体数字和坑。

## 1. 页面框架：滚动在页面层，边距在内容层

```css
.pageHost { padding: calc(28px + var(--dsh-frame-top-clearance, 0px)) 0 0;
            height: 100%; min-height: 0; display: flex; flex-direction: column; }
.pageHost .head, .pageHost .body {
  container-type: inline-size;
  padding-left:  max(max(16px, min(4vw, 48px)), 50% - 480px);
  padding-right: max(max(16px, min(4vw, 48px)), 50% - 480px);
}
```

- 正文列上限 **960px**，靠 `50% - 480px` 居中；窄窗自动退回 16px 边距。
- 滚动容器必须是页面本身，内容包裹层只负责边距——否则会出现"两块滚动条"。
- 弹窗要渲染在边距层外面，不然会被 `padding` 挤窄。
- 实测：面板区宽 1650 CSS px 时，内容列 960 居中、左右各 345，`box-sizing:border-box` 下不会溢出。

## 2. 一行优先：行能压成一行就压成一行

- 行高 **40px**（`min-height:40px; padding:6px 12px`），比 52px 的双行版本省 25% 高度，同一屏能多看两项。
- 主名与次信息同基线：`.rowText{display:flex; align-items:baseline; gap:8px}`，主名 13/500、次信息 11 mono tertiary。
- 两者都要 `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`，否则长 id 会把整行顶开。
- 页头压成三行：`标题 + 操作` / `副标题 · 计数` / `一行提示`。别让每段自己换行——那是"没设计"最快的暴露方式。
- 说明文字换行时先怀疑 `max-width:62ch` 之类的老规则：62ch ≈ 400px，在 960 的列里会把一句 60 字的话提前折断。

## 3. 输入框：让框由文字撑出来

`<input>` 的垂直居中不是靠 `height` 的，而是靠"内容盒等于行盒"：

```css
.input { height: auto; padding: 2px 8px; line-height: 18px; box-sizing: border-box;
         border: .5px solid var(--dsw-alias-border-l1, rgba(127,127,127,.12));
         border-radius: 6px; min-width: 2ch; field-sizing: content; }
```

- **不要写死 `height`**：`height:24px` + `line-height:16px` 时 Chromium 把内部行盒贴顶排，文字看起来偏下，怎么调 padding 都别扭。
- **不要给没内容的框设大 `min-width`**：三字组名被 `min-width:96px` 撑成长条，圆角比例失衡，观感就是"圆角被拉伸"。`min-width:2ch` + `field-sizing:content` 让框贴着文字，左右留白对称。
- 边框用 **0.5px 发丝线** + 透明背景；hover 才提亮到 `border-l2`，focus 提亮到 `border-l3` 并铺一层 `bg-l2`。常态有框、但没有"表单控件感"。

## 4. 两套列表，一套语言

入口行和分组行必须长得像兄弟，否则页面会裂成两个系统：

- 同一套把手（16px grip、`cursor:grab`）、同一套拖拽态：`[data-dragging]{opacity:.45}`、`[data-over]{border-color:border-l3; background:interactive-bg-hover}`。
- 同一套右缘控制区：`margin-left:auto` 把计数与操作推到行右端，列对齐靠这一点，不靠逐个 `margin`。
- 重排规则共用**同一个纯函数**（先移除、再插入到目标之前），两个列表都调它——不同列表各写一份，迟早出现"上面插到前面、下面插到后面"。
- 有了拖拽就别再留 ↑↓ 按钮：两套排序入口同时存在，用户要先猜哪个是权威，行里也白占两个 24px 命中区。

## 5. 圆角与嵌套

控件 6–10px、卡片 12–16px、面板 14–20px；**嵌套内圆角 = 外圆角 − padding**。行是 10px 卡片、卡片是 12px，行内小按钮 6px——严格套用后，深色主题下的层级会"自己"出来，不需要阴影。

## 6. 主题：只用 token，fallback 必须中性

- 全部颜色走 `--dsw-*`；fallback 只写中性灰（`rgba(127,127,127,.x)`、`#8a8a8a`），**绝不**写 `rgba(255,255,255,.x)` 或 `#1c1c1f`——写死白色透明度，浅色主题下就是"看不见的字"。
- 不写 `prefers-color-scheme` 分支：DSH 的主题由 token 决定，两套主题共用一份规则。
- 校验方式：把 `PANEL_CSS` 抽成静态页，用一套浅色 `--dsw-*` 近似值再渲染一遍，两套都读得通才算过。

## 7. 原生控件的两个坑

- `<select>` 的**选项列表由系统控件绘制**，`color-scheme` 之外基本改不动：深色主题下会弹白底 + 浅灰字 + 系统蓝高亮的一坨。要么给 `option` 显式上色并接受它的脾气，要么**自绘下拉**（button + 绝对定位的 listbox，`role="listbox"/"option"`、`aria-expanded`、点外/Esc 关闭）。本项目最终选自绘。
- `background:` 简写会**整体覆盖** `background-image`。把简写写在 `background-image` 之后就等于把自绘箭头图标删了——要写 `background-color`。

## 8. 热替换：样式表要自己收尸

插件被热替换时 `apply()` 会二次执行，旧的 `<style>` 节点没人删，于是同一页面里两份样式表互相打架（现象：行高莫名变成 97px、旧规则把新布局的 `flex-basis` 撑开）。

```js
for (const stale of document.querySelectorAll('style[data-dpc-style]')) stale.remove();
```

给自建 `<style>` 打 `data-*` 标记并在插入前清理，比依赖 `ctx.effect` 的 dispose 更可靠。

## 9. 现场验证（Windows / Electron，无 DevTools）

- 截图：`SetProcessDpiAwarenessContext(-4)` + `PrintWindow(hwnd, hdc, 2)` 才能拿到整窗位图；`CopyFromScreen` 在多屏 + 缩放会抓错。位图尺寸 = 物理像素，CSS 像素 = 位图 / 缩放系数。
- 点击：坐标 = `GetWindowRect().L + x`，窗口位置会变，**每次点之前重新截图定位**；小控件的命中点要用 4× 放大图确认，别靠猜。
- 输入：HTML5 拖拽用 `mouse_event` 按下 → 分十几步移动（每步 ~90ms）→ 抬起，一次性瞬移不会触发 `dragover`。
- 逻辑：两个零依赖的静态 harness 最省时间——`engine.html` 用假 DOM 驱动纯逻辑，`apply.html` 用假 Cordis 上下文调真实 `apply(ctx)` 并断言注册项；上一版的 `ReferenceError`（`applyInner is not defined`）就是后者抓出来的。

## 10. 同一块内容出现在两处：给组件做「变体」，不要复制

面板管理既在侧栏导航的独立页面里，也在设置弹窗的分节里。第二处一开始写成"一张卡 + 一个按钮，点它去第一处"——这是把用户当邮差：他走到设置里就是要办这件事，再让他跳走只是把两步并成三步。

做法是同一个组件加一个 `variant`：

- `variant="page"`：自带页面框架（滚动、`28px` 起头、960px 内容列、入场动画）。
- `variant="section"`：把框架全部让给宿主（`height:auto`、`overflow:visible`、`padding:0`、去掉动画），只保留内容本身的间距。
- 标题这类宿主已经画过的东西用 CSS 隐掉（`.dpc-head--section .dpc-title{display:none}`），而不是在 JS 里分叉出第二棵组件树——分叉出去的两棵树迟早会长成两个界面。

窄列（设置弹窗 ~560px）要单独收：容器查询比媒体查询合适，因为它量的是内容列而不是窗口。这里在 640px 以下依次丢掉提示行、序号、注册 id、标签，先丢"可有可无"，最后才动名称——**永远先丢副信息，不要压缩主信息**。

顺带一条：`field-sizing:content` 的输入框要有 `min-width`（这里 2ch）和左右 `padding`，否则文字会贴边、看起来像被裁掉。
