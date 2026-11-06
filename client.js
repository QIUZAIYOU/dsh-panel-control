(function () {
  // This bundle is served as a classic script and the page can evaluate it twice in one document
  // (its own startup script plus the composed batch). At top level that is a "const" redeclaration,
  // which is a parse-time SyntaxError - it aborts the boot instead of just skipping a duplicate.
  // Everything below therefore lives inside this closure. Re-evaluation must stay possible: when the
  // plugin is switched off the loader drops our factory, so switching it back on re-executes this
  // script and needs the registration that follows.
  const BUILD_STAMP = 'dsh-panel-control/0.9.2';
  try { window.__dpcEvaluated = BUILD_STAMP; } catch { /* ignore */ }
/**
 * Client half of dsh-panel-control.
 *
 * Adds a manager for the sidebar's global panel navigation — the `sidebar.panellist`
 * list between the "New session" button and the workspaces region.
 *
 * The list is owned by `@deepseek-ai/dsh-client-ui-sidebar`: every row is a
 * registration another plugin made, and the sidebar renders them sorted by the
 * `order` it was registered with. No public API rewrites someone else's
 * registration, so this plugin keeps its own order/hide/group preferences and
 * applies them to the live navigation list:
 *
 *   - `order` is a flex ordering value, so rows move without touching React's
 *     children (the sidebar re-renders a row's className, never its position);
 *   - `display: none` hides a row;
 *   - group headings are our own nodes, re-created on every pass, so a React
 *     re-render can never leave a stale heading behind.
 *
 * Everything is rediscovered on each pass from `ctx.slots.entriesOfSlot(...)`
 * plus the live DOM, which keeps a plugin reload, a new registration or a
 * collapsed sidebar from leaving the list in a wrong state.
 */


/**
 * Page-level error recorder.
 *
 * Another plugin's client half can disappear while the Host still reports it
 * running: the only place that failure is visible is this page's console, and
 * the console is not persisted anywhere. This hook is installed at script
 * evaluation time (before the rest of the boot list activates) and keeps a
 * small ring of errors/warnings so a later report can carry them to the Host
 * log. It must never throw and never change control flow.
 */
const PAGE_LOG = '__dpcPageLog';
(function installPageRecorder() {
  try {
    const box = window[PAGE_LOG] || (window[PAGE_LOG] = { started: Date.now(), events: [] });
    if (box.installed) return;
    box.installed = true;
    const push = (kind, text) => {
      try {
        if (box.events.length >= 80) box.events.shift();
        box.events.push(`${kind} ${String(text).slice(0, 600)}`);
        pageBeacon(`page ${kind} ${String(text).slice(0, 500)}`);
        const all = box.events.map((line) => String(line).replace(/[\r\n]+/g, ' ')).join(' ~ ');
        pageNote(`events(${box.events.length}) ${all.slice(-3000)}`);
      } catch { /* recording is best effort */ }
    };
    const describe = (value) => {
      try {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (value.stack) return String(value.stack);
        if (value.message) return String(value.message);
        return JSON.stringify(value).slice(0, 400);
      } catch {
        return String(value);
      }
    };
    window.addEventListener('error', (event) => {
      push('error', `${(event && event.message) || 'error'} @${(event && event.filename) || ''}:${(event && event.lineno) || 0} ${describe(event && event.error)}`);
    }, true);
    window.addEventListener('unhandledrejection', (event) => {
      push('rejection', describe(event && event.reason));
    }, true);
    for (const level of ['error', 'warn']) {
      const original = console[level];
      if (typeof original !== 'function') continue;
      console[level] = function patchedConsole(...args) {
        try {
          push(`console.${level}`, args.map(describe).join(' '));
        } catch { /* never break logging */ }
        return original.apply(this, args);
      };
    }
  } catch { /* the recorder is optional */ }
})();


/**
 * Trace channel that does not depend on the Host.
 *
 * `/plugins/` is answered by another plugin's shim (dsh-unlag) before our Host
 * route runs, so a probe script cannot tell us what the page did — and the Host
 * log cannot tell us whether our module ever executed. `localStorage` is written
 * by this module itself, so reading Chromium's Local Storage LevelDB offline
 * answers it exactly:
 *
 *   top     - the bundle executed at all (a missing key means it never did)
 *   build   - the factory ran
 *   apply   - the runner called our apply
 *   ready   - our slots are registered
 *
 * `#ids=` is the boot manifest's entry count, `#ml=` says whether the module
 * loader exists, `#errs=` carries the page's last boot errors.
 */
const TRACE_KEY = 'dsh.panel-control.trace';
const PAGE_KEY = 'dsh.panel-control.page';
/** A short, always-rewritten record ("DPCPAGE|" marks it) for the offline reader. */
function pageNote(text) {
  try {
    window.localStorage.setItem(PAGE_KEY, `DPCPAGE|${String(text).slice(0, 3500)}`);
  } catch { /* storage is best effort */ }
}
/** Talk to the Host before any service exists: a GET the route answers and logs. */
function pageBeacon(text) {
  try {
    const transport = window.__DSH_TRANSPORT__;
    const base = transport && typeof transport.streamBaseUrl === 'string' ? transport.streamBaseUrl.replace(/\/+$/, '') : '';
    const url = `${base}/api/dsh-panel-control/classify?d=${encodeURIComponent(String(text).slice(0, 700))}`;
    window.fetch(url, { mode: 'no-cors', keepalive: true, cache: 'no-store' }).catch(() => {});
  } catch { /* a beacon must never break the boot */ }
}
function traceBoot(tag, silent) {
  try {
    const box = window.__dpcTrace || (window.__dpcTrace = []);
    if (!silent && box[box.length - 1] !== tag) box.push(tag);
    const bootText = window.__dpcBoot || (window.__dpcBoot = describeBoot());
    const log = window.__dpcPageLog;
    const errs = log && Array.isArray(log.events)
      ? log.events.slice(-2).map((event) => String((event && (event.detail || event.text || event.message)) || event)).join(' / ')
      : '';
    pageBeacon(`trace ${tag} :: ${box.join('>')} :: ${bootText} :: ${errs.slice(0, 200).replace(/[\r\n]+/g, ' ')}`);
    pageNote(`${box.join('>')} @${new Date().toISOString()} :: ${bootText} :: errs=${errs.slice(0, 500).replace(/[\r\n]+/g, ' ')}`);
    window.localStorage.setItem(
      TRACE_KEY,
      `${box.join('>')} @${new Date().toISOString()} #ml=${typeof window.__ModuleLoader__} #errs=${errs.replace(/[\r\n]+/g, ' ').slice(0, 400)} || ${bootText}`,
    );
  } catch { /* a trace must never break the boot */ }
}

/** What the boot handed this page. The full list goes under its own key; the
 * one-line trace only says what a person has to be told to read it right. */
function describeBoot() {
  try {
    const boot = window.__DSH_BOOT__;
    if (!boot) return 'boot=none';
    const keys = Object.keys(boot).slice(0, 20).join(',');
    const list = Array.isArray(boot.entries) ? boot.entries : (Array.isArray(boot.ids) ? boot.ids : []);
    const rows = list.map((item) => (typeof item === 'string' ? { id: item } : item || {}));
    const ids = rows.map((row) => String(row.id || '?'));
    const counts = {};
    for (const id of ids) counts[id] = (counts[id] || 0) + 1;
    const dupes = Object.entries(counts).filter(([, times]) => times > 1).map(([id, times]) => `${id}x${times}`).join(',');
    const immediate = rows.filter((row) => row.immediately === true).map((row) => String(row.id || '?'));
    const batches = Array.isArray(boot.batches) ? boot.batches.map((batch) => String((batch && batch.url) || '')) : [];
    const own = rows.find((row) => row.id === 'dsh-panel-control') || null;
    try {
      window.localStorage.setItem(
        `${TRACE_KEY}.boot`,
        JSON.stringify({ rev: boot.rev, release: boot.release, keys, n: ids.length, ids, dupes, immediate, batches, own }).slice(0, 30_000),
      );
    } catch { /* the summary below still says the part that matters */ }
    return `boot.keys=${keys} n=${ids.length} dupes=${dupes || 'none'} immediate=${immediate.join(',') || 'none'} own=${own ? `${own.id}@${own.rev || '?'}${own.immediately ? '/immediately' : ''}` : 'MISSING'}`;
  } catch (error) {
    return `boot.err=${String((error && error.message) || error).slice(0, 200)}`;
  }
}
try { traceBoot('top'); } catch { /* ignore */ }
// --- diagnostic self-reload ---------------------------------------------------
// The desktop window has no reload shortcut, so an updated bundle can only reach a
// live page when the page reloads itself once. It is capped hard: at most two
// reloads per ten minutes, and never for a revision this window already loaded.
// It exists so a fix can be tested without a person pressing the refresh button.
const SELF_RELOAD_KEY = 'dsh.panel-control.selfreload';
function ownScriptSrc() {
  try {
    const own = document.currentScript;
    if (own && typeof own.src === 'string' && own.src.includes('dsh-panel-control')) return own.src;
    const all = Array.from(document.scripts || []);
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const src = String(all[i].src || '');
      if (src.includes('dsh-panel-control/client.js')) return src;
    }
  } catch { /* ignore */ }
  return '';
}
function maybeSelfReload() {
  try {
    if (!window.__DSH_BOOT__) return;
    const src = ownScriptSrc();
    if (src === '') return;
    const now = Date.now();
    const born = Math.max(0, now - Number((window.performance && window.performance.timeOrigin) || now));
    let state = null;
    try { state = JSON.parse(localStorage.getItem(SELF_RELOAD_KEY) || 'null'); } catch { /* ignore */ }
    if (state === null || typeof state !== 'object') state = { src: '', at: [] };
    const recent = (Array.isArray(state.at) ? state.at : []).filter((t) => typeof t === 'number' && now - t < 120000);
    // One reload per two minutes, for either reason below: a reload that keeps coming back is
    // worse than a plugin that is missing, because nobody can use the window at all.
    if (recent.length > 0) return;
    // Two reasons to reload, and both end at "the page boots from one manifest again":
    //   - a newer bundle: this window is running code older than what the Host now serves;
    //   - a hot apply: this document was already up for seconds when our script arrived, which
    //     is the delta path. DSH composes that delta as a second batch, and a plugin that is
    //     also its own startup script then loads twice; the second instance re-registers the
    //     slot ids the first one filled and the whole start() aborts. A fresh document has one
    //     manifest, one instance per plugin, and none of that.
    const srcChanged = state.src !== src;
    const hotApplied = born > 4000;
    if (!srcChanged && !hotApplied) return;
    recent.push(now);
    try { localStorage.setItem(SELF_RELOAD_KEY, JSON.stringify({ src, at: recent })); } catch { /* ignore */ }
    traceBoot(hotApplied ? 'selfreload-hot' : 'selfreload-new');
    setTimeout(() => { try { window.location.reload(); } catch { /* ignore */ } }, 1200);
  } catch { /* ignore */ }
}
try { maybeSelfReload(); } catch { /* ignore */ }
// --- self-heal ---------------------------------------------------------------
// A document that boots while the plugin set is being recomposed can end up with two module
// instances of one plugin: the second apply re-registers the slot ids the first filled, throws,
// and DSH aborts the whole start() - which is why a working plugin can be missing while its
// neighbour looks fine. Nothing here can repair that page; a fresh document composes one set
// and boots clean. So: if this module ran and apply never landed, reload once. Capped at three
// tries per ten minutes, and never while the page is still loading, so a page that cannot boot
// this plugin does not turn into a reload loop.
const HEAL_KEY = 'dsh.panel-control.heal';
function scheduleHeal() {
  try {
    if (!window.__DSH_BOOT__) return;
    setTimeout(() => {
      try {
        if (window.__dpcApplied === true) return;
        if (document.readyState !== 'complete') return;
        const now = Date.now();
        let seen = [];
        try { seen = JSON.parse(localStorage.getItem(HEAL_KEY) || '[]'); } catch { /* ignore */ }
        if (!Array.isArray(seen)) seen = [];
        seen = seen.filter((t) => typeof t === 'number' && now - t < 600000);
        if (seen.length >= 3) { try { traceBoot('heal-givenup'); } catch { /* ignore */ } return; }
        seen.push(now);
        try { localStorage.setItem(HEAL_KEY, JSON.stringify(seen)); } catch { /* ignore */ }
        try { traceBoot('heal'); } catch { /* ignore */ }
        window.location.reload();
      } catch { /* ignore */ }
    }, 12000);
  } catch { /* ignore */ }
}
try { scheduleHeal(); } catch { /* ignore */ }
// Keep rewriting for half a minute: a late boot error then still lands in the file.
try {
  for (const delay of [1200, 4000, 9000, 20000, 35000]) {
    setTimeout(() => { try { traceBoot('tick', true); } catch { /* ignore */ } }, delay);
  }
} catch { /* ignore */ }

function build(require) {
  try { traceBoot('build'); } catch { /* ignore */ }
  const React = require('react');
  const h = React.createElement;

  const PACKAGE = 'dsh-panel-control';
  const NS = 'dsh-panel-control';
  const SLOT_PANELS = 'sidebar.panellist';
  const SLOT_MAIN = 'main';
  const SLOT_SETTINGS = 'settings.section';
  const PANEL_KEY = 'panel-control';
  /** Bridged pages get their own ids; the prefix also keeps them out of the host's reserved keys. */
  const BRIDGE_PREFIX = 'dpc-bridge-';
  const BRIDGE_SLOT_PREFIX = 'dpc-bridge-slot-';
  /** Between the ordinary entries and this manager's own row (order 90). */
  const BRIDGE_ORDER = 85;
  const BRIDGE_DEBOUNCE_MS = 120;
  /** Boot-time rescans: plugins register their settings page while the page starts. */
  const BRIDGE_RETRY_MS = [350, 900, 2000, 4200, 8000, 15000];
  const STORAGE_KEY = 'dsh.panel-control.v1';
  /** Host route that answers "file these entries into groups" (see index.js). */
  const RPC_CHANNEL = '/api';
  const RPC_ENDPOINT = 'dsh-panel-control/classify';
  /** Rows start at 100 so an unmanaged flex sibling stays at the very end. */
  const ORDER_START = 100;
  const ORDER_STEP = 10;
  /** Set right before a reload so the next mount can say "still missing". */
  const RELOAD_MARK = 'dsh.panel-control.reload-at';
  const NOTICE_SKIP = 'dsh.panel-control.notice-skip';
  /**
   * The gap this page already told the reader about.
   *
   * A page reload does not always fix the gap: when the app hands every page the
   * list it froze at launch, the same plugin stays absent until DSH itself
   * restarts, and a banner that reappears on every load is then pure noise. The
   * set is therefore remembered across loads (a reload keeps `localStorage`),
   * shown once, and afterwards reported only in the diagnostics list.
   */
  const NOTICE_NAGGED = 'dsh.panel-control.notice-nagged';
  // A reload hint that never expires is a lie: it outlives the mismatch it was
  // written for. Ten minutes covers a slow restart, not a whole workday.
  const RELOAD_MARK_TTL = 10 * 60 * 1000;
  /** Where unmanaged rows and the "More" launcher are pushed to. */
  const ORDER_UNMANAGED = 9000;
  /** Below this width the sidebar renders the icon rail, where headings do not fit. */
  const WIDE_MIN_WIDTH = 64;
  const ORDER_UNMANAGED_TAIL = ORDER_UNMANAGED - 500;
  const SAVE_DEBOUNCE_MS = 300;
  const AUTO_DELAY_MS = 1500;
  const AUTO_RETRY_MS = 60000;

  /* ------------------------------------------------------------------ text */

  const TEXT = {
    panelTitle: { zh: '面板管理', en: 'Panel manager' },
    subtitle: {
      zh: '排序、隐藏、分组侧栏顶部的全局面板入口。',
      en: 'Reorder, hide and group the global panel entries at the top of the sidebar.',
    },
    sortByName: { zh: '按名称排序', en: 'Sort by name' },
    reset: { zh: '恢复默认', en: 'Reset' },
    showAll: { zh: '全部显示', en: 'Show all' },
    hideIt: { zh: '隐藏', en: 'Hide' },
    showIt: { zh: '显示', en: 'Show' },
    hiddenChip: { zh: '已隐藏', en: 'hidden' },
    groupLabel: { zh: '分组', en: 'Group' },
    ungrouped: { zh: '未分组', en: 'Ungrouped' },
    groupsTitle: { zh: '分组', en: 'Groups' },
    groupsHint: {
      zh: '分组会在侧栏导航区里显示成带标题的分隔线，同一组的入口会被排在一起；这里的上下顺序就是侧栏里的顺序，拖动行可以调整。',
      en: 'A group renders as a titled separator in the sidebar and keeps its entries together. The order here is the order in the sidebar — drag a row to change it.',
    },
    newGroup: { zh: '新建分组', en: 'New group' },
    newGroupName: { zh: '新分组', en: 'New group' },
    noGroups: { zh: '还没有分组。新建一个分组，再把它分配给下面的入口。', en: 'No groups yet. Create one, then assign entries to it.' },
    groupName: { zh: '分组名称', en: 'Group name' },
    deleteGroup: { zh: '删除分组', en: 'Delete group' },
    countFmt: { zh: '{n} 个入口 · {h} 个已隐藏', en: '{n} entries · {h} hidden' },
    missingTitle: {
      zh: '这个页面用的插件清单，已经不是最新的了',
      en: 'This page is running an older plugin list',
    },
    missingBody: { zh: '刷新一次就会加载：{names}', en: 'One reload picks up: {names}' },
    refreshPage: { zh: '刷新页面', en: 'Reload the page' },
    dismiss: { zh: '不再提示', en: 'Dismiss' },
    missingMore: { zh: ' 等 {n} 个', en: ' and {n} more' },
    refreshStillMissing: {
      zh: '刷新后仍然缺：重启 DSH 才会应用新的插件清单。',
      en: 'Still missing after a reload: restart DSH to apply the new plugin list.',
    },
    diagMissingStuck: { zh: '已提示过', en: 'already reported' },
    diagYes: { zh: '是', en: 'yes' },
    diagNo: { zh: '否', en: 'no' },
    hint: {
      zh: '拖行首的把手排序；点铅笔可以改显示名，改过名的入口会在侧栏右侧显示包名。隐藏的入口仍留在列表里，随时可以放回来。',
      en: 'Drag the handle at the start of a row to reorder it; use the pencil to rename an entry, and a renamed row shows its package name on the right in the sidebar. A hidden entry stays in this list and can come back at any time.',
    },
    renameIt: { zh: '修改显示名', en: 'Rename entry' },
    dragHint: { zh: '拖动排序', en: 'Drag to reorder' },
    locked: { zh: '固定显示', en: 'always shown' },
    lockedHint: {
      zh: '这一行是本插件的入口，隐藏后仍可从“设置 → 面板管理”打开本页。',
      en: 'This row opens this page; it stays visible and can also be reached from Settings → Panel manager.',
    },
    empty: { zh: '侧栏没有检测到可管理的入口。', en: 'No manageable entries were detected in the sidebar.' },
    diagTitle: { zh: '诊断', en: 'Diagnostics' },
    diagList: { zh: '导航区容器', en: 'Navigation container' },
    diagFound: { zh: '已找到', en: 'found' },
    diagMissing: { zh: '未找到', en: 'not found' },
    diagRows: { zh: 'DOM 行数', en: 'DOM rows' },
    diagMapped: { zh: '已映射', en: 'mapped' },
    diagAt: { zh: '上次应用', en: 'last applied' },
    diagHostRev: { zh: 'Host 清单版本', en: 'host list rev' },
    diagBootRev: { zh: '页面清单版本', en: 'page list rev' },
    diagMissingIds: { zh: '本页缺失', en: 'missing on this page' },
    diagSource: { zh: '入口来源', en: 'entry source' },
    diagNone: { zh: '—', en: '—' },
    diagPrefs: { zh: '设置来源', en: 'settings source' },
    diagFile: { zh: '设置文件', en: 'settings file' },
    diagOrigin: { zh: '页面来源', en: 'page origin' },
    autoTitle: { zh: '自动分类', en: 'Auto classify' },
    layoutTitle: { zh: '侧栏布局', en: 'Sidebar layout' },
    layoutHint: {
      zh: '导航项变多时，让导航区自己收缩并滚动，下面的会话与工作区就不会被挤到看不见。兜底只作用于本页，不改官方包。',
      en: 'When the panel list grows, let it shrink and scroll so sessions and workspaces keep their height. The guard only touches this page; the official package is untouched.',
    },
    layoutGuard: { zh: '高度兜底', en: 'Height guard' },
    layoutGuardHint: { zh: '导航区超过上限后在原地滚动。', en: 'Scroll inside the list once it passes the cap.' },
    layoutCollapse: { zh: '分组可折叠', en: 'Collapsible groups' },
    layoutCollapseHint: { zh: '点分组标题收起该组，标题与数量仍保留。', en: 'Click a group title to fold it; the title and count stay.' },
    layoutMax: { zh: '高度上限', en: 'Height cap' },
    layoutMaxNone: { zh: '不限', en: 'No cap' },
    layoutBridge: { zh: '补全设置页入口', en: 'Entries for settings pages' },
    layoutBridgeHint: {
      zh: '第三方插件只做了设置页、没做侧栏入口时，替它在侧栏补一个入口。关掉后这些入口全部移除，插件自己的设置页不受影响。',
      en: 'When a third-party plugin ships a settings page but no sidebar entry, add one for it. Turning this off removes only those entries; the plugin keeps its settings page.',
    },
    bridgeBack: { zh: '返回对话', en: 'Back to conversation' },
    bridgeTag: { zh: '设置页', en: 'Settings page' },
    bridgeFrom: { zh: '来自 {p}', en: 'From {p}' },
    bridgeMissing: { zh: '这个设置页已经不可用。', en: 'This settings page is no longer available.' },
    diagBridge: { zh: '补全入口', en: 'bridged entries' },
    layoutTags: { zh: '包名标签', en: 'Package tag' },
    layoutTagsHint: {
      zh: '改过显示名的入口会在侧栏行右侧显示插件包名（省略 dsh- 前缀）；关掉后全部隐藏。',
      en: 'A renamed entry shows its plugin package name (with the dsh- prefix trimmed) in a small tag on the right of its sidebar row. Turn this off to hide them all.',
    },
    layoutCollapseAll: { zh: '全部收起', en: 'Fold all' },
    layoutExpandAll: { zh: '全部展开', en: 'Unfold all' },
    layoutCollapseOne: { zh: '点此收起', en: 'click to fold' },
    layoutExpandOne: { zh: '点此展开', en: 'click to unfold' },
    autoHint: {
      zh: '让默认模型把入口分成 2–4 组，结果保存在本机。',
      en: 'The default model files the entries into 2-4 groups; the result stays on this machine.',
    },
    autoRunning: { zh: '正在分类…', en: 'Classifying…' },
    autoAgain: { zh: '重新分类', en: 'Classify again' },
    autoDone: { zh: '模型已分成 {n} 组（{m}）。', en: 'The model filed them into {n} groups ({m}).' },
    autoFiledNew: { zh: '已把 {n} 个新入口归入分组（{m}）。', en: 'Filed {n} new entries ({m}).' },
    autoFailed: { zh: '分类失败：{m}', en: 'Classification failed: {m}' },
    autoTimeout: { zh: '模型这次超时了，稍后再试一次。', en: 'The model timed out; try again in a moment.' },
    autoModelFailed: { zh: '模型调用失败，稍后再试一次。', en: 'The model call failed; try again in a moment.' },
    autoUnparsable: { zh: '模型这次的回答不能用，再试一次。', en: 'The model answered with something unusable; try again.' },
    autoUnavailable: {
      zh: '这一版客户端拿不到宿主的连接服务，无法调用模型。',
      en: 'This Client build does not expose the Host connection, so the model cannot be called.',
    },
    autoEmpty: { zh: '没有可分类的入口。', en: 'There is nothing to classify.' },
  };

  let ctxRef = null;
  let engineRef = null;

  /**
   * Cordis throws when a service is read without being declared in inject().
   * Everything optional therefore goes through this accessor instead.
   */
  function optionalService(ctx, name) {
    if (!ctx) return undefined;
    try {
      if (typeof ctx.get === 'function') {
        const value = ctx.get(name);
        if (value) return value;
      }
    } catch {
      /* not injected here */
    }
    try {
      return ctx[name];
    } catch {
      return undefined;
    }
  }

  /** The live UI language, read from the Client locale service at call time. */
  function activeLang() {
    try {
      const service = optionalService(ctxRef, 'locale');
      const snapshot = service && typeof service.getLocale === 'function' ? service.getLocale() : null;
      const id = snapshot && typeof snapshot.active === 'string' ? snapshot.active : '';
      if (id) return /^zh/i.test(id) ? 'zh' : 'en';
    } catch {
      /* fall through to the browser language */
    }
    const nav = typeof navigator === 'object' && navigator ? navigator.language : '';
    return /^zh/i.test(String(nav || '')) ? 'zh' : 'en';
  }

  const pick = (entry) => {
    if (!entry) return undefined;
    const language = activeLang();
    return entry[language] || entry.en || entry.zh;
  };
  const t = (key) => pick(TEXT[key]) || key;
  const fill = (text, values) =>
    String(text).replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));

  function flatten(language) {
    const dictionary = {};
    // A key that has not been translated yet falls back rather than rendering
    // "undefined" into a label.
    for (const [key, value] of Object.entries(TEXT)) dictionary[key] = value[language] || value.en || value.zh;
    return dictionary;
  }

  /* ---------------------------------------------------------------- prefs */

  const emptyPrefs = () => ({
    version: 2,
    order: [],
    hidden: [],
    groups: [],
    assign: {},
    auto: false,
    autoFiled: [],
    collapsed: [],
    guard: true,
    collapse: true,
    bridge: true,
    names: {},
    tags: true,
    panelMax: 45,
  });

  /**
   * What a stored file may contain.
   *
   * The Host accepts a 256KB file, which is enough for thousands of sections and
   * hundreds of thousands of assignments if nothing trims them; every apply
   * would then build that many separators. The numbers here are far above any
   * real sidebar and turn a hostile or corrupted store into a cheap no-op.
   */
  const LIMITS = { order: 200, hidden: 200, autoFiled: 400, collapsed: 200, groups: 24, assign: 400, names: 200, name: 40, key: 120 };

  /** Trim, flatten and cap a user-visible name. Returns '' when it is unusable. */
  function cleanName(value) {
    if (typeof value !== 'string') return '';
    return value
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, LIMITS.name);
  }

  /** Dedupe, drop anything that is not a usable id, and stop at `cap`. */
  function uniqueIds(raw, cap) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    const seen = new Set();
    for (const id of raw) {
      if (typeof id !== 'string' || id === '' || id.length > LIMITS.key || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= cap) break;
    }
    return out;
  }

  /** Keep only the shapes this plugin writes, so a hand-edited store cannot crash it. */
  function sanitize(raw) {
    const out = emptyPrefs();
    if (!raw || typeof raw !== 'object') return out;
    out.order = uniqueIds(raw.order, LIMITS.order);
    out.autoFiled = uniqueIds(raw.autoFiled, LIMITS.autoFiled);
    out.hidden = uniqueIds(raw.hidden, LIMITS.hidden);
    out.collapsed = uniqueIds(raw.collapsed, LIMITS.collapsed);
    // Files written before the layout guard existed must come back with the
    // guard on: the whole point is that an old sidebar keeps working. An
    // explicit false is the only way to turn the CSS off.
    out.guard = raw.guard !== false;
    out.collapse = raw.collapse !== false;
    // Missing in files written before the bridge existed: those installs get the
    // feature by default, exactly like a fresh one.
    out.bridge = raw.bridge !== false;
    const cap = Math.round(Number(raw.panelMax));
    out.panelMax = Number.isFinite(cap) ? Math.min(70, Math.max(0, cap)) : 45;
    if (Array.isArray(raw.groups)) {
      const seen = new Set();
      for (const group of raw.groups) {
        if (out.groups.length >= LIMITS.groups) break;
        if (!group || typeof group.id !== 'string' || group.id === '' || group.id.length > LIMITS.key) continue;
        if (seen.has(group.id)) continue;
        seen.add(group.id);
        const name = typeof group.name === 'string' ? group.name.trim().slice(0, LIMITS.name) : '';
        out.groups.push({ id: group.id, name: name || '—' });
      }
    }
    if (raw.assign && typeof raw.assign === 'object') {
      let kept = 0;
      for (const [panelId, groupId] of Object.entries(raw.assign)) {
        if (kept >= LIMITS.assign) break;
        if (typeof panelId !== 'string' || panelId === '' || panelId.length > LIMITS.key) continue;
        if (typeof groupId !== 'string' || groupId === '' || groupId.length > LIMITS.key) continue;
        out.assign[panelId] = groupId;
        kept += 1;
      }
    }
    if (raw.names && typeof raw.names === 'object') {
      let kept = 0;
      for (const [panelId, value] of Object.entries(raw.names)) {
        if (kept >= LIMITS.names) break;
        if (typeof panelId !== 'string' || panelId === '' || panelId.length > LIMITS.key) continue;
        const name = cleanName(value);
        if (!name) continue;
        out.names[panelId] = name;
        kept += 1;
      }
    }
    // Renames are opt-in per entry, so a missing field means "no custom names".
    // The tag switch is the opposite: old files never had it and must get it on.
    out.tags = raw.tags !== false;
    out.auto = raw.auto === true;
    return out;
  }

  function readLocalPrefs() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function writeLocalPrefs(prefs) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode or a full quota: the Host copy below is the real store */
    }
  }

  const hasContent = (prefs) =>
    Boolean(prefs) &&
    ((prefs.order || []).length > 0 ||
      (prefs.hidden || []).length > 0 ||
      (prefs.groups || []).length > 0 ||
      (prefs.collapsed || []).length > 0 ||
      (prefs.autoFiled || []).length > 0 ||
      prefs.auto === true ||
      // A file that only turned a switch off is still a file the reader edited;
      // without this, the next load treats it as empty and drops the edit.
      prefs.guard === false ||
      prefs.collapse === false ||
      prefs.bridge === false ||
      prefs.tags === false ||
      Object.keys(prefs.names || {}).length > 0 ||
      (typeof prefs.panelMax === 'number' && prefs.panelMax !== 45));

  /** One call to the Host half, or null when this Client cannot reach it. */
  async function hostCall(method, payload) {
    const rpc = getRpc();
    if (!rpc) return null;
    try {
      const result = await rpc.call(RPC_CHANNEL, RPC_ENDPOINT, { method, payload });
      if (!result || result.ok !== true) return null;
      return result.value;
    } catch {
      return null;
    }
  }

  /**
   * Is this page running the plugin list the Host is serving right now?
   *
   * A page keeps the boot manifest it was handed at load time. The Host keeps
   * composing a new graph whenever a plugin is added, removed or rebuilt, so the
   * two revisions drift apart and the page quietly runs without the newer
   * plugins. The Host exposes its current revision; comparing it costs one call
   * and needs nothing from any other plugin.
   */
  let inventoryAt = 0;

  async function checkInventory() {
    // Called on load and on every window focus: keep it cheap.
    if (inventoryAt > 0 && Date.now() - inventoryAt < 5000) return;
    inventoryAt = Date.now();
    const boot = bootSnapshot();
    if (!boot) {
      setState({ inventory: { status: 'unsupported', stale: false, missing: [], at: Date.now() } });
      return;
    }
    const value = await hostCall('inventory', {});
    const rev = value && typeof value.rev === 'string' ? value.rev : '';
    const hostIds = value && Array.isArray(value.ids) ? value.ids : null;
    if (!rev || !hostIds) {
      setState({ inventory: { status: 'unavailable', stale: false, missing: [], at: Date.now() } });
      return;
    }
    const missing = hostIds.filter((id) => !boot.ids.has(id));
    // Only a real gap is worth a banner. A revision that merely differs proves
    // nothing: the Host rebuilds that graph whenever any plugin file changes, so
    // comparing revisions nagged people whose page was missing nothing at all.
    // The two revisions still land in the diagnostics list for the curious.
    const gap = missing.join(',');
    // Already said on an earlier load and a reload did not help: keep quiet, the
    // diagnostics still list it.
    const repeated = gap.length > 0 && readNagged() === gap;
    const stale = missing.length > 0 && !repeated;
    if (stale) rememberNagged(gap);
    else if (!missing.length) rememberNagged('');
    if (!stale) forgetReloadMark();
    setState({
      inventory: { status: 'done', stale, repeated, missing, rev, bootRev: boot.rev, at: Date.now() },
    });
  }

  /**
   * Settings live in a Host file, not only in `localStorage`.
   *
   * The renderer is served from the Host's loopback address, and that port
   * changes on every launch: `localStorage` is therefore a per-launch scratch
   * area, and settings kept only there look like "the order resets itself".
   * The browser copy stays as a cache and as the thing the harness drives.
   */
  const prefsSource = { value: 'local' };

  let saveTimer = null;

  function scheduleSaveToHost() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void hostCall('save', { prefs: store.state.prefs });
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Prove from the Host side that this half executed at all.
   *
   * The API route can refuse the page (403) and every `hostCall` then returns
   * null in silence, so "ran but muted" is indistinguishable from "never ran".
   * A throwaway bundle request rides the same channel the real bundles use, and
   * the Host logs every bundle it is asked for, refusals included.
   */
    function reportHost(detail) {
    void hostCall('report', { ...detail, href: String(locationMode()), at: Date.now() });
  }

  let pageLogSent = 0;

  /** Ship the page's recent errors/warnings to the Host log, once per change. */
  function dumpPageLog(tag) {
    try {
      const box = window[PAGE_LOG];
      if (!box || !Array.isArray(box.events) || box.events.length === 0) return;
      if (box.events.length === pageLogSent) return;
      pageLogSent = box.events.length;
      reportHost({ kind: 'page-log', tag, total: box.events.length, events: box.events.slice(-40) });
    } catch { /* a dump must never break apply */ }
  }
  /** Every /plugins/ script this page asked for, with the status the browser saw.
   * A plugin that never registered is either a request that failed or a module
   * that failed after arriving; the two need different fixes, so log both. */
  let slotsSent = '';

  function dumpNet(tag) {
    try {
      const list = typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
        ? performance.getEntriesByType('resource')
        : [];
      const rows = list
        .filter((row) => String(row.name || '').includes('/plugins/'))
        .slice(-60)
        .map((row) => {
          const url = String(row.name || '').replace(/^[a-z]+:\/\/[^/]+/i, '');
          const status = row.responseStatus === undefined ? '?' : row.responseStatus;
          return `${status}|${Math.round(row.transferSize || 0)}|${Math.round(row.duration || 0)}ms|${url.slice(0, 130)}`;
        });
      if (rows.length === 0) return;
      reportHost({ kind: 'net', tag, scripts: rows });
    } catch { /* diagnostics only */ }
  }

  /** Which plugins the panel slot holds right now, and every time that changes. */
  function dumpSlots(slots, tag) {
    try {
      if (!slots || typeof slots.entriesOfSlot !== 'function') return;
      const ids = slots.entriesOfSlot('sidebar.panellist')
        .map((entry) => String((entry && entry.options && entry.options.id) || ''))
        .join(',');
      if (tag !== 'change' && ids === slotsSent) return;
      slotsSent = ids;
      reportHost({ kind: 'slots', tag, ids });
    } catch { /* diagnostics only */ }
  }

  /** `location.href` minus any query, so one line says which origin we ran on. */
  function locationMode() {
    try {
      return window.location && window.location.origin ? window.location.origin : 'unknown-origin';
    } catch {
      return 'unknown-origin';
    }
  }

  /** The boot manifest this page was handed: its plugin ids and its revision. */
  function bootSnapshot() {
    try {
      const boot = window.__DSH_BOOT__;
      if (!boot || typeof boot.rev !== 'string' || !Array.isArray(boot.entries)) return null;
      const ids = new Set(boot.entries.map((entry) => (entry && typeof entry.id === 'string' ? entry.id : '')).filter(Boolean));
      return { rev: boot.rev, ids };
    } catch {
      return null;
    }
  }

  /**
   * A reload is the only way to pick up plugin scripts this page never asked
   * for: the boot list is frozen per load. Everything here is plain web API, so
   * the plugin can heal itself without another plugin's help.
   *
   * `reload()` keeps the current URL, which is what the Host expects. A cache
   * can still answer an older document, so a refusal or an exception falls back
   * to a fresh navigation carrying a one-off query — the Host's boot injection
   * does not read the query, but the browser cannot serve that one from cache.
   */
  function reloadPage() {
    try {
      const missing = (store.state.inventory && store.state.inventory.missing) || [];
      window.sessionStorage.setItem(RELOAD_MARK, JSON.stringify({ at: Date.now(), ids: missing }));
    } catch {
      /* private mode: the mark is a nicety, not a requirement */
    }
    try {
      window.location.reload();
      return true;
    } catch {
      /* fall through to a fresh navigation */
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('dpc', String(Date.now()));
      window.location.assign(url.toString());
      return true;
    } catch {
      return false;
    }
  }

  /** `{at, ids}` for a reload this page made recently, otherwise null. */
  function readReloadMark() {
    try {
      const raw = window.sessionStorage.getItem(RELOAD_MARK);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const at = Number(parsed && parsed.at);
      if (!Number.isFinite(at) || at <= 0) return null;
      if (Date.now() - at > RELOAD_MARK_TTL) {
        window.sessionStorage.removeItem(RELOAD_MARK);
        return null;
      }
      return { at, ids: Array.isArray(parsed.ids) ? parsed.ids.map(String) : [] };
    } catch {
      return null;
    }
  }

  function forgetReloadMark() {
    try {
      window.sessionStorage.removeItem(RELOAD_MARK);
      window.sessionStorage.removeItem(NOTICE_SKIP);
    } catch {
      /* private mode: nothing to forget */
    }
  }

  /** ids the reader asked this page not to be nagged about. */
  function readSkip() {
    try {
      return window.sessionStorage.getItem(NOTICE_SKIP) || '';
    } catch {
      return '';
    }
  }

  function skipNotice(missing) {
    try {
      window.sessionStorage.setItem(NOTICE_SKIP, missing.join(','));
    } catch {
      /* private mode: the banner simply stays */
    }
  }

  /** The gap this profile was nagged about on an earlier page load. */
  function readNagged() {
    try {
      return window.localStorage.getItem(NOTICE_NAGGED) || '';
    } catch {
      return '';
    }
  }

  function rememberNagged(ids) {
    try {
      if (ids) window.localStorage.setItem(NOTICE_NAGGED, ids);
      else window.localStorage.removeItem(NOTICE_NAGGED);
    } catch {
      /* private mode: the banner comes back, which is acceptable */
    }
  }

  const store = {
    state: {
      prefs: readLocalPrefs() || emptyPrefs(),
      entries: [],
      autoState: { status: 'idle', message: '', groups: 0 },
      diag: { prefsSource: 'local', href: 'unknown-origin', hostFile: '' },
      inventory: { status: 'idle', stale: false, missing: [], at: 0 },
    },
    listeners: new Set(),
  };

  function emit() {
    for (const listener of Array.from(store.listeners)) {
      try {
        listener();
      } catch {
        /* one broken subscriber must not stop the rest */
      }
    }
  }

  function setState(patch) {
    store.state = { ...store.state, ...patch };
    emit();
  }

  function useStore() {
    const [, force] = React.useState(0);
    React.useEffect(() => {
      const listener = () => force((value) => value + 1);
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    }, []);
    return store.state;
  }

  /* -------------------------------------------------------------- entries */

  /** A slot label is a string or a function returning the localized string. */
  function resolveLabel(label, fallback) {
    try {
      if (typeof label === 'function') {
        const value = label();
        if (typeof value === 'string' && value.trim() !== '') return value;
      } else if (typeof label === 'string' && label.trim() !== '') {
        return label;
      }
    } catch {
      /* a label that throws is reported by its id instead */
    }
    return fallback;
  }

  /** The user's own name for an entry, or '' when it was never renamed. */
  function customName(prefs, id) {
    const names = prefs && prefs.names;
    if (!names || typeof names !== 'object') return '';
    const value = names[id];
    return typeof value === 'string' ? cleanName(value) : '';
  }

  /** What the sidebar and the manager row should show for this entry. */
  function displayName(prefs, id, fallback) {
    return customName(prefs, id) || fallback;
  }

  /**
   * A package name shortened into a tag: scope gone, `dsh-` gone, `client-ui-`
   * gone. `dsh-panel-control` and `dshmarket` both read as their product name.
   */
  function packageLabel(name) {
    if (typeof name !== 'string') return '';
    return name
      .replace(/^@[^/]+\//, '')
      .replace(/^dsh-?/, '')
      .replace(/^client-ui-/, '')
      .trim();
  }

  /**
   * The sidebar's own list: every registered entry, sorted exactly the way the
   * sidebar sorts it (`order`, then registration order).
   */
  function readEntries(slots) {
    try {
      const raw = slots && typeof slots.entriesOfSlot === 'function' ? slots.entriesOfSlot(SLOT_PANELS) || [] : [];
      const rows = raw
        .map((entry, index) => {
          const options = (entry && entry.options) || {};
          const id = typeof options.id === 'string' ? options.id : '';
          return {
            id,
            index,
            order: typeof options.order === 'number' ? options.order : 0,
            label: resolveLabel(options.label, id),
          };
        })
        .filter((row) => row.id !== '');
      rows.sort((left, right) => left.order - right.order || left.index - right.index);
      return rows.map((row) => ({ id: row.id, label: row.label, order: row.order }));
    } catch {
      return [];
    }
  }

  const sameEntries = (left, right) =>
    left.length === right.length &&
    left.every((row, index) => row.id === right[index].id && row.label === right[index].label);

  /* -------------------------------------------------------------- bridges */

  /**
   * Settings pages with no panel of their own.
   *
   * A Client plugin addresses its settings page with `settings.section`; the
   * sidebar only lists `sidebar.panellist` entries, and the two registries are
   * unrelated. A plugin that never registers a panel therefore has a reachable
   * settings page and no way to open it from the navigation rail. This block
   * gives each such page a panel of its own: a panellist row plus the `main`
   * entry it addresses, whose body is the host's own renderer for that section.
   *
   * A slot entry's `registrant` names the Cordis fiber that registered it, but
   * the client runner applies many plugins inside one fiber: in practice every
   * plugin except the market reports the same name, so a registrant match cannot
   * tell one plugin from another. Attribution is therefore by ownership of the
   * navigation row: a settings id whose base name (with a trailing `-settings`
   * removed) is an existing panel id, or whose label is an existing panel label,
   * belongs to a plugin that already has a way in. Core settings ids are listed
   * explicitly; they ship without a panel because that is the product decision,
   * not a gap.
   */
  const CORE_SECTION_IDS = new Set(['account', 'general', 'models', 'agent-presets', 'plugins']);

  const bridgeState = {
    entries: new Map(),
    labels: new Map(),
    timer: null,
    retries: new Set(),
    retriesStarted: false,
    syncing: false,
    scans: 0,
    unsub: null,
  };

  /**
   * Panel/section id -> the package that registers it.
   *
   * The slot entry has no package field and its `registrant` is shared by most
   * plugins, so the Host resolves ownership from its module graph. The map stays
   * empty until that answer arrives; the tag falls back to the id meanwhile.
   */
  const packageState = {
    map: Object.create(null),
    loading: false,
    key: '',
    pending: '',
  };

  function packageTagFor(id) {
    // No fallback to the row id: a bridge row's id is `dpc-bridge-*` and an
    // unresolved panel id is not a package name. An empty tag is better than
    // a second, wrong spelling of the same plugin.
    return packageLabel(packageState.map[id]);
  }

  /**
   * Ask the Host which package each visible row belongs to.
   *
   * Scans are de-duplicated by the exact id set, so the engine's many passes and
   * every bridge re-sync cost one call per set rather than one per pass.
   */
  async function ensurePackages(force) {
    const records = [];
    const seen = new Set();
    const add = (id, slot) => {
      if (typeof id !== 'string' || id === '' || seen.has(slot + ':' + id)) return;
      seen.add(slot + ':' + id);
      records.push({ id, slot });
    };
    for (const entry of store.state.entries) {
      if (entry.id.startsWith(BRIDGE_PREFIX)) continue;
      add(entry.id, SLOT_PANELS);
    }
    for (const record of bridgeState.entries.values()) {
      if (record && typeof record.sectionId === 'string') add(record.sectionId, SLOT_SETTINGS);
    }
    if (records.length === 0) return;
    records.sort((left, right) => (left.slot + ':' + left.id).localeCompare(right.slot + ':' + right.id));
    const key = records.map((row) => row.slot + ':' + row.id).join('|');
    if (!force && key === packageState.key) return;
    if (packageState.loading) {
      packageState.pending = key;
      return;
    }
    packageState.key = key;
    packageState.loading = true;
    try {
      const value = await hostCall('packages', { ids: records });
      const packages = value && value.packages;
      if (!packages || typeof packages !== 'object') return;
      let changed = false;
      for (const [id, pkg] of Object.entries(packages)) {
        if (typeof pkg !== 'string' || pkg === '') continue;
        if (packageState.map[id] === pkg) continue;
        packageState.map[id] = pkg;
        changed = true;
      }
      // A bridge row's own id is synthetic; its package is the section's.
      for (const [bridgeId, record] of bridgeState.entries) {
        const pkg = record && packageState.map[record.sectionId];
        if (pkg && packageState.map[bridgeId] !== pkg) {
          packageState.map[bridgeId] = pkg;
          changed = true;
        }
      }
      if (changed && engineRef) engineRef.schedule();
    } finally {
      packageState.loading = false;
      const next = packageState.pending;
      packageState.pending = '';
      if (next && next !== packageState.key) void ensurePackages();
    }
  }

  function registrantOf(entry) {
    const options = (entry && entry.options) || {};
    const value = (entry && entry.registrant) || options.registrant;
    return typeof value === 'string' ? value : '';
  }

  function readSections(slots) {
    try {
      const raw = slots && typeof slots.entriesOfSlot === 'function' ? slots.entriesOfSlot(SLOT_SETTINGS) || [] : [];
      return raw
        .map((entry) => {
          const options = (entry && entry.options) || {};
          return {
            id: typeof options.id === 'string' ? options.id : '',
            label: options.label,
            registrant: registrantOf(entry),
            component: entry && entry.component,
            inject: options.inject,
            store: options.store,
            locale: options.locale,
          };
        })
        .filter((section) => section.id !== '');
    } catch {
      return [];
    }
  }

  function panelEntries(slots) {
    try {
      return (slots && typeof slots.entriesOfSlot === 'function' ? slots.entriesOfSlot(SLOT_PANELS) || [] : [])
        .map((entry) => entry && entry.options)
        .filter((options) => options && typeof options.id === 'string' && options.id !== '')
        .map((options) => ({ id: options.id, label: resolveLabel(options.label, options.id) }));
    } catch {
      return [];
    }
  }

  function sectionBase(id) {
    return id.endsWith('-settings') ? id.slice(0, -'-settings'.length) : id;
  }

  /**
   * Every settings page whose plugin owns no sidebar entry.
   *
   * A plugin may expose more than one settings page; each becomes its own row,
   * labelled with the plugin's own section label. A label already used by a real
   * panel is suffixed with the settings id so two rows never read the same.
   */
  function bridgeCandidates(slots) {
    const rows = panelEntries(slots).filter((row) => !row.id.startsWith(BRIDGE_PREFIX));
    const panelIds = new Set(rows.map((row) => row.id));
    const panelLabels = new Set(rows.map((row) => row.label));
    // Real panel labels own their names; a bridged row must not steal one, and
    // must not collide with another bridged row either.
    const used = new Set(panelLabels);
    const out = [];
    const taken = new Set();
    for (const section of readSections(slots)) {
      if (CORE_SECTION_IDS.has(section.id)) continue;
      const base = sectionBase(section.id);
      let owned = panelIds.has(section.id) || panelIds.has(base);
      if (!owned) {
        for (const panelId of panelIds) {
          if (panelId.endsWith('-' + base)) {
            owned = true;
            break;
          }
        }
      }
      if (owned) continue;
      const label = resolveLabel(section.label, section.id);
      if (panelLabels.has(label)) continue;
      if (typeof section.component !== 'function') continue;
      const bridgeId = BRIDGE_PREFIX + section.id;
      if (bridgeId.length > LIMITS.key || taken.has(bridgeId)) continue;
      taken.add(bridgeId);
      const chosen = used.has(label) ? `${label} · ${section.id}` : label;
      used.add(chosen);
      out.push({
        bridgeId,
        sectionId: section.id,
        label: chosen,
        component: section.component,
        inject: section.inject,
        store: section.store,
        locale: section.locale,
      });
    }
    return out;
  }

  /** The layout's live selection, read through the public store when it exposes one. */
  function activePanelId() {
    try {
      const layout = optionalService(ctxRef, 'layout');
      const info = layout && layout.panelInfo;
      const snapshot = info && typeof info.getSnapshot === 'function' ? info.getSnapshot() : info;
      return snapshot && typeof snapshot.activePanelId === 'string' ? snapshot.activePanelId : null;
    } catch {
      return null;
    }
  }

  function disposeBridge(id, record) {
    bridgeState.entries.delete(id);
    for (const dispose of record.disposers.slice().reverse()) {
      try {
        dispose();
      } catch (error) {
        console.warn(`[${PACKAGE}] bridge cleanup failed for "${id}"`, error);
      }
    }
    // The main key this row addressed is gone, so a reader sitting on it would
    // stare at an empty centre column. The Conversation is the only safe landing.
    if (activePanelId() === id) {
      try {
        const layout = optionalService(ctxRef, 'layout');
        if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null);
      } catch {
        /* nothing was selected after all */
      }
    }
  }

  function syncBridges() {
    const slots = ctxRef && ctxRef.slots;
    if (!slots || typeof slots.register !== 'function' || bridgeState.syncing) return;
    bridgeState.syncing = true;
    bridgeState.scans += 1;
    let changed = false;
    try {
      const enabled = prefsNow().bridge !== false;
      watchSettings();
      const sections = readSections(slots);
      const panelIds = panelEntries(slots).map((row) => row.id);
      const candidates = enabled ? bridgeCandidates(slots) : [];
      const desired = new Set(candidates.map((candidate) => candidate.bridgeId));
      bridgeState.labels = new Map(candidates.map((candidate) => [candidate.bridgeId, candidate.label]));
      for (const [id, record] of Array.from(bridgeState.entries)) {
        if (desired.has(id)) continue;
        disposeBridge(id, record);
        changed = true;
      }
      for (const candidate of candidates) {
        if (bridgeState.entries.has(candidate.bridgeId)) continue;
        const slotName = BRIDGE_SLOT_PREFIX + candidate.sectionId;
        const record = { sectionId: candidate.sectionId, disposers: [] };
        try {
          record.disposers.push(
            slots.register(
              {
                name: SLOT_MAIN,
                key: candidate.bridgeId,
                locale: NS,
                children: { [slotName]: { kind: 'single', scope: 'root' } },
              },
              makeBridgePanel(candidate, slotName),
            ),
          );
          // The settings shell owns the `settings.section` declaration, so its
          // props-face renderer is not ours to call. Declaring one child slot of
          // our own and re-registering the same component into it gives the
          // section the host kit it expects (inject, locale, store, boundary)
          // without touching the shell or the foreign registration.
          record.disposers.push(
            slots.register(
              {
                name: slotName,
                inject: candidate.inject,
                store: candidate.store,
                locale: candidate.locale,
              },
              candidate.component,
            ),
          );
          record.disposers.push(
            slots.register(
              {
                name: SLOT_PANELS,
                id: candidate.bridgeId,
                order: BRIDGE_ORDER,
                locale: NS,
                label: () => bridgeState.labels.get(candidate.bridgeId) || candidate.label,
              },
              BridgeIcon,
            ),
          );
          bridgeState.entries.set(candidate.bridgeId, record);
          changed = true;
        } catch (error) {
          for (const dispose of record.disposers.slice().reverse()) {
            try {
              dispose();
            } catch {
              /* the pair is already half gone */
            }
          }
          console.warn(`[${PACKAGE}] could not add a panel for "${candidate.sectionId}"`, error);
        }
      }
      // Early scans run while plugins are still registering. Keeping a trace of
      // exactly what the slot returned tells a later reader whether a missing
      // row is a timing problem or an ownership guess that did not hold.
      if (bridgeState.scans <= 8 || changed) {
        reportHost({
          kind: 'bridge-scan',
          enabled,
          scans: bridgeState.scans,
          sections: sections.map((section) => `${section.id}:${section.registrant || '?'}`).join('|'),
          panels: panelIds.join('|'),
          ids: Array.from(bridgeState.entries.keys()).join(','),
        });
      }
      if (changed) {
        reportHost({
          kind: 'bridge',
          enabled,
          ids: Array.from(bridgeState.entries.keys()).join(','),
          sections: candidates.length,
        });
        // The diagnostics line in the settings card reads this count; without a
        // re-render it would keep showing the value from before the sync.
        emit();
      }
      // New bridge rows (or a first scan that finally sees the real rows) need
      // their package names; the call is keyed, so repeated scans are free.
      void ensurePackages();
    } catch (error) {
      console.warn(`[${PACKAGE}] bridge sync failed`, error);
    } finally {
      bridgeState.syncing = false;
    }
  }

  function scheduleBridgeSync() {
    if (bridgeState.timer) clearTimeout(bridgeState.timer);
    bridgeState.timer = setTimeout(() => {
      bridgeState.timer = null;
      syncBridges();
    }, BRIDGE_DEBOUNCE_MS);
  }

  /**
   * Watch the section registry.
   *
   * `subscribe` is trustworthy only once the slot is declared. The plugin runs
   * before some of the plugins it bridges, so an early subscription can resolve
   * to nothing and never be retried; the declaration callback calls this again.
   */
  function watchSettings() {
    if (bridgeState.unsub) return;
    const slots = ctxRef && ctxRef.slots;
    if (!slots || typeof slots.subscribe !== 'function') return;
    try {
      const dispose = slots.subscribe(SLOT_SETTINGS, () => scheduleBridgeSync());
      bridgeState.unsub = typeof dispose === 'function' ? dispose : () => {};
    } catch {
      /* not declared yet; the next scan or declaration retries */
    }
  }

  function unwatchSettings() {
    if (!bridgeState.unsub) return;
    try {
      bridgeState.unsub();
    } catch {
      /* the slot is already gone */
    }
    bridgeState.unsub = null;
  }

  function scheduleBridgeRetry(delay) {
    const id = setTimeout(() => {
      bridgeState.retries.delete(id);
      if (ctxRef) syncBridges();
    }, delay);
    // Browsers return a number; Node returns an object. Letting the harness
    // exit without waiting out the last boot scan keeps `npm run check` quick.
    if (id && typeof id.unref === 'function') id.unref();
    bridgeState.retries.add(id);
  }

  function scheduleBridgeRetries() {
    if (bridgeState.retriesStarted) return;
    bridgeState.retriesStarted = true;
    for (const delay of BRIDGE_RETRY_MS) scheduleBridgeRetry(delay);
  }

  function disposeBridges() {
    if (bridgeState.timer) {
      clearTimeout(bridgeState.timer);
      bridgeState.timer = null;
    }
    for (const id of Array.from(bridgeState.retries)) clearTimeout(id);
    bridgeState.retries.clear();
    unwatchSettings();
    for (const [id, record] of Array.from(bridgeState.entries)) disposeBridge(id, record);
  }

  /** The stored order, extended with every entry that is new since it was saved. */
  function normalize(prefs, entries) {
    const known = new Set(entries.map((entry) => entry.id));
    const order = [];
    const seen = new Set();
    for (const id of prefs.order || []) {
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      order.push(entry.id);
    }
    return order;
  }



  /* --------------------------------------------------------- DOM adapter */

  function cssEscape(value) {
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    } catch {
      /* the selector fallback below tolerates a plain value */
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  /**
   * Apply the stored layout to the live navigation list.
   *
   * One pass = read the entries, find the list, map entry -> row button, then
   * write `order` / `display` and re-create the group headings. It is cheap
   * enough to run on every sidebar re-render, and it is a no-op when nothing
   * about the plan changed.
   */
  /**
   * Entry -> row button.
   *
   * A row button carries no id of its own, so the accessible label is the only
   * real key. Position alone is not safe: as soon as a plugin inserts a row, or
   * one row disappears (disabled, filtered, still loading), every position after
   * it shifts by one and a positional fallback would hand row N to entry N+1 --
   * hiding the wrong row. So: match by unique label first, and only fall back to
   * position when the two leftover lists agree label for label. Anything still
   * unmatched is left unmanaged rather than guessed at.
   */
  function mapButtons(entries, buttons) {
    const map = new Map();
    const used = new Set();
    const byLabel = new Map();
    for (const button of buttons) {
      // A renamed row keeps its original label in `data-dpc-label`: the visible
      // text and aria-label change, but the entry it belongs to does not.
      const label = button.getAttribute('data-dpc-label') || button.getAttribute('aria-label') || '';
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push(button);
    }
    const loose = [];
    for (const entry of entries) {
      const hit = (byLabel.get(entry.label) || []).find((button) => !used.has(button));
      if (hit) {
        map.set(entry.id, hit);
        used.add(hit);
      } else {
        loose.push(entry);
      }
    }
    const rest = buttons.filter((button) => !used.has(button));
    if (loose.length > 0 && loose.length === rest.length) {
      // Labels that agree prove the two lists are the same list; a button with no
      // label at all is no evidence either way, so it may be filled positionally.
      const sameOrder = loose.every((entry, index) => {
        const label = rest[index].getAttribute('data-dpc-label') || rest[index].getAttribute('aria-label') || '';
        return label === '' || label === entry.label;
      });
      // A build that labels rows in wording this plugin never sees ("IM 机器人"
      // vs "IM机器人") matches nothing at all; that is not a shifted list, it is
      // a naming difference, and refusing here would manage no row at all.
      const nothingMatched = map.size === 0;
      if (sameOrder || nothingMatched) {
        loose.forEach((entry, index) => {
          map.set(entry.id, rest[index]);
          used.add(rest[index]);
        });
      }
    }
    return map;
  }

  function createEngine(ctx) {
    let scheduled = false;
    let destroyed = false;
    let observer = null;
    let observing = false;
    let listEl = null;
    let observed = null;
    let signature = '';
    let pollTimer = null;
    let lastApplyAt = 0;

    const diag = { found: false, rows: 0, mapped: 0, at: 0, listClass: '', error: null, guard: true, panelMax: 45, folded: '' };

    const readPlan = () => {
      const entries = readEntries(ctx.slots);
      const prefs = store.state.prefs;
      const hidden = new Set(prefs.hidden || []);
      const ordered = normalize(prefs, entries);
      const groups = prefs.groups || [];
      const known = new Set(groups.map((group) => group.id));
      const buckets = new Map();
      for (const id of ordered) {
        const groupId = prefs.assign[id] || '';
        if (!buckets.has(groupId)) buckets.set(groupId, []);
        buckets.get(groupId).push(id);
      }
      // Block order is the settings' own group order, not the order in which a
      // group's first member happens to appear: the sidebar must only change when
      // the user changes it.
      const blocks = [];
      for (const group of groups) {
        const ids = buckets.get(group.id);
        if (!ids || ids.length === 0) continue;
        blocks.push({ id: group.id, name: group.name, ids });
      }
      // Unassigned entries (and entries whose group was deleted) form one
      // trailing block, keeping the order the user gave them.
      const loose = ordered.filter((id) => {
        const groupId = prefs.assign[id] || '';
        return groupId === '' || !known.has(groupId);
      });
      if (loose.length > 0) blocks.push({ id: '', name: groups.length > 0 ? t('ungrouped') : '', ids: loose });
      return { entries, prefs, hidden, blocks };
    };

    /**
     * One line per real pass naming what the list holds right now.
     *
     * A row a sibling plugin registered and the page then lost is invisible from
     * here: the registration is gone before the DOM is touched. The dump records
     * both sides (slot entries and buttons), so the side that lost the row says
     * which half dropped it.
     */
    let dumpedKeys = '';
    const dumpPanellist = (plan, list) => {
      try {
        const buttons = Array.from(list.querySelectorAll(':scope > button'));
        const rows = buttons.map((button) => {
          const label = button.getAttribute('aria-label') || '';
          const order = button.style.order || '';
          const shown = button.style.display === 'none' ? 'hidden' : 'shown';
          return `${label}|${shown}|${order}`;
        });
        const key = rows.join(';');
        if (key === dumpedKeys) return;
        dumpedKeys = key;
        reportHost({
          kind: 'panellist',
          listClass: diag.listClass,
          entries: plan.entries.map((entry) => `${entry.id}@${entry.order}`).join(','),
          hidden: Array.from(plan.hidden).join(','),
          rows: rows.join(' · ').slice(0, 1500),
        });
      } catch {
        /* a dump must never break the pass */
      }
    };

    const findList = (entries) => {
      if (listEl && listEl.isConnected && listEl.querySelector(':scope > button')) return listEl;
      listEl = null;
      try {
        for (const candidate of document.querySelectorAll('[class*="panelList"]')) {
          if (candidate.querySelector(':scope > button')) {
            listEl = candidate;
            return listEl;
          }
        }
      } catch {
        /* fall through to the label probe */
      }
      for (const entry of entries) {
        if (!entry.label) continue;
        let button = null;
        try {
          const label = cssEscape(entry.label);
          button = document.querySelector(
            `button[data-dpc-label="${label}"], button[aria-label="${label}"]`,
          );
        } catch {
          button = null;
        }
        const parent = button && button.parentElement;
        if (parent && parent.querySelectorAll(':scope > button').length > 1) {
          listEl = parent;
          return listEl;
        }
      }
      return null;
    };

    /**
     * A group title, and the fold control for that group.
     *
     * The host sidebar has no grouping of its own, so this element is the only
     * thing here the user can click. It is built inside the host's list, which
     * means it must survive that list's React re-renders: no listeners on the
     * list, only on the node itself, replaced on every pass.
     */
    const makeSeparator = (block, order) => {
      const element = document.createElement('div');
      element.className = 'dpc-sep';
      element.setAttribute('data-dpc-sep', '');
      element.setAttribute('data-dpc-group-id', block.id);
      element.style.order = String(order);
      if (block.id !== '') {
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-expanded', block.folded ? 'false' : 'true');
        element.setAttribute('aria-label', block.name + ' · ' + t(block.folded ? 'layoutExpandOne' : 'layoutCollapseOne'));
        if (block.folded) element.setAttribute('data-dpc-collapsed', '');
        const toggle = (event) => {
          if (event) event.preventDefault();
          toggleCollapse(block.id);
        };
        element.addEventListener('click', toggle);
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') toggle(event);
        });
      }
      const caret = document.createElement('span');
      caret.className = 'dpc-caret';
      caret.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'dpc-sepLabel';
      label.textContent = block.name;
      const count = document.createElement('span');
      count.className = 'dpc-sepCount';
      count.textContent = String(block.count);
      element.appendChild(caret);
      element.appendChild(label);
      element.appendChild(count);
      return element;
    };

    /**
     * Mark the host nodes the layout CSS hangs off.
     *
     * The sidebar ships `panelList{flex:none}` next to `regionArea{flex:1;
     * overflow:hidden}`: a long panel list takes whatever height it wants and
     * the session area collapses to nothing with no scroller. Those class names
     * are hashed per build, so the hooks are attributes we add here and remove
     * in destroy(); the CSS in SIDEBAR_CSS keys off them, never off the hashed
     * names.
     */
    let regionEl = null;
    const tagLayout = (list, prefs) => {
      try {
        const off = prefs.guard === false;
        if (off) {
          list.removeAttribute('data-dpc-list');
          list.style.removeProperty('--dpc-panellist-max');
          list.removeAttribute('data-dpc-unbounded');
          if (regionEl) regionEl.removeAttribute('data-dpc-region');
          regionEl = null;
          diag.guard = false;
          return;
        }
        list.setAttribute('data-dpc-list', '');
        const max = Number(prefs.panelMax) || 0;
        if (max > 0) {
          list.style.setProperty('--dpc-panellist-max', max + 'vh');
          list.removeAttribute('data-dpc-unbounded');
        } else {
          list.style.removeProperty('--dpc-panellist-max');
          list.setAttribute('data-dpc-unbounded', '');
        }
        const parent = list.parentElement;
        let region = null;
        if (parent) {
          for (const sibling of Array.from(parent.children)) {
            if (sibling === list) continue;
            const className = typeof sibling.className === 'string' ? sibling.className : '';
            if (className.includes('regionArea')) {
              region = sibling;
              break;
            }
          }
        }
        if (regionEl && regionEl !== region) regionEl.removeAttribute('data-dpc-region');
        if (region) region.setAttribute('data-dpc-region', '');
        regionEl = region;
        diag.panelMax = max;
      } catch {
        /* a different list shape: leave the sidebar alone this pass */
      }
    };

    /** Fold or unfold one group, persisting the choice through commit(). */
    const toggleCollapse = (id) => {
      if (!id) return;
      const prefs = store.state.prefs;
      if (prefs.collapse === false) return;
      const next = new Set(prefs.collapsed || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commit({ ...prefs, collapsed: Array.from(next) });
    };

    const pause = () => {
      if (observer && observing) {
        observer.disconnect();
        observing = false;
      }
    };

    const resume = () => {
      if (!observer || destroyed || observing) return;
      // Watch the list itself once it is known. Watching `document.body` means
      // every chunk of a streaming reply schedules a full re-plan, and the plan
      // costs a slot read plus a query over every sidebar row.
      const target = listEl && listEl.isConnected ? listEl : document.body;
      try {
        observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style'],
        });
        observed = target;
        observing = true;
      } catch {
        /* observing is an optimisation, not a requirement */
      }
    };

    /** The title node of a host panel row: the only direct span that is not the
     *  aria-hidden glyph and not the original-name tag this plugin adds. */
    const titleSpanOf = (button) => {
      for (const child of Array.from(button.children || [])) {
        if (child.tagName !== 'SPAN') continue;
        const className = typeof child.className === 'string' ? child.className : '';
        if (className.split(/\s+/).includes('dpc-nameTag')) continue;
        if (child.getAttribute('aria-hidden') === 'true') continue;
        return child;
      }
      return null;
    };

    /**
     * Rename rows in the host sidebar, and keep the original label visible in a
     * small tag. The host owns this DOM, so this is a pure display overlay: the
     * entry id, its slot registration and every other preference are untouched.
     */
    const applyNames = (map, plan, wide) => {
      const tagsOn = plan.prefs.tags !== false;
      const byId = new Map(plan.entries.map((entry) => [entry.id, entry]));
      for (const [id, button] of map) {
        try {
          const entry = byId.get(id);
          if (!entry) continue;
          const custom = customName(plan.prefs, id);
          const shown = custom || entry.label;
          // Keep the original label addressable: mapButtons() must keep matching
          // the same row after the user renames it.
          if (button.getAttribute('data-dpc-label') !== entry.label) {
            button.setAttribute('data-dpc-label', entry.label);
          }
          if (button.getAttribute('aria-label') !== shown) button.setAttribute('aria-label', shown);
          const title = titleSpanOf(button);
          if (title && title.textContent !== shown) title.textContent = shown;
          let tag = null;
          for (const child of Array.from(button.children || [])) {
            const className = typeof child.className === 'string' ? child.className : '';
            if (className.split(/\s+/).includes('dpc-nameTag')) tag = child;
          }
          // Only a renamed row needs the tag: it identifies the plugin by its
          // package (`dsh-` trimmed), which a custom display name can hide.
          const tagText = packageTagFor(id);
          const wantTag = Boolean(
            wide &&
              tagsOn &&
              custom &&
              custom !== entry.label &&
              tagText &&
              tagText.toLowerCase() !== shown.toLowerCase(),
          );
          if (wantTag) {
            if (!tag) {
              tag = document.createElement('span');
              tag.className = 'dpc-nameTag';
              tag.setAttribute('aria-hidden', 'true');
              button.appendChild(tag);
            }
            if (tag.textContent !== tagText) tag.textContent = tagText;
          } else if (tag) {
            tag.remove();
          }
        } catch {
          /* a host build with another row shape: leave that row alone */
        }
      }
    };

    const apply = () => {
      if (destroyed) return;
      const plan = readPlan();
      if (!sameEntries(store.state.entries, plan.entries)) setState({ entries: plan.entries });
      const list = findList(plan.entries);
      diag.found = Boolean(list);
      // A different list (the sidebar remounted) needs a new observation target.
      if (list && observed !== list) pause();
      if (!list) {
        diag.rows = 0;
        diag.mapped = 0;
        diag.listClass = '';
        diag.at = Date.now();
        return;
      }
      diag.listClass = typeof list.className === 'string' ? list.className.split(/\s+/)[0] || '' : '';

      diag.guard = plan.prefs.guard !== false;
      diag.panelMax = plan.prefs.panelMax;
      // Run on every pass, before the signature shortcut: changing the height
      // cap or the guard must reach the DOM even when the rows did not move.
      tagLayout(list, plan.prefs);

      const wide = list.getBoundingClientRect().width >= WIDE_MIN_WIDTH;
      const folding = wide && plan.prefs.collapse !== false;
      const folded = folding ? new Set(plan.prefs.collapsed || []) : new Set();
      diag.folded = Array.from(folded).join(',');

      // Renames are display state, like the height cap: apply them before the
      // signature shortcut so a pass that only renames still reaches the DOM.
      const buttons = Array.from(list.querySelectorAll(':scope > button'));
      const map = mapButtons(plan.entries, buttons);
      applyNames(map, plan, wide);
      // Package names label renamed rows; the first pass that knows the entries
      // asks the Host once, and later passes are deduplicated by the id set.
      void ensurePackages();

      const nextSignature = JSON.stringify({
        blocks: plan.blocks,
        hidden: plan.hidden ? Array.from(plan.hidden).sort() : [],
        entries: plan.entries.map((entry) => entry.id + ':' + entry.label),
        names: plan.prefs.names || {},
        tags: plan.prefs.tags !== false,
        wide,
        folded: Array.from(folded),
      });
      const separatorsLeft = list.querySelectorAll('[data-dpc-sep]').length;
      if (nextSignature === signature && (separatorsLeft > 0 || plan.blocks.length <= 1)) {
        diag.at = Date.now();
        return;
      }
      signature = nextSignature;
      dumpPanellist(plan, list);

      pause();
      try {
        for (const node of Array.from(list.querySelectorAll('[data-dpc-sep]'))) node.remove();

        const managed = new Set(map.values());

        // Anything we do not manage (the "More" launcher and its wrapper) keeps
        // the end of the list instead of sorting between our rows on `order: 0`.
        for (const child of Array.from(list.children)) {
          if (child.tagName === 'BUTTON') continue;
          if (child.hasAttribute('data-dpc-sep')) continue;
          child.style.order = String(ORDER_UNMANAGED);
        }

        let position = ORDER_START;
        for (const block of plan.blocks) {
          const inBlock = block.ids.filter((id) => map.has(id));
          const shown = inBlock.filter((id) => !plan.hidden.has(id));
          if (shown.length === 0) continue;
          const foldedHere = block.id !== '' && folded.has(block.id);
          // The title stays while the group is folded: it is the only way back,
          // and the count keeps the hidden rows discoverable.
          if (wide && block.name) {
            list.appendChild(
              makeSeparator({ id: block.id, name: block.name, count: shown.length, folded: foldedHere }, position),
            );
            position += ORDER_STEP;
          }
          if (foldedHere) continue;
          for (const id of shown) {
            const button = map.get(id);
            button.style.order = String(position);
            button.style.display = '';
            button.removeAttribute('data-dpc-hidden');
            button.removeAttribute('data-dpc-collapsed');
            button.setAttribute('data-dpc-group', block.name || '');
            position += ORDER_STEP;
          }
        }

        for (const id of plan.hidden) {
          const button = map.get(id);
          if (!button) continue;
          button.style.display = 'none';
          button.setAttribute('data-dpc-hidden', '');
          button.removeAttribute('data-dpc-collapsed');
        }

        // Folding is a separate axis from "hidden in this plugin": a folded row
        // is still shown in the settings list and comes back with one click.
        for (const block of plan.blocks) {
          if (block.id === '' || !folded.has(block.id)) continue;
          for (const id of block.ids) {
            const button = map.get(id);
            if (!button || plan.hidden.has(id)) continue;
            button.style.display = 'none';
            button.setAttribute('data-dpc-collapsed', '');
          }
        }

        // A row we could not map is left in place, but kept after every managed row.
        for (const button of buttons) {
          if (managed.has(button)) continue;
          button.style.order = String(ORDER_UNMANAGED_TAIL);
        }

        diag.rows = buttons.length;
        diag.mapped = map.size;
        diag.error = null;
      } catch (error) {
        diag.error = error && error.message ? String(error.message) : String(error);
      } finally {
        diag.at = Date.now();
        resume();
      }
    };

    const APPLY_MIN_GAP = 100;
    const schedule = () => {
      if (scheduled || destroyed) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        apply();
        lastApplyAt = Date.now();
      };
      // Coalesce bursts: a streaming reply fires mutations faster than the plan
      // can run, and nothing in the sidebar changes between two frames anyway.
      const wait = Math.max(0, APPLY_MIN_GAP - (Date.now() - lastApplyAt));
      if (wait > 0) setTimeout(run, wait);
      else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 16);
    };

    const start = () => {
      if (typeof MutationObserver === 'function' && document.body) {
        observer = new MutationObserver(() => schedule());
        resume();
      }
      schedule();
      // The sidebar mounts after this plugin's apply (and a page can restore a
      // panel later), so keep probing instead of giving up after a few seconds.
      for (const delay of [0, 120, 400, 1000, 2500, 5000, 9000, 14000]) setTimeout(schedule, delay);
      let tries = 0;
      pollTimer = setInterval(() => {
        if (destroyed || listEl || tries > 40) {
          clearInterval(pollTimer);
          pollTimer = null;
          return;
        }
        tries += 1;
        schedule();
      }, 3000);
      try {
        window.addEventListener('resize', schedule);
      } catch {
        /* no window: nothing to watch */
      }
    };

    const destroy = () => {
      destroyed = true;
      pause();
      observer = null;
      observed = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      try {
        window.removeEventListener('resize', schedule);
      } catch {
        /* ignore */
      }
      if (listEl) {
        for (const node of Array.from(listEl.querySelectorAll('[data-dpc-sep]'))) node.remove();
        for (const node of Array.from(listEl.querySelectorAll('[data-dpc-panel]'))) {
          node.style.removeProperty('order');
          node.style.removeProperty('display');
        }
      }
      // Hand the host rows back exactly as they were: the original label, the
      // original title text, and no tag of ours.
      for (const button of Array.from(document.querySelectorAll('button[data-dpc-label]'))) {
        const label = button.getAttribute('data-dpc-label');
        if (label) {
          button.setAttribute('aria-label', label);
          const title = titleSpanOf(button);
          if (title) title.textContent = label;
          button.removeAttribute('data-dpc-label');
        }
        for (const tag of Array.from(button.querySelectorAll('.dpc-nameTag'))) tag.remove();
      }
      for (const node of Array.from(document.querySelectorAll('[data-dpc-list]'))) {
        node.removeAttribute('data-dpc-list');
        node.removeAttribute('data-dpc-unbounded');
        node.style.removeProperty('--dpc-panellist-max');
      }
      for (const node of Array.from(document.querySelectorAll('[data-dpc-collapsed]'))) node.removeAttribute('data-dpc-collapsed');
      if (regionEl) regionEl.removeAttribute('data-dpc-region');
      regionEl = null;
      listEl = null;
    };

    return { apply, schedule, start, destroy, diagnostics: () => ({ ...diag }), refresh: schedule };
  }

  /* --------------------------------------------------------------- actions */

  /** Bumped by every user-visible edit; used to drop stale Host snapshots. */
  let commitRevision = 0;

  function commit(nextPrefs) {
    commitRevision += 1;
    const safe = sanitize(nextPrefs);
    store.state = { ...store.state, prefs: safe };
    writeLocalPrefs(safe);
    scheduleSaveToHost();
    emit();
    if (engineRef) engineRef.schedule();
    // The bridge switch lives here too; toggling it must add or drop the rows
    // right away rather than on the next unrelated registration.
    scheduleBridgeSync();
  }

  function setDiag(patch) {
    setState({ diag: { ...(store.state.diag || {}), ...patch } });
  }

  /** Pull the Host copy of the settings over the browser cache. */
  async function hydratePrefs() {
    const revision = commitRevision;
    const remote = await hostCall('load', {});
    // The answer can land after the user already moved a row or renamed a group.
    // Their edit is newer than this snapshot, so keep theirs instead of rolling
    // it back to whatever the Host had when the request left.
    if (revision !== commitRevision) return;
    const stored = remote && remote.prefs ? sanitize(remote.prefs) : null;
    const local = readLocalPrefs();
    const hostFile = (remote && remote.file) || '';
    const chosen = stored && (hasContent(stored) || !(local && hasContent(local))) ? stored : local;
    if (chosen) {
      prefsSource.value = stored ? 'host' : 'local';
      if (JSON.stringify(chosen) !== JSON.stringify(store.state.prefs)) {
        store.state = { ...store.state, prefs: chosen };
        writeLocalPrefs(chosen);
        emit();
        if (engineRef) engineRef.schedule();
      }
      // Heal the file when it was missing or older than this version.
      if (!stored || !hasContent(stored)) await hostCall('save', { prefs: chosen });
    }
    setDiag({ prefsSource: prefsSource.value, hostFile });
    // The Host copy may carry the bridge switch with it.
    scheduleBridgeSync();
  }

  const prefsNow = () => store.state.prefs;
  const orderNow = () => normalize(prefsNow(), store.state.entries);

  // Move fromId in front of targetId. Shared by the entry list and the group
  // list so both sections reorder by exactly the same rule.
  function reorderList(list, fromId, targetId) {
    const from = list.indexOf(fromId);
    if (from < 0 || list.indexOf(targetId) < 0 || fromId === targetId) return null;
    const next = list.slice();
    const [moved] = next.splice(from, 1);
    // Dropping onto a row means "put it in front of that row", so the target
    // index has to be read after the item left the list.
    next.splice(next.indexOf(targetId), 0, moved);
    return next;
  }

  function moveBefore(fromId, targetId) {
    const order = reorderList(orderNow(), fromId, targetId);
    if (!order) return;
    commit({ ...prefsNow(), order });
  }

  function sortByName() {
    const prefs = prefsNow();
    const entries = store.state.entries || [];
    const labelOf = new Map(entries.map((entry) => [entry.id, displayName(prefs, entry.id, entry.label)]));
    const locale = activeLang() === 'zh' ? 'zh-Hans-CN' : 'en';
    const order = orderNow()
      .slice()
      .sort((left, right) => String(labelOf.get(left) || left).localeCompare(String(labelOf.get(right) || right), locale));
    commit({ ...prefsNow(), order });
  }

  function showAll() {
    commit({ ...prefsNow(), hidden: [] });
  }

  function resetAll() {
    commit(emptyPrefs());
  }

  function toggleHidden(id) {
    if (id === PANEL_KEY) return;
    const hidden = new Set(prefsNow().hidden || []);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    commit({ ...prefsNow(), hidden: Array.from(hidden) });
  }

  function setGroup(id, groupId) {
    const assign = { ...(prefsNow().assign || {}) };
    if (groupId) assign[id] = groupId;
    else delete assign[id];
    commit({ ...prefsNow(), assign });
  }

  function addGroup() {
    const groups = (prefsNow().groups || []).slice();
    const name = `${t('newGroupName')} ${groups.length + 1}`;
    const id = `g${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
    groups.push({ id, name });
    commit({ ...prefsNow(), groups });
  }

  function renameGroup(groupId, name) {
    const groups = (prefsNow().groups || []).map((group) =>
      group.id === groupId ? { id: group.id, name: name === '' ? '—' : name } : group,
    );
    commit({ ...prefsNow(), groups });
  }

  function moveGroupBefore(fromId, targetId) {
    const groups = reorderList((prefsNow().groups || []).map((group) => group.id), fromId, targetId);
    if (!groups) return;
    const byId = new Map((prefsNow().groups || []).map((group) => [group.id, group]));
    commit({ ...prefsNow(), groups: groups.map((id) => byId.get(id)) });
  }

  function removeGroup(groupId) {
    const prefs = prefsNow();
    const groups = (prefs.groups || []).filter((group) => group.id !== groupId);
    const assign = { ...(prefs.assign || {}) };
    for (const [panelId, assigned] of Object.entries(assign)) {
      if (assigned === groupId) delete assign[panelId];
    }
    commit({ ...prefs, groups, assign });
  }

  /* ------------------------------------------------------- auto classify */

  /**
   * Auto classify asks the Host for one small model call: this half cannot reach
   * a model, and the Host half exposes exactly one route for it. Both halves
   * are optional to each other — without the route the switch reports why.
   */
  /** Entries the auto switch has already looked at; it never re-files them. */
  function autoFiledSet() {
    return new Set(store.state.prefs.autoFiled || []);
  }

  function setAuto(patch) {
    const current = store.state.autoState || { status: 'idle', message: '', groups: 0 };
    setState({ autoState: { ...current, ...patch } });
  }

  /** The Host connection, however this Client build exposes it. */
  function getRpc() {
    const ctx = ctxRef;
    if (!ctx) return null;
    let connection = null;
    try {
      connection = ctx.connection || null;
    } catch {
      connection = null;
    }
    if (!connection && typeof ctx.get === 'function') {
      try {
        connection = ctx.get('connection') || null;
      } catch {
        connection = null;
      }
    }
    const rpc = connection && connection.rpc;
    return rpc && typeof rpc.call === 'function' ? rpc : null;
  }



  const sameGroupName = (left, right) =>
    String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();

  function nextGroupId(groups) {
    let id = `g${Date.now().toString(36)}`;
    while (groups.some((group) => group.id === id)) id = `${id}x`;
    return id;
  }

  /**
   * Write the model's filing into the same preferences the UI edits.
   *
   * Two rules keep this from feeling unstable:
   *  - `order` is never touched. Filing decides which section an entry is in,
   *    not where the row sits; reordering rows behind the user's back was the
   *    main reason the list "changed by itself".
   *  - Existing sections keep their position (the settings list is the single
   *    source of section order) and, in `new` mode, keep their members.
   */
  function applyClassification(value, mode) {
    const all = mode === 'all';
    const entries = store.state.entries || [];
    const known = new Set(entries.map((entry) => entry.id));
    const prefs = prefsNow();
    const groups = (prefs.groups || []).slice();
    const assign = { ...(prefs.assign || {}) };
    const knownGroups = new Set(groups.map((group) => group.id));
    const created = new Set();
    const assigned = new Set();
    let count = 0;
    for (const group of (value && value.groups) || []) {
      const ids = (group.ids || []).filter((id) => known.has(id));
      if (ids.length === 0) continue;
      let target = groups.find((entry) => sameGroupName(entry.name, group.name));
      if (!target) {
        target = {
          id: nextGroupId(groups),
          name: String(group.name || '').trim().slice(0, 40) || `#${groups.length + 1}`,
        };
        groups.push(target);
        created.add(target.id);
      }
      for (const id of ids) {
        const current = assign[id] || '';
        if (!all && current && knownGroups.has(current)) continue;
        assign[id] = target.id;
        assigned.add(id);
      }
      count += 1;
    }
    // A section this run invented and left empty is not worth keeping.
    for (const id of created) {
      if (Object.values(assign).some((groupId) => groupId === id)) continue;
      const at = groups.findIndex((group) => group.id === id);
      if (at >= 0) groups.splice(at, 1);
    }
    // Remember only what this run actually filed. An entry the model left out
    // stays eligible, so a later run can still place it; marking the whole list
    // as handled made a missed entry permanently invisible to auto filing.
    const filed = new Set(prefs.autoFiled || []);
    for (const id of assigned) filed.add(id);
    commit({ ...prefsNow(), groups, assign, autoFiled: Array.from(filed) });
    setAuto({
      status: 'done',
      groups: count,
      message: fill(t(all ? 'autoDone' : 'autoFiledNew'), { n: count, m: (value && value.model) || 'model' }),
      at: Date.now(),
    });
  }

  /** A few Host failures deserve a sentence the user can act on. */
  const AUTO_ERROR_TEXT = {
    timeout: 'autoTimeout',
    'model-failed': 'autoModelFailed',
    'unparsable-answer': 'autoUnparsable',
  };

  let classifyToken = 0;

  async function classifyNow(mode) {
    const entries = store.state.entries || [];
    if (entries.length === 0) {
      setAuto({ status: 'error', message: t('autoEmpty'), at: Date.now() });
      return;
    }
    const rpc = getRpc();
    if (!rpc) {
      setAuto({ status: 'error', message: t('autoUnavailable'), at: Date.now() });
      return;
    }
    // Only the newest run may write its result: a second press while the first
    // call is in flight otherwise lands later and overwrites the newer filing.
    const token = ++classifyToken;
    setAuto({ status: 'running', message: t('autoRunning'), groups: 0, at: Date.now() });
    try {
      const result = await rpc.call(RPC_CHANNEL, RPC_ENDPOINT, {
        method: 'classify',
        payload: {
          entries: entries.map((entry) => ({ id: entry.id, label: entry.label })),
          groups: (prefsNow().groups || []).map((group) => ({ name: group.name })),
          locale: activeLang(),
        },
      });
      if (token !== classifyToken) return;
      if (!result || result.ok !== true) {
        const error = (result && result.error) || {};
        const key = AUTO_ERROR_TEXT[error.code];
        if (key) {
          setAuto({ status: 'error', message: t(key), at: Date.now() });
          return;
        }
        throw new Error(error.message || 'unknown error');
      }
      reportHost({ kind: 'classified', mode: mode === 'all' ? 'all' : 'new', groups: (result.value && result.value.groups || []).length });
      applyClassification(result.value, mode === 'all' ? 'all' : 'new');
    } catch (error) {
      if (token !== classifyToken) return;
      reportHost({ kind: 'classify-failed', message: (error && error.message) || String(error) });
      setAuto({
        status: 'error',
        message: fill(t('autoFailed'), { m: (error && error.message) || String(error) }),
        at: Date.now(),
      });
    }
  }

  function toggleAuto() {
    const next = !prefsNow().auto;
    commit({ ...prefsNow(), auto: next });
    if (next) void classifyNow('new');
  }

  /* ------------------------------------------------------------ components */

  const ICON_D = {
    grip: 'M9 7h.01M9 12h.01M9 17h.01M15 7h.01M15 12h.01M15 17h.01',
    up: 'M12 19V6M6.5 11.5 12 6l5.5 5.5',
    down: 'M12 5v13M6.5 12.5 12 18l5.5-5.5',
    close: 'M7 7l10 10M17 7 7 17',
    plus: 'M12 6v12M6 12h12',
    eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z',
    eyeOff: 'M2.5 12S6 6.5 12 6.5c1.6 0 3 .45 4.2 1.1M21.5 12S18 17.5 12 17.5c-1.6 0-3-.45-4.2-1.1M4 4l16 16',
    edit: 'M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z',
    back: 'M14.5 6.5 9 12l5.5 5.5',
  };

  /** One 16px line glyph, one 1.5 stroke, colours inherited from the text role. */
  function Icon(props) {
    const d = ICON_D[props.name] || '';
    const children = [
      h('path', {
        key: 'p',
        d,
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    ];
    if (props.name === 'eye' || props.name === 'eyeOff') {
      children.push(h('circle', { key: 'c', cx: 12, cy: 12, r: 2.6, stroke: 'currentColor', strokeWidth: 1.5 }));
    }
    return h(
      'svg',
      {
        className: 'dpc-ico',
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        focusable: 'false',
      },
      children,
    );
  }

  function SlidersIcon(props) {
    const size = props && typeof props.size === 'number' ? props.size : 18;
    const active = Boolean(props && props.active);
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.78 },
      },
      h('path', {
        d: 'M3 6.5h7M14 6.5h7M3 12h11M18 12h3M3 17.5h4M11 17.5h10',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
      }),
      h('circle', { cx: 12.5, cy: 6.5, r: 2.1, stroke: 'currentColor', strokeWidth: 1.6 }),
      h('circle', { cx: 16.5, cy: 12, r: 2.1, stroke: 'currentColor', strokeWidth: 1.6 }),
      h('circle', { cx: 9.5, cy: 17.5, r: 2.1, stroke: 'currentColor', strokeWidth: 1.6 }),
    );
  }

  const PanelIcon = SlidersIcon;

  /**
   * A page glyph with text lines: the settings page, not the plugin's own icon
   * (that one belongs to the plugin and is not available to the bridge).
   */
  function BridgeIcon(props) {
    const size = props && typeof props.size === 'number' ? props.size : 18;
    const active = Boolean(props && props.active);
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.78 },
      },
      h('rect', {
        x: 3.5,
        y: 4.5,
        width: 17,
        height: 15,
        rx: 2.5,
        stroke: 'currentColor',
        strokeWidth: 1.6,
      }),
      h('path', {
        d: 'M8 9.5h8M8 12h5M8 14.5h8',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }),
    );
  }

  /**
   * One bridged page: a back bar, then the host's renderer for the section.
   *
   * The settings shell owns the `settings.section` declaration, so the ctx-level
   * `slots.renderSlot` cannot reach it: that entry point only renders `root`, and
   * a child slot is renderable only through the props face of the entry that
   * declared it. Each bridge therefore declares its own single-child slot and
   * re-registers the section component into it (see `syncBridges`), and renders
   * that slot through the `renderSlot` prop the host hands this component. The
   * host still builds the section's kit — inject, locale, store, boundary and
   * hooks all stay its own. The owner prop is the same `close` the settings shell
   * passes, wired to the Conversation because this page has no dialog to close.
   */
  function makeBridgePanel(candidate, slotName) {
    const back = () => {
      try {
        const layout = optionalService(ctxRef, 'layout');
        if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null);
      } catch {
        /* the Conversation is already showing */
      }
    };
    return function BridgePanel(props) {
      const renderSlot = props && typeof props.renderSlot === 'function' ? props.renderSlot : null;
      let node = null;
      try {
        if (renderSlot) node = renderSlot(slotName, { close: back }, {});
      } catch (error) {
        console.warn(`[${PACKAGE}] could not render settings page "${candidate.sectionId}"`, error);
      }
      return h(
        'div',
        { className: 'dpc-root dpc-bridge' },
        h(
          'div',
          { className: 'dpc-page dpc-bridgePage' },
          h(
            'div',
            { className: 'dpc-bridgeBar' },
            h(
              'button',
              { type: 'button', className: 'dpc-link dpc-bridgeBack', onClick: back },
              h(Icon, { name: 'back' }),
              h('span', null, t('bridgeBack')),
            ),
            h(
              'span',
              { className: 'dpc-bridgeTags' },
              h('span', { className: 'dpc-bridgeTag' }, t('bridgeTag')),
              h(
                'span',
                { className: 'dpc-bridgeFrom' },
                fill(t('bridgeFrom'), {
                  // The same package short name the row tag shows; the section
                  // id is only a fallback while the Host lookup is in flight.
                  p: packageTagFor(candidate.bridgeId) || candidate.sectionId,
                }),
              ),
            ),
          ),
          node
            ? h('div', { className: 'dpc-bridgeBody' }, node)
            : h(
                'section',
                { className: 'dpc-card dpc-empty' },
                h('p', { className: 'dpc-emptyTitle' }, t('bridgeMissing')),
              ),
        ),
      );
    };
  }

  /** The entry's own glyph, borrowed from the slot it registered. */
  function Glyph(props) {
    const [node, setNode] = React.useState(null);
    React.useEffect(() => {
      let value = null;
      try {
        const slots = ctxRef && ctxRef.slots;
        if (slots && typeof slots.renderSlot === 'function') {
          value = slots.renderSlot(SLOT_PANELS, { size: 16, active: false }, { only: props.id });
        }
      } catch {
        value = null;
      }
      setNode(value === undefined ? null : value);
    }, [props.id]);
    return h('span', { className: 'dpc-glyph', 'aria-hidden': true }, node);
  }

  // A native <select> gets its option list painted by the OS widget: it ignores
  // page colors and pops up white-on-white against this theme. This picker draws
  // the same choice in our own colors.
  function GroupPicker(props) {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef(null);
    React.useEffect(() => {
      if (!open) return undefined;
      const close = (event) => {
        if (event.type === 'keydown' && event.key !== 'Escape') return;
        if (event.type === 'mousedown' && rootRef.current && rootRef.current.contains(event.target)) return;
        setOpen(false);
      };
      document.addEventListener('mousedown', close, true);
      document.addEventListener('keydown', close, true);
      return () => {
        document.removeEventListener('mousedown', close, true);
        document.removeEventListener('keydown', close, true);
      };
    }, [open]);
    const value = props.value || '';
    const options = [{ value: '', label: props.ungrouped }].concat(
      (props.groups || []).map((group) => ({ value: group.id, label: group.name })),
    );
    const current = options.find((option) => option.value === value) || options[0];
    return h(
      'div',
      { className: 'dpc-picker', ref: rootRef, 'data-open': open ? 'true' : undefined },
      h(
        'button',
        {
          type: 'button',
          className: 'dpc-pickerBtn',
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': props.label,
          title: current.label,
          onClick: () => setOpen((was) => !was),
        },
        h('span', { className: 'dpc-pickerText' }, current.label),
        h('span', { className: 'dpc-caret', 'aria-hidden': 'true' }),
      ),
      open
        ? h(
            'div',
            { className: 'dpc-menu', role: 'listbox', 'aria-label': props.label },
            options.map((option) =>
              h(
                'button',
                {
                  key: option.value || '__ungrouped',
                  type: 'button',
                  role: 'option',
                  className: 'dpc-option',
                  'aria-selected': option.value === value ? 'true' : 'false',
                  onClick: () => {
                    setOpen(false);
                    props.onPick(option.value);
                  },
                },
                option.label,
              ),
            ),
          )
        : null,
    );
  }

  function PanelManager(props) {
    // The same body serves the main panel and the settings section: the section
    // is already inside a framed column, so it opts out of the page frame.
    const inSection = !!(props && props.variant === 'section');
    const state = useStore();
    const prefs = state.prefs;
    const entries = state.entries;
    const engine = engineRef;
    const dragRef = React.useRef(null);
    const [rowDrag, setRowDrag] = React.useState({ from: null, over: null });
    // Dismissing the banner is a local decision, not a store update: the same
    // check runs again on focus, and the answer must not pop back up.
    const [, forceRender] = React.useReducer((n) => n + 1, 0);
    const [groupDrag, setGroupDrag] = React.useState({ from: null, over: null });
    const [editing, setEditing] = React.useState(null);
    const [draft, setDraft] = React.useState('');
    const cancelRenameRef = React.useRef(false);
    /**
     * Dragging works the same for a row and for a section: the handle starts it,
     * the target highlights, dropping commits "move before this one". Only the
     * commit differs, so the four handlers live here once instead of twice.
     */
    const dragProps = (id, state, setDrag, commitMove) => ({
      draggable: true,
      'data-dragging': state.from === id ? 'true' : 'false',
      'data-over': state.over === id && state.from !== id ? 'true' : 'false',
      onDragStart: (event) => {
        dragRef.current = id;
        setDrag({ from: id, over: null });
        try {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
        } catch {
          /* older engines refuse writes; the ref already holds the id */
        }
      },
      onDragOver: (event) => {
        event.preventDefault();
        setDrag((prev) => (prev.over === id ? prev : { ...prev, over: id }));
      },
      onDrop: (event) => {
        event.preventDefault();
        const from = dragRef.current;
        dragRef.current = null;
        setDrag({ from: null, over: null });
        if (from && from !== id) commitMove(from, id);
      },
      onDragEnd: () => {
        dragRef.current = null;
        setDrag({ from: null, over: null });
      },
    });

    React.useEffect(() => {
      if (engine) engine.refresh();
    }, [engine]);

    // While the switch is on, only entries this switch has never seen are filed:
    // the list must not be re-sorted behind the user's back. A failure backs off
    // for a minute and then tries once more, so a dead route cannot loop.
    React.useEffect(() => {
      if (prefs.auto !== true) return;
      const auto = state.autoState || {};
      if (auto.status === 'running') return;
      if (auto.status === 'error' && Date.now() - (auto.at || 0) < AUTO_RETRY_MS) return;
      const filed = autoFiledSet();
      // A settings file written before autoFiled existed already carries the
      // classification the user accepted: treat it as filed, never re-sort it.
      if (filed.size === 0 && (prefs.groups || []).length > 0) {
        for (const entry of entries) filed.add(entry.id);
      }
      const unseen = entries.filter((entry) => !filed.has(entry.id));
      if (unseen.length === 0) return;
      const timer = setTimeout(() => {
        void classifyNow('new');
      }, AUTO_DELAY_MS);
      return () => clearTimeout(timer);
    }, [prefs.auto, prefs.autoFiled, entries.length, state.autoState && state.autoState.status]);

    const order = normalize(prefs, entries);
    const rawOf = new Map(entries.map((entry) => [entry.id, entry.label]));
    const labelOf = new Map(entries.map((entry) => [entry.id, displayName(prefs, entry.id, entry.label)]));
    const hidden = new Set(prefs.hidden || []);
    const groupsOf = prefs.groups || [];
    const autoOn = prefs.auto === true;
    const autoState = state.autoState || { status: 'idle', message: '', groups: 0 };

    const startRename = (id) => {
      cancelRenameRef.current = false;
      setEditing(id);
      setDraft(customName(prefsNow(), id));
    };

    const finishRename = (id) => {
      // Escape unmounts the input; a trailing blur must not save the draft.
      if (cancelRenameRef.current) {
        cancelRenameRef.current = false;
        setEditing(null);
        setDraft('');
        return;
      }
      const original = rawOf.get(id) || id;
      const name = cleanName(draft);
      const names = { ...(prefsNow().names || {}) };
      if (!name || name === original) delete names[id];
      else names[id] = name;
      setEditing(null);
      setDraft('');
      commit({ ...prefsNow(), names });
    };

    const cancelRename = () => {
      cancelRenameRef.current = true;
      setEditing(null);
      setDraft('');
    };


    const head = h(
      'header',
      { className: inSection ? 'dpc-head dpc-head--section' : 'dpc-head' },
      h(
        'div',
        { className: 'dpc-headLine' },
        h('h1', { className: 'dpc-title' }, t('panelTitle')),
        h(
          'div',
          { className: 'dpc-toolbarActions' },
          h('button', { type: 'button', className: 'dpc-link', onClick: sortByName }, t('sortByName')),
          h(
            'button',
            {
              type: 'button',
              className: 'dpc-link',
              onClick: showAll,
              disabled: hidden.size === 0,
            },
            t('showAll'),
          ),
          h('button', { type: 'button', className: 'dpc-link', onClick: resetAll }, t('reset')),
        ),
      ),
      h(
        'p',
        { className: 'dpc-meta' },
        h('span', { className: 'dpc-lede' }, t('subtitle')),
        h('span', { className: 'dpc-sepText', 'aria-hidden': true }, '·'),
        h('span', { className: 'dpc-count' }, fill(t('countFmt'), { n: order.length, h: hidden.size })),
      ),
      h('p', { className: 'dpc-note dpc-hint' }, t('hint')),
    );

    // The page runs the plugin list it booted with. When the Host has moved on
    // (a plugin was added, removed or rebuilt), say so and offer the one action
    // that fixes it — no other plugin is involved in the check or the reload.
    const inventory = state.inventory || { status: 'idle', stale: false, missing: [] };
    const missing = Array.isArray(inventory.missing) ? inventory.missing : [];
    // The banner answers one question: is something this page should show still
    // absent? It stays dismissed for the exact same gap, and it says "still
    // missing" only for a reload this page made moments ago that did not help.
    const skipped = missing.length > 0 && readSkip() === missing.join(',');
    const mark = readReloadMark();
    const stillMissing =
      !!mark && missing.length > 0 && mark.ids.length > 0 && missing.some((id) => mark.ids.includes(id));
    const notice =
      inventory.stale !== true || skipped
        ? null
        : h(
            'section',
            { className: 'dpc-notice', role: 'status' },
            h(
              'div',
              { className: 'dpc-noticeText' },
              h('p', { className: 'dpc-noticeTitle' }, t('missingTitle')),
              h(
                'p',
                { className: 'dpc-note' },
                fill(t('missingBody'), {
                  names:
                    missing.slice(0, 3).join('、') +
                    (missing.length > 3 ? fill(t('missingMore'), { n: missing.length - 3 }) : ''),
                }),
              ),
              stillMissing ? h('p', { className: 'dpc-note' }, t('refreshStillMissing')) : null,
            ),
            h('button', { type: 'button', className: 'dpc-noticeAction', onClick: reloadPage }, t('refreshPage')),
            h(
              'button',
              {
                type: 'button',
                className: 'dpc-noticeClose',
                title: t('dismiss'),
                'aria-label': t('dismiss'),
                onClick: () => {
                  skipNotice(missing);
                  forceRender();
                },
              },
              h(Icon, { name: 'close' }),
            ),
          );

    const auto = h(
      'section',
      { className: 'dpc-card dpc-auto' },
      h(
        'div',
        { className: 'dpc-autoMain' },
        h(
          'div',
          { className: 'dpc-autoText' },
          h('h2', { className: 'dpc-cardTitle' }, t('autoTitle')),
          h('p', { className: 'dpc-note dpc-inlineNote' }, t('autoHint')),
        ),
        h(
          'div',
          { className: 'dpc-autoActions' },
          autoOn
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dpc-link',
                  onClick: () => classifyNow(),
                  disabled: autoState.status === 'running',
                },
                t('autoAgain'),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dpc-switch',
              role: 'switch',
              'aria-checked': autoOn ? 'true' : 'false',
              'aria-label': t('autoTitle'),
              onClick: toggleAuto,
            },
            h('span', { className: 'dpc-switchKnob', 'aria-hidden': true }),
          ),
        ),
      ),
      autoState.status === 'idle' || autoState.message === ''
        ? null
        : h(
            'p',
            {
              className: 'dpc-status',
              'data-error': autoState.status === 'error' ? 'true' : 'false',
              'aria-live': 'polite',
            },
            autoState.message,
          ),
    );

    const iconButton = (name, label, onClick, disabled, extra) =>
      h(
        'button',
        Object.assign(
          {
            type: 'button',
            className: 'dpc-icon',
            onClick,
            disabled: Boolean(disabled),
            'aria-label': label,
            title: label,
          },
          extra || {},
        ),
        h(Icon, { name }),
      );

    const rows = order.map((id, position) => {
      const label = labelOf.get(id) || id;
      const rawLabel = rawOf.get(id) || id;
      const isHidden = hidden.has(id);
      const locked = id === PANEL_KEY;
      return h(
        'li',
        {
          key: id,
          className: 'dpc-row',
          'data-hidden': isHidden ? 'true' : 'false',
          'data-locked': locked ? 'true' : 'false',
          ...dragProps(id, rowDrag, setRowDrag, moveBefore),
        },
        h('span', { className: 'dpc-grip', title: t('dragHint') }, h(Icon, { name: 'grip' })),
        h('span', { className: 'dpc-pos' }, String(position + 1)),
        h(Glyph, { id }),
        h(
          'span',
          { className: 'dpc-rowText' },
          editing === id
            ? h('input', {
                className: 'dpc-input dpc-nameInput',
                // autoFocus is enough: opening the editor is an explicit click.
                autoFocus: true,
                value: draft,
                placeholder: rawLabel,
                'aria-label': t('renameIt'),
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    finishRename(id);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelRename();
                  }
                },
                onBlur: () => finishRename(id),
              })
            : h(
                'span',
                { className: 'dpc-name', title: label === rawLabel ? rawLabel : label + ' · ' + rawLabel },
                label,
              ),
          editing === id ? null : h('code', { className: 'dpc-key', title: id }, id),
        ),
        h(
          'span',
          { className: 'dpc-tags' },
          locked ? h('span', { className: 'dpc-tag' }, t('locked')) : null,
          isHidden ? h('span', { className: 'dpc-tag' }, t('hiddenChip')) : null,
        ),
        groupsOf.length === 0
          ? null
          : h(GroupPicker, {
              id,
              groups: groupsOf,
              value: prefs.assign[id] || '',
              label: t('groupLabel'),
              ungrouped: t('ungrouped'),
              onPick: (next) => setGroup(id, next),
            }),
        iconButton('edit', t('renameIt'), () => startRename(id), false, {
          'aria-pressed': editing === id ? 'true' : 'false',
        }),
        iconButton(
          isHidden ? 'eyeOff' : 'eye',
          locked ? t('lockedHint') : isHidden ? t('showIt') : t('hideIt'),
          () => toggleHidden(id),
          locked,
          { 'aria-pressed': isHidden ? 'false' : 'true', className: 'dpc-icon dpc-eye' },
        ),
      );
    });

    const groupRow = (group, index) => {
      const members = order.filter((id) => (prefs.assign[id] || '') === group.id);
      return h(
        'li',
        {
          key: group.id,
          className: 'dpc-group',
          ...dragProps(group.id, groupDrag, setGroupDrag, moveGroupBefore),
        },
        h('span', { className: 'dpc-grip', title: t('dragHint') }, h(Icon, { name: 'grip' })),
        h('span', { className: 'dpc-groupDot', 'aria-hidden': true }),
        h('input', {
          className: 'dpc-input',
          value: group.name,
          'aria-label': t('groupName'),
          onChange: (event) => renameGroup(group.id, event.target.value),
        }),
        h(
          'span',
          { className: 'dpc-groupActions' },
          h('span', { className: 'dpc-count' }, String(members.length)),
          iconButton('close', t('deleteGroup'), () => removeGroup(group.id), false),
        ),
      );
    };

    // The sidebar is the host's DOM, but the trade-off is the user's: this card
    // is the only place the guard, the cap and the fold switch are explained.
    const layoutOn = prefs.guard !== false;
    const foldingOn = prefs.collapse !== false;
    const bridgeOn = prefs.bridge !== false;
    const tagsOn = prefs.tags !== false;
    const capNow = typeof prefs.panelMax === 'number' ? prefs.panelMax : 45;
    const setLayout = (patch) => commit({ ...prefsNow(), ...patch });
    const layoutSwitch = (on, label, onClick) =>
      h(
        'button',
        {
          type: 'button',
          className: 'dpc-switch',
          role: 'switch',
          'aria-checked': on ? 'true' : 'false',
          'aria-label': label,
          onClick,
        },
        h('span', { className: 'dpc-switchKnob', 'aria-hidden': true }),
      );
    const layoutRow = (name, hint, control) =>
      h(
        'div',
        { className: 'dpc-layoutRow' },
        h(
          'div',
          { className: 'dpc-layoutText' },
          h('span', { className: 'dpc-layoutName' }, name),
          hint ? h('p', { className: 'dpc-note' }, hint) : null,
        ),
        control,
      );
    const layout = h(
      'section',
      { className: 'dpc-card dpc-layout' },
      h('h2', { className: 'dpc-cardTitle' }, t('layoutTitle')),
      h('p', { className: 'dpc-note' }, t('layoutHint')),
      layoutRow(
        t('layoutGuard'),
        t('layoutGuardHint'),
        layoutSwitch(layoutOn, t('layoutGuard'), () => setLayout({ guard: !layoutOn })),
      ),
      layoutRow(
        t('layoutCollapse'),
        t('layoutCollapseHint'),
        layoutSwitch(foldingOn, t('layoutCollapse'), () => setLayout({ collapse: !foldingOn })),
      ),
      // The switch is the only way back for a reader who does not want the
      // extra rows: turning it off also disposes the registrations, not just
      // the display, so the host list and this page agree.
      layoutRow(
        t('layoutBridge'),
        t('layoutBridgeHint'),
        layoutSwitch(bridgeOn, t('layoutBridge'), () => setLayout({ bridge: !bridgeOn })),
      ),
      layoutRow(
        t('layoutTags'),
        t('layoutTagsHint'),
        layoutSwitch(tagsOn, t('layoutTags'), () => setLayout({ tags: !tagsOn })),
      ),
      layoutRow(
        t('layoutMax'),
        null,
        h(
          'div',
          { className: 'dpc-segment', role: 'group', 'aria-label': t('layoutMax') },
          [35, 45, 55, 0].map((value) =>
            h(
              'button',
              {
                key: String(value),
                type: 'button',
                className: value === capNow ? 'dpc-segmentBtn dpc-segmentBtn--on' : 'dpc-segmentBtn',
                'aria-pressed': value === capNow ? 'true' : 'false',
                disabled: !layoutOn,
                onClick: () => setLayout({ panelMax: value }),
              },
              value === 0 ? t('layoutMaxNone') : value + 'vh',
            ),
          ),
        ),
      ),
      layoutOn && groupsOf.length > 1
        ? h(
            'div',
            { className: 'dpc-layoutActions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dpc-link',
                onClick: () => setLayout({ collapsed: groupsOf.map((group) => group.id) }),
              },
              t('layoutCollapseAll'),
            ),
            h(
              'button',
              { type: 'button', className: 'dpc-link', onClick: () => setLayout({ collapsed: [] }) },
              t('layoutExpandAll'),
            ),
          )
        : null,
    );

    const groups =
      groupsOf.length === 0
        ? h(
            'section',
            { className: 'dpc-card dpc-empty' },
            h('p', { className: 'dpc-emptyTitle' }, t('noGroups')),
            h(
              'button',
              { type: 'button', className: 'dpc-link', onClick: addGroup },
              t('newGroup'),
            ),
          )
        : h(
            'section',
            { className: 'dpc-section' },
            h(
              'div',
              { className: 'dpc-sectionHead' },
              h('h2', { className: 'dpc-sectionTitle' }, t('groupsTitle')),
              h(
                'button',
                { type: 'button', className: 'dpc-link', onClick: addGroup },
                t('newGroup'),
              ),
            ),
            h('p', { className: 'dpc-note' }, t('groupsHint')),
            h('ul', { className: 'dpc-groups' }, groupsOf.map(groupRow)),
          );

    const diagnostics = engine ? engine.diagnostics() : null;
    const diagRow = (term, value, mono) =>
      [h('dt', { key: 't' }, term), h('dd', { key: 'd', className: mono ? 'dpc-mono' : undefined }, value)];
    const diag = h(
      'details',
      { className: 'dpc-diag' },
      h('summary', { className: 'dpc-diagSummary' }, t('diagTitle')),
      h(
        'dl',
        { className: 'dpc-diagList' },
        diagRow(t('diagList'), diagnostics && diagnostics.found ? `${t('diagFound')} · ${diagnostics.listClass || '—'}` : t('diagMissing'), true),
        diagRow(t('diagRows'), String(diagnostics ? diagnostics.rows : 0), true),
        diagRow(t('diagMapped'), String(diagnostics ? diagnostics.mapped : 0), true),
        diagRow(t('diagSource'), String(entries.length), true),
        diagRow(t('diagPrefs'), (state.diag && state.diag.prefsSource) || '—', true),
        diagRow(t('diagFile'), (state.diag && state.diag.hostFile) || '—', true),
        diagRow(t('diagOrigin'), (state.diag && state.diag.href) || '—', true),
        diagRow(t('diagAt'), diagnostics && diagnostics.at ? new Date(diagnostics.at).toLocaleTimeString() : t('diagNone'), true),
        diagRow(t('diagHostRev'), (state.inventory && state.inventory.rev) || '—', true),
        diagRow(t('diagBootRev'), (state.inventory && state.inventory.bootRev) || '—', true),
        diagRow(t('diagMissingIds'), (state.inventory && (state.inventory.missing || []).join(', ')) || t('diagNone'), true),
        diagRow(
          t('diagMissingStuck'),
          state.inventory && state.inventory.repeated ? t('diagYes') : t('diagNo'),
          true,
        ),
        diagRow(t('diagBridge'), String(bridgeState.entries.size), true),
        diagnostics && diagnostics.error ? h('dt', { key: 'et' }, 'error') : null,
        diagnostics && diagnostics.error
          ? h('dd', { key: 'ed', className: 'dpc-error' }, diagnostics.error)
          : null,
      ),
    );

    return h(
      'div',
      { className: inSection ? 'dpc-root dpc-root--flush' : 'dpc-root' },
      h(
        'div',
        { className: inSection ? 'dpc-page dpc-page--flush' : 'dpc-page' },
        head,
        notice,
        auto,
        layout,
        order.length === 0
          ? h(
              'section',
              { className: 'dpc-card dpc-empty' },
              h('p', { className: 'dpc-emptyTitle' }, t('empty')),
              h('button', { type: 'button', className: 'dpc-link', onClick: resetAll }, t('reset')),
            )
          : h('ul', { className: 'dpc-list' }, rows),
        groups,
        diag,
      ),
    );
  }

  // Settings shows the manager itself. Sending the reader to another screen to
  // do the work they came here for is a detour nobody asked for.
  function SettingsEntry() {
    return h('div', { className: 'dpc-settingsBody' }, h(PanelManager, { variant: 'section' }));
  }

  /* ------------------------------------------------------------------ css */

  const PANEL_CSS = `
    /* Page frame: scrolling lives on the page, the gutter on the content column. */
    .dpc-root{position:relative;height:100%;min-height:0;overflow-y:auto;overflow-x:hidden;padding:calc(28px + var(--dsh-frame-top-clearance,0px)) 0 32px;box-sizing:border-box;color:var(--dsw-alias-label-primary,#8a8a8a);font-size:13px;line-height:20px;font-variant-numeric:tabular-nums}
    .dpc-root *{box-sizing:border-box}
    .dpc-root :focus-visible{outline:2px solid var(--dsw-focus-ring-color,rgba(127,127,127,.65));outline-offset:2px}
    .dpc-page{container-type:inline-size;display:flex;flex-direction:column;gap:24px;width:min(960px,100%);min-width:0;margin-inline:auto;animation:dpc-in 180ms cubic-bezier(.16,1,.3,1) both}
    @keyframes dpc-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

    .dpc-head{display:flex;flex-direction:column;gap:6px}
    .dpc-headLine{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
    .dpc-meta{display:flex;align-items:baseline;gap:8px;margin:0;min-width:0;overflow:hidden;white-space:nowrap}
    .dpc-title{margin:0;font-size:16px;font-weight:600;line-height:24px;letter-spacing:-.01em;color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-lede{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));overflow:hidden;text-overflow:ellipsis}
    .dpc-sepText{flex:none;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.6))}
    .dpc-toolbarActions{display:flex;align-items:center;gap:4px}
    .dpc-count{margin:0;flex:none;font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));white-space:nowrap}
    .dpc-link{appearance:none;border:0;background:transparent;padding:4px 8px;border-radius:var(--dsw-radius-sm,6px);font:inherit;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95));cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1),color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-link:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-link:disabled{opacity:.4;cursor:default}

    .dpc-card{padding:16px;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.20));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-settings-card-fill,rgba(127,127,127,.06))}
    .dpc-cardTitle{margin:0;font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-note{margin:4px 0 0;max-width:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}
    .dpc-notice{display:flex;align-items:center;gap:16px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.18));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-l2,rgba(127,127,127,.08))}
    .dpc-noticeText{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
    .dpc-noticeTitle{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#ececf1)}
    .dpc-notice .dpc-note{margin:0}
    .dpc-noticeAction{appearance:none;flex:none;padding:4px 10px;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary,#ececf1);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
    .dpc-noticeAction:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}
    .dpc-noticeClose{appearance:none;flex:none;display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1),color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-noticeClose:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#ececf1)}
    .dpc-auto{display:flex;flex-direction:column;gap:8px}
    .dpc-autoMain{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .dpc-autoText{display:flex;align-items:baseline;gap:8px;min-width:0;overflow:hidden}
    .dpc-autoText .dpc-cardTitle{flex:none;white-space:nowrap}
    .dpc-inlineNote{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dpc-autoActions{display:flex;flex:none;align-items:center;gap:8px}
    .dpc-status{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95))}
    .dpc-status[data-error="true"]{color:var(--dsw-alias-state-error-primary,#b45454)}

    .dpc-switch{position:relative;flex:none;appearance:none;width:36px;height:20px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-bg-l3,rgba(127,127,127,.24));cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary,#5865f2)}
    .dpc-switchKnob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-inverted,#8a8a8a);transition:transform 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-switch[aria-checked="true"] .dpc-switchKnob{transform:translateX(16px)}

    .dpc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-width:0}
    .dpc-row{display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 12px;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.20));border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-settings-card-fill,rgba(127,127,127,.06));transition:background-color 120ms cubic-bezier(.16,1,.3,1),border-color 120ms cubic-bezier(.16,1,.3,1),opacity 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.28))}
    .dpc-row:focus-within{border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.32))}
    .dpc-row[data-dragging="true"],.dpc-group[data-dragging="true"]{opacity:.45}
    .dpc-row[data-over="true"],.dpc-group[data-over="true"]{border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.32));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.10))}
    .dpc-grip{cursor:grab}
    .dpc-grip:active{cursor:grabbing}
    .dpc-row[data-hidden="true"]{opacity:.55}
    .dpc-row[data-hidden="true"] .dpc-name{color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}
    .dpc-row[data-locked="true"]{background:var(--dsw-alias-bg-l2,rgba(127,127,127,.10))}
    .dpc-grip{display:inline-flex;flex:none;user-select:none;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.6));cursor:grab}
    .dpc-grip:active{cursor:grabbing}
    .dpc-pos{flex:none;min-width:16px;font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px;text-align:right;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.7))}
    .dpc-glyph{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.9))}
    .dpc-glyph:empty::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.4}
    .dpc-rowText{display:flex;flex:1 1 auto;flex-direction:row;align-items:baseline;gap:8px;min-width:0}
    .dpc-name{font-size:13px;font-weight:500;line-height:18px;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dpc-nameInput{flex:1 1 120px;max-width:320px;font-size:13px;line-height:18px}
    .dpc-key{font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.7));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dpc-tags{display:flex;flex:none;align-items:center;gap:8px}
    .dpc-tag{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));white-space:nowrap}
    .dpc-icon{appearance:none;display:inline-flex;flex:none;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.9));cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1),color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-icon:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-icon:disabled{opacity:.3;cursor:default}
    .dpc-ico{display:block}

    .dpc-picker{position:relative;display:flex;flex:none}
    .dpc-pickerBtn{appearance:none;display:inline-flex;align-items:center;gap:8px;height:24px;max-width:144px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-l2,rgba(127,127,127,.10));color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95));font:inherit;font-size:12px;line-height:16px;cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1),border-color 120ms cubic-bezier(.16,1,.3,1),color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-pickerBtn:hover,.dpc-picker[data-open="true"] .dpc-pickerBtn{border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.32));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-pickerText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dpc-caret{flex:none;width:6px;height:6px;margin-top:-2px;border-right:1.2px solid currentColor;border-bottom:1.2px solid currentColor;transform:rotate(45deg);opacity:.7;transition:transform 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-picker[data-open="true"] .dpc-caret{margin-top:2px;transform:rotate(225deg)}
    /* Opaque popover surface: --dsw-alias-bg-layer-2 is the host's own elevated
       layer, so the menu never lets the card behind it show through. */
    .dpc-menu{position:absolute;z-index:50;top:calc(100% + 4px);right:0;display:flex;flex-direction:column;gap:2px;min-width:144px;max-width:240px;padding:4px;background-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#1f1f1f));border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));border-radius:var(--dsw-radius-md,8px);box-shadow:0 8px 24px rgba(0,0,0,.28)}
    .dpc-option{appearance:none;border:0;padding:4px 8px;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95));font:inherit;font-size:12px;line-height:16px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dpc-option:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-option[aria-selected="true"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#5865f2) 16%,transparent);color:var(--dsw-alias-label-primary-bluish,#7f8fd8)}

    .dpc-section{display:flex;flex-direction:column;gap:8px;padding-top:16px;border-top:.5px solid var(--dsw-alias-separator-primary,rgba(127,127,127,.16))}
    .dpc-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .dpc-sectionTitle{margin:0;font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-groups{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
    .dpc-group{display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 12px 6px 8px;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.20));border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-settings-card-fill,rgba(127,127,127,.06));transition:background-color 120ms cubic-bezier(.16,1,.3,1),border-color 120ms cubic-bezier(.16,1,.3,1),opacity 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-group:hover{border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.28))}
    .dpc-groupDot{flex:none;width:8px;height:8px;border-radius:2px;background:var(--dsw-alias-state-business-primary,#5865f2);opacity:.8}
    .dpc-groupActions{display:flex;flex:none;align-items:center;gap:8px;margin-left:auto}
    .dpc-group .dpc-count{min-width:20px;text-align:right}
    .dpc-input{flex:0 1 auto;width:auto;min-width:2ch;max-width:320px;field-sizing:content;box-sizing:border-box;height:auto;padding:2px 8px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12));border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#8a8a8a);font:inherit;font-size:12px;line-height:18px;transition:border-color 120ms cubic-bezier(.16,1,.3,1),background-color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-group:hover .dpc-input{border-color:var(--dsw-alias-border-l2,rgba(127,127,127,.24))}
    .dpc-input:focus{outline:none;border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.36));background:var(--dsw-alias-bg-l2,rgba(127,127,127,.10))}

    .dpc-empty{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;max-width:520px;margin:0 auto;padding:56px 32px 40px;text-align:center}
    .dpc-emptyTitle{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}

    .dpc-diag{padding-top:16px;border-top:.5px solid var(--dsw-alias-separator-primary,rgba(127,127,127,.16))}
    .dpc-diagSummary{cursor:pointer;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}
    .dpc-diagSummary:hover{color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95))}
    .dpc-diagList{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);gap:4px 16px;margin:12px 0 0;font-size:11px;line-height:16px}
    .dpc-diagList dt{color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}
    .dpc-diagList dd{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95))}
    .dpc-mono{font-family:var(--dsw-font-family-code,ui-monospace,monospace)}
    .dpc-error{color:var(--dsw-alias-state-error-primary,#b45454)}

    /* Settings section: no page frame, no scroller — the dialog owns both. */
    .dpc-root--flush{height:auto;overflow:visible;padding:0}
    .dpc-page--flush{max-width:none;margin-inline:0;padding-inline:0;gap:16px;animation:none}
    .dpc-head--section .dpc-title{display:none}
    .dpc-head--section .dpc-headLine{justify-content:flex-end}
    .dpc-settingsBody{min-width:0}
    .dpc-primary{appearance:none;flex:none;border:0;padding:4px 12px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-primary-fill,#5865f2);color:var(--dsw-alias-label-primary-inverted,#8a8a8a);font:inherit;font-size:12px;font-weight:500;line-height:20px;cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-primary:hover{background:var(--dsw-alias-button-primary-hover,#4a56d8)}
    .dpc-ghost{appearance:none;flex:none;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));padding:3px 10px;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95));font:inherit;font-size:12px;line-height:20px;cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1),border-color 120ms cubic-bezier(.16,1,.3,1),color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-ghost:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.32));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-ghost:disabled{opacity:.4;cursor:default}

    /* Sidebar layout card: one row per switch, a segmented control for the cap.
       Hairlines only sit *between* rows: the first row has none, and the card
       hint keeps a real gap above it, so the small print never touches a line. */
    .dpc-layout{display:flex;flex-direction:column}
    .dpc-layout > .dpc-note{margin:6px 0 10px}
    .dpc-layoutRow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-top:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.14))}
    .dpc-layoutRow:first-of-type{padding-top:4px;border-top:0}
    .dpc-layoutText{display:flex;flex:1 1 auto;flex-direction:column;gap:3px;min-width:0}
    .dpc-layoutName{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95))}
    .dpc-layoutText .dpc-note{margin:0;line-height:17px}
    .dpc-layoutActions{display:flex;justify-content:flex-end;gap:4px;margin-top:12px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.14))}
    .dpc-layoutRow .dpc-switch,.dpc-layoutRow .dpc-segment{flex:none}
    .dpc-segment{display:inline-flex;flex:none;gap:2px;padding:2px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-fill-l2,rgba(127,127,127,.10))}
    .dpc-segmentBtn{appearance:none;border:0;background:transparent;padding:2px 8px;border-radius:4px;font:inherit;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1),color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-segmentBtn--on{background:var(--dsw-alias-settings-card-fill,rgba(127,127,127,.22));color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-segmentBtn:disabled{opacity:.4;cursor:default}

    /* A bridged settings page: its own bar, then the host-rendered section. */
    .dpc-bridgePage{gap:16px}
    .dpc-bridgeBar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:40px;padding-bottom:8px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.14))}
    .dpc-bridgeBack{display:inline-flex;align-items:center;gap:6px;margin-left:-8px}
    .dpc-bridgeBack .dpc-ico{width:14px;height:14px}
    .dpc-bridgeTags{display:flex;align-items:center;gap:8px;min-width:0}
    .dpc-bridgeTag{flex:none;padding:2px 8px;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));border-radius:999px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95))}
    .dpc-bridgeFrom{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}
    .dpc-bridgeBody{min-width:0}

    @media (max-width:1000px){
      /* Below the column width the frame becomes the gutter instead of pushing
         content past the window edge. */
      .dpc-page{width:100%;padding-inline:16px}
    }
    @media (max-width:760px){
      .dpc-row{flex-wrap:wrap;gap:8px}
      .dpc-rowText{flex:1 1 120px}
      .dpc-tags{order:8}
      .dpc-bridgeFrom{display:none}
    }
    /* The settings column is narrower than the page column: drop what is only
       nice-to-have there instead of letting the row overflow. */
    @container (max-width:640px){
      .dpc-hint{display:none}
      .dpc-pos{display:none}
      .dpc-key{display:none}
      .dpc-tags{display:none}
    }
    @media (prefers-reduced-motion:reduce){
      .dpc-page{animation:none}
      .dpc-row,.dpc-group,.dpc-icon,.dpc-link,.dpc-switch,.dpc-switchKnob,.dpc-pickerBtn,.dpc-caret,.dpc-input,.dpc-ghost,.dpc-primary{transition:none}
    }
  `;

  const SIDEBAR_CSS = `
    /* Fallback for a sidebar that grows past the window: the list scrolls
       instead of pushing the session area to zero height. The host ships
       flex:none there and overflow:hidden below it (see #12083). */
    [data-dpc-list]{flex:0 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;max-height:max(120px,var(--dpc-panellist-max,45vh));overscroll-behavior:contain;scrollbar-gutter:stable}
    [data-dpc-list][data-dpc-unbounded]{max-height:none}
    [data-dpc-list]>button{flex:none}
    [data-dpc-region]{flex:1 1 auto;min-height:min(120px,18vh)}

    /* The original name of a renamed row. It sits after the host title, pushed
       to the far right; the host row stays a single click target. */
    .dpc-nameTag{display:inline-block;flex:none;margin-left:auto;max-width:50%;height:16px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-l2,rgba(127,127,127,.14));color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8));font-size:10px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}

    .dpc-sep{display:flex;align-items:center;gap:6px;flex:none;padding:12px 8px 4px;font-size:11px;font-weight:500;line-height:14px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.78));white-space:nowrap;overflow:hidden;cursor:pointer;border-radius:var(--dsw-radius-sm,6px);user-select:none}
    .dpc-sep:hover{color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95))}
    .dpc-sep:focus-visible{outline:2px solid var(--dsw-focus-ring-color,rgba(127,127,127,.65));outline-offset:1px}
    .dpc-caret{flex:none;width:0;height:0;border-left:4px solid currentColor;border-top:3.5px solid transparent;border-bottom:3.5px solid transparent;opacity:.7;transform:rotate(90deg);transition:transform 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-sep[data-dpc-collapsed] .dpc-caret{transform:none}
    .dpc-sepLabel{min-width:0;overflow:hidden;text-overflow:ellipsis}
    .dpc-sepCount{flex:none;margin-left:2px;font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:10px;opacity:.72}
    .dpc-sep::after{content:'';flex:1;height:.5px;background:var(--dsw-alias-separator-primary,rgba(127,127,127,.16))}
    @media (prefers-reduced-motion:reduce){.dpc-caret{transition:none}}
  `;


  /* ----------------------------------------------------------------- entry */

  function applyInner(ctx) {
  try { traceBoot('apply'); } catch { /* ignore */ }
  try { if (document.title.startsWith('DPC ')) document.title = 'DPC ok'; } catch { /* ignore */ }
      ctxRef = ctx;

      // A hot-swapped Client half re-runs apply() without reloading the page, so
      // the previous sheet is still in <head>: drop it, or two revisions of the
      // same class names fight over every rule.
      for (const stale of Array.from(document.querySelectorAll('style[data-dpc-style]'))) stale.remove();
      const style = document.createElement('style');
      style.setAttribute('data-dpc-style', '');
      style.textContent = `${PANEL_CSS}\n${SIDEBAR_CSS}`;
      const attach = () => {
        if (document.head) document.head.appendChild(style);
      };
      if (document.head) attach();
      else document.addEventListener('DOMContentLoaded', attach, { once: true });

      ctx.effect(
        () => () => {
          style.remove();
          if (engineRef) engineRef.destroy();
          engineRef = null;
          ctxRef = null;
        },
        `${PACKAGE}: styles`,
      );

      const locale = optionalService(ctx, 'locale');
      if (locale && typeof locale.register === 'function') {
        ctx.effect(() => {
          try {
            return locale.register(NS, { zh: flatten('zh'), en: flatten('en') });
          } catch (error) {
            console.error(`[${PACKAGE}] locale registration failed`, error);
            return () => {};
          }
        }, `${PACKAGE}: dictionaries`);
      }

      engineRef = createEngine(ctx);
      engineRef.start();

      // Settings live in the Host's state directory, not in localStorage: the
      // renderer origin is a loopback port that changes on every restart.
      void hydratePrefs().catch(() => {});
      // A failed probe must never take the panel down with it: the page can load
      // before the Host answers, and that is a "cannot tell" case, not an error
      // worth throwing through `apply`.
      const probe = () => {
        try {
          void checkInventory().catch(() => {});
        } catch {
          /* the check is advisory; the panel works without it */
        }
      };
      probe();
      // Coming back to this window is a natural moment to re-check: a plugin may
      // have been toggled while the page sat in the background.
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('focus', probe);
        ctx.effect(() => () => window.removeEventListener('focus', probe), `${PACKAGE}: inventory`);
      }
      reportHost({ kind: 'boot', origin: locationMode(), agent: String(navigator.userAgent || '').slice(0, 120) });
      try {
        const boot = bootSnapshot();
        if (boot) {
          reportHost({ kind: 'boot-manifest', rev: boot.rev, entries: boot.ids.size, ids: Array.from(boot.ids).join(',') });
        }
      } catch {
        /* a dump must never break apply */
      }
      try {
        dumpPageLog('boot');
        dumpNet('boot');
        try {
          const slotsService = optionalService(ctx, 'slots');
          dumpSlots(slotsService, 'boot');
          if (slotsService && typeof slotsService.subscribe === 'function') {
            ctx.effect(
              () => slotsService.subscribe('sidebar.panellist', () => dumpSlots(slotsService, 'change')),
              `${PACKAGE}: slotwatch`,
            );
          }
          for (const delay of [8000, 20000, 45000]) {
            setTimeout(() => { dumpNet(`t${delay}`); dumpSlots(slotsService, `t${delay}`); }, delay);
          }
        } catch { /* a dump must never break apply */ }
        for (const delay of [8000, 20000, 45000]) {
          setTimeout(() => dumpPageLog(`t${delay}`), delay);
        }
      } catch {
        /* a dump must never break apply */
      }


      try { traceBoot('ready'); } catch { /* ignore */ }
      // A registration, a rename or a locale switch changes the list this plugin
      // lays out, so every one of them re-runs the pass.
      if (typeof ctx.slots.subscribe === 'function') {
        ctx.effect(
          () =>
            ctx.slots.subscribe(SLOT_PANELS, () => {
              if (engineRef) engineRef.schedule();
              scheduleBridgeSync();
            }),
          `${PACKAGE}: panel entries`,
        );
      }
      if (locale && typeof locale.subscribe === 'function') {
        ctx.effect(
          () =>
            locale.subscribe(() => {
              if (engineRef) engineRef.schedule();
              scheduleBridgeSync();
            }),
          `${PACKAGE}: labels`,
        );
      }

      ctx.slots.inject(SLOT_MAIN, () => {
        try {
          return ctx.slots.register({ name: SLOT_MAIN, key: PANEL_KEY, locale: NS }, PanelManager);
        } catch (error) {
          // A second instance of this module may hold the key already. Losing one entry is
          // survivable; letting the throw escape aborts the page's whole plugin start().
          console.warn(`[${PACKAGE}] duplicate "${SLOT_MAIN}" entry skipped`, error);
          return undefined;
        }
      });

      ctx.slots.inject(SLOT_SETTINGS, () => {
        try {
          return ctx.slots.register(
            { name: SLOT_SETTINGS, id: 'panel-control-settings', order: 60, locale: NS, label: () => t('panelTitle') },
            SettingsEntry,
          );
        } catch (error) {
          console.warn(`[${PACKAGE}] duplicate "${SLOT_SETTINGS}" entry skipped`, error);
          return undefined;
        }
      });

      // The entry lives in the very list it manages: it is registered last, and
      // the manager keeps it visible so the page stays reachable.
      ctx.slots.inject(SLOT_PANELS, () => {
        try {
          return ctx.slots.register(
            { name: SLOT_PANELS, id: PANEL_KEY, order: 90, locale: NS, label: () => t('panelTitle') },
            PanelIcon,
          );
        } catch (error) {
          console.warn(`[${PACKAGE}] duplicate "${SLOT_PANELS}" entry skipped`, error);
          return undefined;
        }
      });

      // A bridged page follows three registries: the settings sections it
      // mirrors, the panels it must not duplicate, and the locale that names
      // both. Each declaration is its own readiness signal, so the sync runs
      // once the slots exist and again on every later change.
      const kickBridge = () => {
        try {
          watchSettings();
          scheduleBridgeSync();
          scheduleBridgeRetries();
        } catch (error) {
          console.warn(`[${PACKAGE}] bridge scheduling failed`, error);
        }
      };
      try {
        // Re-install the watch on every declaration: before the slot exists
        // `subscribe` cannot observe the section registry, and a stale
        // subscription would miss the pages that register after us.
        ctx.slots.inject(SLOT_SETTINGS, () => {
          unwatchSettings();
          watchSettings();
          kickBridge();
        });
        ctx.slots.inject(SLOT_PANELS, kickBridge);
      } catch (error) {
        console.warn(`[${PACKAGE}] bridge slots unavailable`, error);
      }
      ctx.effect(() => () => disposeBridges(), `${PACKAGE}: bridge cleanup`);
      kickBridge();
      // Renames show the owning package; the first scan answers the current rows,
      // later bridge scans refresh the set when more settings pages register.
      void ensurePackages();
    try { window.__dpcApplied = true; } catch { /* ignore */ }
  }

  /**
   * True when this document already holds our sidebar entry, i.e. another instance of this module
   * applied first. Probing the slot table beats a window flag: a hot swap disposes the old instance
   * but keeps the window, so a flag would lock the replacement out.
   */
  function alreadyRegistered(ctx) {
    try {
      const entries = ctx.slots.entriesOfSlot(SLOT_MAIN) || [];
      return entries.some((entry) => {
        const options = entry && entry.options;
        const key = (options && options.key) || (entry && entry.key);
        return String(key || '') === PANEL_KEY;
      });
    } catch {
      return false;
    }
  }

  return {
    // `layout` is only read (never patched): the bridge's back button and its
    // selection fallback call the public selectPanel action.
    inject: ['slots', 'layout'],
    // Pure helpers the browser harness drives directly, without a Cordis context.
    testables: { createEngine, mapButtons, readEntries, normalize, sanitize, store, reorderList, applyInner, setCtx: (value) => { ctxRef = value; } },
    apply(ctx) {
      try {

        // The runner can lay this module into the page twice - once as its own startup script and
        // once inside a composed batch - so a second instance applies into the same slot table.
        // DSH throws on the duplicate key and aborts the whole start(), which is what removes every
        // plugin scheduled after us. Skipping the second copy keeps the batch alive.
        if (alreadyRegistered(ctx)) {
          try { traceBoot('apply-dup-skip'); } catch { /* ignore */ }
          reportHost({ kind: 'apply-skip', reason: 'this document already holds our slots' });
          return;
        }
        applyInner(ctx);
      } catch (error) {
        console.error(`[${PACKAGE}] apply failed`, error);
        reportHost({ kind: 'apply-failed', message: (error && error.message) || String(error) });
      }
    },
  };
}

try {
window.__ModuleLoader__.load({
  id: 'dsh-panel-control',
  factory(require) {
    try { traceBoot('factory'); } catch { /* ignore */ }
    try {
      return build(require);
    } catch (error) {
      // A throw here aborts the whole Web boot, so this half degrades to "absent".
      console.error('[dsh-panel-control] failed to build the client half', error);
      return { inject: [], apply() {} };
    }
  },
});
} catch (error) {
  // A second evaluation of the same build registers a factory that is already there; the loader
  // throws for it, and that throw is harmless (the first factory stays in place). A disable/enable
  // cycle removed the factory first, so this same call is how the plugin comes back.
  console.warn('[dsh-panel-control] the bundle was evaluated with its registration already present; keeping the first one', error);
}
})();
