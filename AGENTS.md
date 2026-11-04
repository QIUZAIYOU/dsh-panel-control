# 本仓库的开发约束（给 agent）

这些规则来自 0.6.x 那次「一个插件让另一个插件整条消失」的排查，违反任意一条都可能让**别的插件**失效，
而不只是本插件。

## 客户端 bundle

- 同一份 `client.js` 可能在同一 document 里被求值两次（独立单包 URL + 组合批）。整份文件必须包在一个
  IIFE 里，**不要**在顶层用 `const`/`let` 声明通用名（`PAGE_LOG` 这类）；重复求值会是 parse 错误，整份脚本作废。
- 不要在 bundle 顶层做副作用（注入 `<script>`、发心跳、改 DOM、读 `localStorage` 之外的全局）。副作用只放在
  `apply()` 里，并且每个都要 try/catch。
- `ctx.slots.register / inject` 必须包 try/catch：重复注册会抛 `... already has an entry ...`，抛在
  `loader.start()` 里会**中断整轮启动**，排在后面的插件永远不会 apply。
- 不要用"同版本早退"的全局标记来防重复执行：停用会删掉工厂，重新启用必须重新注册，早退会让它装不回去。

## 宿主侧

- 不要猴补全局服务来"救自己"：我们曾在 `modules.bundleResource` 里把过期的 combo 请求换成单模块字节，
  结果是同批其它插件全部不执行。combo 请求必须原样透传 404，只有**单包** URL 才做 current-rev 兜底。
- 任何按名匹配的补丁都要按 `row.id + '/client.js'` 这类精确形态判断，不要用 `includes(包名)` 做宽匹配。

## 侧栏 DOM

- 侧栏是 React 管的。只改 `style.order`/`style.display` 和自己加的属性；不要依赖哈希类名
  （`hHd-Xa_`、`wtg9ga_` 每次构建都变）。
- 布局补丁从 `data-dpc-*` 属性出发写 CSS，`destroy()` 必须把属性清干净。

## 诊断

- 页面里的判断用 `localStorage` 落文件（`dsh.panel-control.trace`），宿主侧日志落
  `~/.dsh/panel-control/{host,client}.log`。不要靠界面提示做验收。
- 不要自动 `window.location.reload()`：会打断其他插件的批次加载。

## 发布

- `BUILD_STAMP` 与 `package.json` 的版本必须一致（`scripts/layout-smoke.mjs` 会检查）。
- 改完 `client.js` 必跑 `npm run check`；它包含 `--check` 语法、host smoke 和静态布局断言。
