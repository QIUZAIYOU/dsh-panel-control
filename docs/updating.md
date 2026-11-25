# 更新失败：root Include entry / 插件正在使用中

## 用户看到的两条报错

```
更新失败: dsh-panel-control — dsh: profile reload requires the root Include entry
更新失败: dsh-panel-control — 这个插件正在使用中，桌面端不允许现在移除
```

## 它们是什么

第一条来自宿主 `@deepseek-ai/dsh-app-boot` 的 `recompose()`。它做 profile 重载时要拿启动时登记的根 Include 条目：

```js
const entry = bootstrapIncludes.get(ctx)
if (entry === void 0) throw new Error(`${binName}: profile reload requires the root Include entry`)
```

`bootstrapIncludes` 是 `WeakMap`，只在 boot 创建根 Include（`{ id: 'include', name: 'cordis:include' }`）时按那一个 `ctx` 写入。桌面 profile 的 `cordis.yml` 是 `[]`，组合来自 `package.json` 的 `dsh.profile.bundles` 和 `cordis.patch.yml`；在桌面管理器这条路径上，重载拿不到登记项，于是抛出第一条。

重载失败后插件条目还在加载，宿主 `@deepseek-ai/dsh-plugin-manager` 的 `removeBundle` 紧接着检查到它，抛 `bundle-in-use`；市场把错误码翻成「这个插件正在使用中，桌面端不允许现在移除」。所以第二条是第一条的后果。

市场和桌面「设置 → 插件」的更新都是「先移除、再 reload、再安装」，两条报错会依次出现。换本插件的版本不会绕过它，问题不在插件包里。

## 现在怎么更新

桌面客户端（profile 由 bundles 组合）：

1. 完全退出 DSH，包括托盘里的图标。
2. 进 profile 目录执行安装。用 npm 的 profile：

   ```bash
   cd ~/.dsh/profiles/desktop
   npm install dsh-panel-control@latest
   ```

   用 pnpm 的把命令换成 `pnpm add dsh-panel-control@latest`。

3. 启动 DSH，用 `npm ls dsh-panel-control` 或「设置 → 插件」里的版本号确认。

覆盖安装是宿主允许的：`installBundle` 只在启用 HMR 时拒绝已安装的包；没有 HMR 时它照常安装，返回 `restart-required`。绕开「先移除」这一步，就不会走到重载。

profile 里是 `link:` 的开发安装时不要用市场更新：在目标仓库切换提交或版本，或者把依赖改成具体版本号再安装。

## 不要做什么

- 不要在报错后连续点「更新」。每次都会再禁用一次并重载，profile 不会变好。
- 不要手动删 `node_modules` 里的目录。profile 和 lockfile 会对不上，得再装一遍。
- 不要清 `~/.dsh/panel-control`。那只是分组、隐藏和名称配置，和更新失败无关，清掉只会丢设置。
- 不要为此重装整个 DSH。客户端版本不变，profile 里的包版本也不会变。

## 什么时候会恢复

要等 DSH 修桌面管理器的这条重载路径（根 Include 按启动时的上下文取）。截至 0.2.2-rc.3（`next` 通道），线上的 `latest` 还是 0.2.2-rc.1，没有已发布的修复版。其它组合方式的 profile 是否受影响没有实测，报错只出现在桌面组合里。

## 报给上游时带上

两条报错原文、DSH 版本、`~/.dsh/profiles/desktop/cordis.yml` 的内容（桌面默认就是 `[]`），以及 `~/.dsh/panel-control/host.log` 里同一时间段的 `dsh:` 诊断。
