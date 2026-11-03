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

function build(require) {
  const React = require('react');
  const h = React.createElement;

  const PACKAGE = 'dsh-panel-control';
  const NS = 'dsh-panel-control';
  const SLOT_PANELS = 'sidebar.panellist';
  const SLOT_MAIN = 'main';
  const SLOT_SETTINGS = 'settings.section';
  const PANEL_KEY = 'panel-control';
  const STORAGE_KEY = 'dsh.panel-control.v1';
  /** Host route that answers "file these entries into groups" (see index.js). */
  const RPC_CHANNEL = '/api';
  const RPC_ENDPOINT = 'dsh-panel-control/classify';
  /** Rows start at 100 so an unmanaged flex sibling stays at the very end. */
  const ORDER_START = 100;
  const ORDER_STEP = 10;
  /** Where unmanaged rows and the "More" launcher are pushed to. */
  const ORDER_UNMANAGED = 9000;
  /** Below this width the sidebar renders the icon rail, where headings do not fit. */
  const WIDE_MIN_WIDTH = 64;

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
    hint: {
      zh: '拖行首的把手排序；隐藏的入口仍留在列表里，随时可以放回来。',
      en: 'Drag the handle at the start of a row to reorder it; a hidden entry stays in this list and can come back at any time.',
    },
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
    diagSource: { zh: '入口来源', en: 'entry source' },
    diagNone: { zh: '—', en: '—' },
    diagPrefs: { zh: '设置来源', en: 'settings source' },
    diagFile: { zh: '设置文件', en: 'settings file' },
    diagOrigin: { zh: '页面来源', en: 'page origin' },
    openPanel: { zh: '打开面板管理', en: 'Open panel manager' },
    autoTitle: { zh: '自动分类', en: 'Auto classify' },
    autoHint: {
      zh: '让默认模型把入口分成 2–4 组，结果保存在本机。',
      en: 'The default model files the entries into 2-4 groups; the result stays on this machine.',
    },
    autoRunning: { zh: '正在分类…', en: 'Classifying…' },
    autoAgain: { zh: '重新分类', en: 'Classify again' },
    autoDone: { zh: '模型已分成 {n} 组（{m}）。', en: 'The model filed them into {n} groups ({m}).' },
    autoFiledNew: { zh: '已把 {n} 个新入口归入分组（{m}）。', en: 'Filed {n} new entries ({m}).' },
    autoFailed: { zh: '分类失败：{m}', en: 'Classification failed: {m}' },
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
    for (const [key, value] of Object.entries(TEXT)) dictionary[key] = value[language];
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
  });

  /** Keep only the shapes this plugin writes, so a hand-edited store cannot crash it. */
  function sanitize(raw) {
    const out = emptyPrefs();
    if (!raw || typeof raw !== 'object') return out;
    if (Array.isArray(raw.order)) {
      for (const id of raw.order) if (typeof id === 'string' && id !== '') out.order.push(id);
    }
    if (Array.isArray(raw.autoFiled)) {
      for (const id of raw.autoFiled) if (typeof id === 'string' && id !== '') out.autoFiled.push(id);
    }
    if (Array.isArray(raw.hidden)) {
      for (const id of raw.hidden) if (typeof id === 'string' && id !== '') out.hidden.push(id);
    }
    if (Array.isArray(raw.groups)) {
      for (const group of raw.groups) {
        if (!group || typeof group.id !== 'string' || group.id === '') continue;
        const name = typeof group.name === 'string' ? group.name.trim().slice(0, 40) : '';
        out.groups.push({ id: group.id, name: name || '—' });
      }
    }
    if (raw.assign && typeof raw.assign === 'object') {
      for (const [panelId, groupId] of Object.entries(raw.assign)) {
        if (typeof panelId !== 'string' || typeof groupId !== 'string' || groupId === '') continue;
        out.assign[panelId] = groupId;
      }
    }
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
      (prefs.autoFiled || []).length > 0 ||
      prefs.auto === true);

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
    }, 300);
  }

  function reportHost(detail) {
    void hostCall('report', { ...detail, href: String(locationMode()), at: Date.now() });
  }

  /** `location.href` minus any query, so one line says which origin we ran on. */
  function locationMode() {
    try {
      return window.location && window.location.origin ? window.location.origin : 'unknown-origin';
    } catch {
      return 'unknown-origin';
    }
  }

  const store = {
    state: {
      prefs: readLocalPrefs() || emptyPrefs(),
      entries: [],
      autoState: { status: 'idle', message: '', groups: 0 },
      diag: { prefsSource: 'local', href: 'unknown-origin', hostFile: '' },
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
  function createEngine(ctx) {
    let scheduled = false;
    let destroyed = false;
    let observer = null;
    let observing = false;
    let listEl = null;
    let signature = '';
    let pollTimer = null;

    const diag = { found: false, rows: 0, mapped: 0, at: 0, listClass: '', error: null };

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
          button = document.querySelector(`button[aria-label="${cssEscape(entry.label)}"]`);
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
     * Entry -> row button.
     *
     * Position is the primary key because both lists are sorted the same way and
     * a row button carries no id of its own; the accessible label is checked
     * first and used to repair a shifted position.
     */
    const mapButtons = (entries, buttons) => {
      const map = new Map();
      const used = new Set();
      const byLabel = new Map();
      for (const button of buttons) {
        const label = button.getAttribute('aria-label') || '';
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push(button);
      }
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const candidate = buttons[index];
        if (candidate && !used.has(candidate) && (candidate.getAttribute('aria-label') || '') === entry.label) {
          map.set(entry.id, candidate);
          used.add(candidate);
          continue;
        }
        const pool = byLabel.get(entry.label) || [];
        const hit = pool.find((button) => !used.has(button));
        if (hit) {
          map.set(entry.id, hit);
          used.add(hit);
          continue;
        }
        if (candidate && !used.has(candidate)) {
          map.set(entry.id, candidate);
          used.add(candidate);
        }
      }
      return map;
    };

    const makeSeparator = (name, order) => {
      const element = document.createElement('div');
      element.className = 'dpc-sep';
      element.setAttribute('data-dpc-sep', '');
      element.style.order = String(order);
      const label = document.createElement('span');
      label.className = 'dpc-sepLabel';
      label.textContent = name;
      element.appendChild(label);
      return element;
    };

    const pause = () => {
      if (observer && observing) {
        observer.disconnect();
        observing = false;
      }
    };

    const resume = () => {
      if (!observer || destroyed || observing) return;
      try {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style'],
        });
        observing = true;
      } catch {
        /* observing is an optimisation, not a requirement */
      }
    };

    const apply = () => {
      if (destroyed) return;
      const plan = readPlan();
      if (!sameEntries(store.state.entries, plan.entries)) setState({ entries: plan.entries });
      const list = findList(plan.entries);
      diag.found = Boolean(list);
      if (!list) {
        diag.rows = 0;
        diag.mapped = 0;
        diag.listClass = '';
        diag.at = Date.now();
        return;
      }
      diag.listClass = typeof list.className === 'string' ? list.className.split(/\s+/)[0] || '' : '';

      const nextSignature = JSON.stringify({
        blocks: plan.blocks,
        hidden: plan.hidden ? Array.from(plan.hidden).sort() : [],
        entries: plan.entries.map((entry) => entry.id + ':' + entry.label),
        wide: list.getBoundingClientRect().width >= WIDE_MIN_WIDTH,
      });
      const separatorsLeft = list.querySelectorAll('[data-dpc-sep]').length;
      if (nextSignature === signature && (separatorsLeft > 0 || plan.blocks.length <= 1)) {
        diag.at = Date.now();
        return;
      }
      signature = nextSignature;

      pause();
      try {
        const buttons = Array.from(list.querySelectorAll(':scope > button'));
        const wide = list.getBoundingClientRect().width >= WIDE_MIN_WIDTH;
        for (const node of Array.from(list.querySelectorAll('[data-dpc-sep]'))) node.remove();

        const map = mapButtons(plan.entries, buttons);
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
          const visible = block.ids.filter((id) => !plan.hidden.has(id) && map.has(id));
          if (visible.length === 0) continue;
          if (wide && block.name) {
            list.appendChild(makeSeparator(block.name, position));
            position += ORDER_STEP;
          }
          for (const id of visible) {
            const button = map.get(id);
            button.style.order = String(position);
            button.style.display = '';
            button.removeAttribute('data-dpc-hidden');
            button.setAttribute('data-dpc-group', block.name || '');
            position += ORDER_STEP;
          }
        }

        for (const id of plan.hidden) {
          const button = map.get(id);
          if (!button) continue;
          button.style.display = 'none';
          button.setAttribute('data-dpc-hidden', '');
        }

        // A row we could not map is left in place, but kept after every managed row.
        for (const button of buttons) {
          if (managed.has(button)) continue;
          button.style.order = '8500';
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

    const schedule = () => {
      if (scheduled || destroyed) return;
      scheduled = true;
      const run = () => {
        scheduled = false;
        apply();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
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
      listEl = null;
    };

    return { apply, schedule, start, destroy, diagnostics: () => ({ ...diag }), refresh: schedule };
  }

  /* --------------------------------------------------------------- actions */

  function commit(nextPrefs) {
    const safe = sanitize(nextPrefs);
    store.state = { ...store.state, prefs: safe };
    writeLocalPrefs(safe);
    scheduleSaveToHost();
    emit();
    if (engineRef) engineRef.schedule();
  }

  function setDiag(patch) {
    setState({ diag: { ...(store.state.diag || {}), ...patch } });
  }

  /** Pull the Host copy of the settings over the browser cache. */
  async function hydratePrefs() {
    const remote = await hostCall('load', {});
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
    const labelOf = new Map((store.state.entries || []).map((entry) => [entry.id, entry.label]));
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
      }
      count += 1;
    }
    // A section this run invented and left empty is not worth keeping.
    for (const id of created) {
      if (Object.values(assign).some((groupId) => groupId === id)) continue;
      const at = groups.findIndex((group) => group.id === id);
      if (at >= 0) groups.splice(at, 1);
    }
    // Remember every entry this switch has already looked at, so a restart or a
    // new session does not re-file (and therefore re-shuffle) the same rows.
    const filed = new Set(prefs.autoFiled || []);
    for (const entry of entries) filed.add(entry.id);
    commit({ ...prefsNow(), groups, assign, autoFiled: Array.from(filed) });
    setAuto({
      status: 'done',
      groups: count,
      message: fill(t(all ? 'autoDone' : 'autoFiledNew'), { n: count, m: (value && value.model) || 'model' }),
      at: Date.now(),
    });
  }

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
      if (!result || result.ok !== true) {
        const message = result && result.error && result.error.message ? result.error.message : 'unknown error';
        throw new Error(message);
      }
      reportHost({ kind: 'classified', mode: mode === 'all' ? 'all' : 'new', groups: (result.value && result.value.groups || []).length });
      applyClassification(result.value, mode === 'all' ? 'all' : 'new');
    } catch (error) {
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

  function PanelManager() {
    const state = useStore();
    const prefs = state.prefs;
    const entries = state.entries;
    const engine = engineRef;
    const dragRef = React.useRef(null);
    const [rowDrag, setRowDrag] = React.useState({ from: null, over: null });
    const [groupDrag, setGroupDrag] = React.useState({ from: null, over: null });

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
      if (auto.status === 'error' && Date.now() - (auto.at || 0) < 60000) return;
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
      }, 1500);
      return () => clearTimeout(timer);
    }, [prefs.auto, prefs.autoFiled, entries.length, state.autoState && state.autoState.status]);

    const order = normalize(prefs, entries);
    const labelOf = new Map(entries.map((entry) => [entry.id, entry.label]));
    const hidden = new Set(prefs.hidden || []);
    const groupsOf = prefs.groups || [];
    const autoOn = prefs.auto === true;
    const autoState = state.autoState || { status: 'idle', message: '', groups: 0 };

    const head = h(
      'header',
      { className: 'dpc-head' },
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
      const isHidden = hidden.has(id);
      const locked = id === PANEL_KEY;
      return h(
        'li',
        {
          key: id,
          className: 'dpc-row',
          'data-hidden': isHidden ? 'true' : 'false',
          'data-locked': locked ? 'true' : 'false',
          draggable: true,
          'data-dragging': rowDrag.from === id ? 'true' : 'false',
          'data-over': rowDrag.over === id && rowDrag.from !== id ? 'true' : 'false',
          onDragStart: (event) => {
            dragRef.current = id;
            setRowDrag({ from: id, over: null });
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', id);
            } catch {
              /* older engines refuse writes; the ref already holds the id */
            }
          },
          onDragOver: (event) => {
            event.preventDefault();
            setRowDrag((prev) => (prev.over === id ? prev : { ...prev, over: id }));
          },
          onDrop: (event) => {
            event.preventDefault();
            const from = dragRef.current;
            dragRef.current = null;
            setRowDrag({ from: null, over: null });
            if (from && from !== id) moveBefore(from, id);
          },
          onDragEnd: () => {
            dragRef.current = null;
            setRowDrag({ from: null, over: null });
          },
        },
        h('span', { className: 'dpc-grip', title: t('dragHint') }, h(Icon, { name: 'grip' })),
        h('span', { className: 'dpc-pos' }, String(position + 1)),
        h(Glyph, { id }),
        h(
          'span',
          { className: 'dpc-rowText' },
          h('span', { className: 'dpc-name', title: label }, label),
          h('code', { className: 'dpc-key', title: id }, id),
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
          draggable: true,
          'data-dragging': groupDrag.from === group.id ? 'true' : 'false',
          'data-over': groupDrag.over === group.id && groupDrag.from !== group.id ? 'true' : 'false',
          onDragStart: (event) => {
            setGroupDrag({ from: group.id, over: null });
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', group.id);
            } catch {
              /* older engines refuse writes */
            }
          },
          onDragOver: (event) => {
            event.preventDefault();
            setGroupDrag((prev) => (prev.over === group.id ? prev : { ...prev, over: group.id }));
          },
          onDrop: (event) => {
            event.preventDefault();
            const from = groupDrag.from;
            setGroupDrag({ from: null, over: null });
            if (from && from !== group.id) moveGroupBefore(from, group.id);
          },
          onDragEnd: () => {
            setGroupDrag({ from: null, over: null });
          },
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
        diagnostics && diagnostics.error ? h('dt', { key: 'et' }, 'error') : null,
        diagnostics && diagnostics.error
          ? h('dd', { key: 'ed', className: 'dpc-error' }, diagnostics.error)
          : null,
      ),
    );

    return h(
      'div',
      { className: 'dpc-root' },
      h(
        'div',
        { className: 'dpc-page' },
        head,
        auto,
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

  function SettingsEntry(props) {
    const close = props && typeof props.close === 'function' ? props.close : null;
    const open = () => {
      try {
        if (ctxRef && ctxRef.layout && typeof ctxRef.layout.selectPanel === 'function') {
          ctxRef.layout.selectPanel(PANEL_KEY);
        }
      } catch {
        /* the sidebar row is the other door */
      }
      if (close) close();
    };
    return h(
      'div',
      { className: 'dpc-settings' },
      h(
        'div',
        { className: 'dpc-settingsText' },
        h('div', { className: 'dpc-settingsTitle' }, t('panelTitle')),
        h('p', { className: 'dpc-settingsDesc' }, t('subtitle')),
      ),
      h('button', { type: 'button', className: 'dpc-primary', onClick: open }, t('openPanel')),
    );
  }

  /* ------------------------------------------------------------------ css */

  const PANEL_CSS = `
    /* Page frame: scrolling lives on the page, the gutter on the content column. */
    .dpc-root{position:relative;height:100%;min-height:0;overflow-y:auto;overflow-x:hidden;padding:calc(28px + var(--dsh-frame-top-clearance,0px)) 0 32px;box-sizing:border-box;color:var(--dsw-alias-label-primary,#8a8a8a);font-size:13px;line-height:20px;font-variant-numeric:tabular-nums}
    .dpc-root *{box-sizing:border-box}
    .dpc-root :focus-visible{outline:2px solid var(--dsw-focus-ring-color,rgba(127,127,127,.65));outline-offset:2px}
    .dpc-page{container-type:inline-size;display:flex;flex-direction:column;gap:24px;width:100%;min-width:0;padding-left:max(max(16px,min(4vw,48px)),50% - 480px);padding-right:max(max(16px,min(4vw,48px)),50% - 480px);animation:dpc-in 180ms cubic-bezier(.16,1,.3,1) both}
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
    .dpc-auto{display:flex;flex-direction:column;gap:8px}
    .dpc-autoMain{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .dpc-autoText{display:flex;align-items:baseline;gap:8px;min-width:0;overflow:hidden}
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
    .dpc-menu{position:absolute;z-index:50;top:calc(100% + 4px);right:0;display:flex;flex-direction:column;gap:2px;min-width:144px;max-width:240px;padding:4px;background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.18));border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));border-radius:var(--dsw-radius-md,8px);box-shadow:0 8px 24px rgba(0,0,0,.28)}
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

    .dpc-settings{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0}
    .dpc-settingsText{min-width:0}
    .dpc-settingsTitle{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-settingsDesc{margin:4px 0 0;max-width:62ch;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.8))}
    .dpc-primary{appearance:none;flex:none;border:0;padding:4px 12px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-primary-fill,#5865f2);color:var(--dsw-alias-label-primary-inverted,#8a8a8a);font:inherit;font-size:12px;font-weight:500;line-height:20px;cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-primary:hover{background:var(--dsw-alias-button-primary-hover,#4a56d8)}
    .dpc-ghost{appearance:none;flex:none;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));padding:3px 10px;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,rgba(127,127,127,.95));font:inherit;font-size:12px;line-height:20px;cursor:pointer;transition:background-color 120ms cubic-bezier(.16,1,.3,1),border-color 120ms cubic-bezier(.16,1,.3,1),color 120ms cubic-bezier(.16,1,.3,1)}
    .dpc-ghost:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.32));background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,#8a8a8a)}
    .dpc-ghost:disabled{opacity:.4;cursor:default}

    @media (max-width:760px){
      .dpc-row{flex-wrap:wrap;gap:8px}
      .dpc-rowText{flex:1 1 120px}
      .dpc-tags{order:8}
      .dpc-page{padding-left:16px;padding-right:16px}
    }
    @media (prefers-reduced-motion:reduce){
      .dpc-page{animation:none}
      .dpc-row,.dpc-group,.dpc-icon,.dpc-link,.dpc-switch,.dpc-switchKnob,.dpc-pickerBtn,.dpc-caret,.dpc-input,.dpc-ghost,.dpc-primary{transition:none}
    }
  `;

  const SIDEBAR_CSS = `
    .dpc-sep{display:flex;align-items:center;gap:8px;flex:none;padding:12px 8px 4px;font-size:11px;font-weight:500;line-height:14px;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.78));white-space:nowrap;overflow:hidden;pointer-events:none}
    .dpc-sepLabel{min-width:0;overflow:hidden;text-overflow:ellipsis}
    .dpc-sep::after{content:'';flex:1;height:.5px;background:var(--dsw-alias-separator-primary,rgba(127,127,127,.16))}
  `;


  /* ----------------------------------------------------------------- entry */

  function applyInner(ctx) {
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
      void hydratePrefs();
      reportHost({ kind: 'boot', origin: locationMode(), agent: String(navigator.userAgent || '').slice(0, 120) });


      // A registration, a rename or a locale switch changes the list this plugin
      // lays out, so every one of them re-runs the pass.
      if (typeof ctx.slots.subscribe === 'function') {
        ctx.effect(() => ctx.slots.subscribe(SLOT_PANELS, () => engineRef && engineRef.schedule()), `${PACKAGE}: panel entries`);
      }
      if (locale && typeof locale.subscribe === 'function') {
        ctx.effect(() => locale.subscribe(() => engineRef && engineRef.schedule()), `${PACKAGE}: labels`);
      }

      ctx.slots.inject(SLOT_MAIN, () =>
        ctx.slots.register({ name: SLOT_MAIN, key: PANEL_KEY, locale: NS }, PanelManager),
      );

      ctx.slots.inject(SLOT_SETTINGS, () =>
        ctx.slots.register(
          { name: SLOT_SETTINGS, id: 'panel-control-settings', order: 60, locale: NS, label: () => t('panelTitle') },
          SettingsEntry,
        ),
      );

      // The entry lives in the very list it manages: it is registered last, and
      // the manager keeps it visible so the page stays reachable.
      ctx.slots.inject(SLOT_PANELS, () =>
        ctx.slots.register(
          { name: SLOT_PANELS, id: PANEL_KEY, order: 90, locale: NS, label: () => t('panelTitle') },
          PanelIcon,
        ),
      );
  }

  return {
    inject: ['slots'],
    // Pure helpers the browser harness drives directly, without a Cordis context.
    testables: { createEngine, readEntries, normalize, sanitize, store, reorderList, applyInner, setCtx: (value) => { ctxRef = value; } },
    apply(ctx) {
      try {
        applyInner(ctx);
      } catch (error) {
        console.error(`[${PACKAGE}] apply failed`, error);
        reportHost({ kind: 'apply-failed', message: (error && error.message) || String(error) });
      }
    },
  };
}

window.__ModuleLoader__.load({
  id: 'dsh-panel-control',
  factory(require) {
    try {
      return build(require);
    } catch (error) {
      // A throw here aborts the whole Web boot, so this half degrades to "absent".
      console.error('[dsh-panel-control] failed to build the client half', error);
      return { inject: [], apply() {} };
    }
  },
});
