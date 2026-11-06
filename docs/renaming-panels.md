# 重命名与包名标签

侧栏入口名由插件自己注册，通常是包名或英文短名。面板管理允许把这层显示改成你熟悉的叫法，同时在行尾留一枚插件包名标签，避免过几天忘了它是谁。

## 只改显示层

宿主拥有侧栏 DOM，插件注册的 `id`、`order`、`label` 都不该被另一个插件改写。重命名因此只覆盖三处显示：

- 面板按钮的 `span.panelTitle` 文本；
- 按钮的 `aria-label`（屏幕阅读器与工具提示读它）；
- 行尾的 `span.dpc-nameTag`，内容是**插件包名**（见下一节），不是注册时的显示名。

按钮上的 `data-dpc-label` 保存原名，供引擎下一轮把自己映射回同一条注册；入口 id 和宿主数据不变。

## 包名从哪来

`sidebar.panellist` 条目只有 `id/order/label/registrant`，没有包名字段；`registrant` 是 Cordis fiber 名，运行时大多数插件共享同一个 fiber，无法拿去区分插件。包名只存在于宿主自己的模块图里，所以：

1. 客户端把当前面板 id 与桥接设置页 id 发给 Host 的 `packages` RPC；
2. Host 用 `clientModules.graph().entries` 拿到模块 id（即包名）与 `clientModules.clientPath(id)` 返回的 bundle 路径；
3. 逐个 bundle 查找槽字面量 `sidebar.panellist` / `settings.section`，并优先接受紧邻 `id:` / `key:`（或赋值）的该 id；没有注册字段时只接受距离 400 字符以内的提及，避免把注释里顺带提到的通用词当成归属；
4. 命中的模块 id 就是包名，按模块图 revision 缓存。

标签文本会去掉 scope 与 `dsh-` 前缀，再退掉 `client-ui-`：

| 模块 id | 标签 |
| --- | --- |
| `dsh-panel-control` | `panel-control` |
| `@furongjun1999/dsh-memory` | `memory` |
| `dshmarket` | `market` |
| `@deepseek-ai/dsh-client-ui-plugin-manager` | `plugin-manager` |

Host 尚未返回或确实找不到时，回退到入口 id 本身（同样去 `dsh-` 前缀），所以标签绝不会空白。

## 映射回原条目

每一轮扫描都会先读 `data-dpc-label`，没有才退回 `aria-label`：

1. 按原名唯一匹配注册项；
2. 名称重复时，如果待匹配的注册项与未匹配的按钮数量相同、且顺序上名称逐项一致，按位置匹配；
3. 仍无法判断的按钮不接管，避免把顺序写到错误的面板上。

因此改名后的行在宿主重渲染、分组重排或侧栏重挂载后仍能找回自己的注册项。图标条模式没有标题文本，只更新 `aria-label`，不显示标签。

## 配置

`prefs.json` 里新增两个字段：

```jsonc
{
  "names": { "billion-context": "上下文百科" },
  "tags": true
}
```

- `names`：入口 id → 显示名。保存时去控制字符、压空白、`trim`，最多 40 字符；最多保留 200 条。
- `tags`：是否显示包名标签，默认 `true`。关掉只影响标签，不影响已保存的名称。

设置页「侧栏布局」卡片里有「包名标签」开关；每行的铅笔按钮打开行内输入：

- `Enter` 或失焦保存；
- `Esc` 取消；
- 清空并保存即删除自定义名称，恢复注册名。

## 边界

- 只覆盖显示，不改变插件加载、入口 id 或插件自己的配置；停用本插件后宿主标题原样恢复。
- 包名识别依赖 Host 的模块图接口与 bundle 内容。接口不存在、模块读不到或代码里没有可识别的注册字面量时，标签退化为入口 id；不会影响改名本身。
- 宿主大改版若移除 `span.panelTitle` 或改写按钮结构，重命名会退化为只改 `aria-label`；找不到对应行时该行保持原样，不会报错。
- 标签 `pointer-events: none`，不参与点击与拖拽；分组下拉菜单铺了不透明底色，避免透出下面的行。

## 验证

`scripts/names-smoke.mjs` 用迷你 DOM 驱动真实引擎，覆盖改名、关标签、清空恢复、窄侧栏、重复名称映射、包名标签、未知包回退与 `dispose` 还原；`npm run check` 会运行它。
