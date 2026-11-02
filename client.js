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
    moveUp: { zh: '上移', en: 'Move up' },
    moveDown: { zh: '下移', en: 'Move down' },
    hideIt: { zh: '隐藏', en: 'Hide' },
    showIt: { zh: '显示', en: 'Show' },
    hiddenChip: { zh: '已隐藏', en: 'hidden' },
    groupLabel: { zh: '分组', en: 'Group' },
    ungrouped: { zh: '未分组', en: 'Ungrouped' },
    groupsTitle: { zh: '分组', en: 'Groups' },
    groupsHint: {
      zh: '分组会在侧栏导航区里显示成带标题的分隔线，同一组的入口会被排在一起；侧栏折叠成图标条时不显示标题。',
      en: 'A group renders as a titled separator in the sidebar, and its entries are kept together. Headings are hidden while the sidebar is collapsed to the icon rail.',
    },
    newGroup: { zh: '新建分组', en: 'New group' },
    newGroupName: { zh: '新分组', en: 'New group' },
    noGroups: { zh: '还没有分组。新建一个分组，再把它分配给下面的入口。', en: 'No groups yet. Create one, then assign entries to it.' },
    groupName: { zh: '分组名称', en: 'Group name' },
    deleteGroup: { zh: '删除分组', en: 'Delete group' },
    countFmt: { zh: '{n} 个入口 · {h} 个已隐藏', en: '{n} entries · {h} hidden' },
    hint: {
      zh: '拖动行可以调整顺序，也可以用 ↑ ↓ 逐格移动。隐藏的入口仍然留在列表里，随时可以放回来。',
      en: 'Drag a row to reorder it, or use ↑ ↓ to move it one step. A hidden entry stays in this list and can be brought back at any time.',
    },
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
    openPanel: { zh: '打开面板管理', en: 'Open panel manager' },
    resetDone: { zh: '已恢复默认顺序与可见性。', en: 'Order and visibility were reset.' },
  };

  let ctxRef = null;
  let engineRef = null;

  /** The live UI language, read from the Client locale service at call time. */
  function activeLang() {
    try {
      const service = ctxRef && ctxRef.locale;
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

  const emptyPrefs = () => ({ order: [], hidden: [], groups: [], assign: {} });

  /** Keep only the shapes this plugin writes, so a hand-edited store cannot crash it. */
  function sanitize(raw) {
    const out = emptyPrefs();
    if (!raw || typeof raw !== 'object') return out;
    if (Array.isArray(raw.order)) {
      for (const id of raw.order) if (typeof id === 'string' && id !== '') out.order.push(id);
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
    return out;
  }

  function loadPrefs() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return sanitize(raw ? JSON.parse(raw) : null);
    } catch {
      return emptyPrefs();
    }
  }

  function savePrefs(prefs) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode or a full quota: the layout still applies for this session */
    }
  }

  const store = { state: { prefs: loadPrefs(), entries: [] }, listeners: new Set() };

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

  function groupName(prefs, groupId) {
    if (!groupId) return '';
    const group = (prefs.groups || []).find((entry) => entry.id === groupId);
    return group ? group.name : '';
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

    const diag = { found: false, rows: 0, mapped: 0, at: 0, listClass: '', error: null };

    const readPlan = () => {
      const entries = readEntries(ctx.slots);
      const prefs = store.state.prefs;
      const hidden = new Set(prefs.hidden || []);
      const blocks = [];
      const byGroup = new Map();
      for (const id of normalize(prefs, entries)) {
        const groupId = prefs.assign[id] || '';
        let block = byGroup.get(groupId);
        if (!block) {
          block = { id: groupId, name: groupName(prefs, groupId), ids: [] };
          byGroup.set(groupId, block);
          blocks.push(block);
        }
        block.ids.push(id);
      }
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
      // The sidebar mounts after this plugin's apply, so retry while it settles.
      for (const delay of [0, 120, 400, 1000, 2500]) setTimeout(schedule, delay);
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
    savePrefs(safe);
    emit();
    if (engineRef) engineRef.schedule();
  }

  const prefsNow = () => store.state.prefs;
  const orderNow = () => normalize(prefsNow(), store.state.entries);

  function moveBy(id, delta) {
    const order = orderNow().slice();
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    commit({ ...prefsNow(), order });
  }

  function moveBefore(fromId, targetId) {
    const order = orderNow().slice();
    const from = order.indexOf(fromId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
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

  function removeGroup(groupId) {
    const prefs = prefsNow();
    const groups = (prefs.groups || []).filter((group) => group.id !== groupId);
    const assign = { ...(prefs.assign || {}) };
    for (const [panelId, assigned] of Object.entries(assign)) {
      if (assigned === groupId) delete assign[panelId];
    }
    commit({ ...prefs, groups, assign });
  }

  /* ------------------------------------------------------------ components */

  const ICON_PATHS = [
    'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0',
  ];

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
          value = slots.renderSlot(SLOT_PANELS, { size: 15, active: false }, { only: props.id });
        }
      } catch {
        value = null;
      }
      setNode(value === undefined ? null : value);
    }, [props.id]);
    return h('span', { className: 'dpc-glyph', 'aria-hidden': true }, node);
  }

  function PanelManager() {
    const state = useStore();
    const prefs = state.prefs;
    const entries = state.entries;
    const engine = engineRef;
    const dragRef = React.useRef(null);

    React.useEffect(() => {
      if (engine) engine.refresh();
    }, [engine]);

    const order = normalize(prefs, entries);
    const labelOf = new Map(entries.map((entry) => [entry.id, entry.label]));
    const hidden = new Set(prefs.hidden || []);

    const head = h(
      'header',
      { className: 'dpc-head' },
      h(
        'div',
        { className: 'dpc-headText' },
        h('h2', { className: 'dpc-title' }, t('panelTitle')),
        h('p', { className: 'dpc-sub' }, t('subtitle')),
      ),
      h(
        'div',
        { className: 'dpc-headActions' },
        h('button', { type: 'button', className: 'dpc-ghost', onClick: sortByName }, t('sortByName')),
        h(
          'button',
          { type: 'button', className: 'dpc-ghost', onClick: showAll, disabled: (prefs.hidden || []).length === 0 },
          t('showAll'),
        ),
        h('button', { type: 'button', className: 'dpc-ghost', onClick: resetAll }, t('reset')),
      ),
    );

    const meta = h(
      'div',
      { className: 'dpc-meta' },
      h('span', { className: 'dpc-count' }, fill(t('countFmt'), { n: order.length, h: hidden.size })),
      h('span', { className: 'dpc-hintInline' }, t('hint')),
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
          onDragStart: (event) => {
            dragRef.current = id;
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', id);
            } catch {
              /* older engines refuse writes; the ref already holds the id */
            }
          },
          onDragOver: (event) => {
            event.preventDefault();
          },
          onDrop: (event) => {
            event.preventDefault();
            const from = dragRef.current;
            dragRef.current = null;
            if (from && from !== id) moveBefore(from, id);
          },
          onDragEnd: () => {
            dragRef.current = null;
          },
        },
        h('span', { className: 'dpc-grip', 'aria-hidden': true }, '⠿'),
        h('span', { className: 'dpc-pos' }, String(position + 1)),
        h(Glyph, { id }),
        h('span', { className: 'dpc-name', title: label }, label),
        h('code', { className: 'dpc-key', title: id }, id),
        locked ? h('span', { className: 'dpc-chip dpc-chip-locked', title: t('lockedHint') }, t('locked')) : null,
        isHidden ? h('span', { className: 'dpc-chip' }, t('hiddenChip')) : null,
        (prefs.groups || []).length === 0
          ? null
          : h(
              'select',
              {
                className: 'dpc-select',
                value: prefs.assign[id] || '',
                'aria-label': t('groupLabel'),
                title: t('groupLabel'),
                onChange: (event) => setGroup(id, event.target.value),
              },
              h('option', { value: '' }, t('ungrouped')),
              (prefs.groups || []).map((group) => h('option', { key: group.id, value: group.id }, group.name)),
            ),
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-mini',
            onClick: () => moveBy(id, -1),
            disabled: position === 0,
            'aria-label': t('moveUp'),
            title: t('moveUp'),
          },
          '↑',
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-mini',
            onClick: () => moveBy(id, 1),
            disabled: position === order.length - 1,
            'aria-label': t('moveDown'),
            title: t('moveDown'),
          },
          '↓',
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dpc-eye',
            onClick: () => toggleHidden(id),
            disabled: locked,
            'aria-pressed': !isHidden,
            'aria-label': isHidden ? t('showIt') : t('hideIt'),
            title: locked ? t('lockedHint') : isHidden ? t('showIt') : t('hideIt'),
          },
          isHidden ? '○' : '●',
        ),
      );
    });

    const groups = h(
      'section',
      { className: 'dpc-section' },
      h(
        'header',
        { className: 'dpc-sectionHead' },
        h('h3', { className: 'dpc-sectionTitle' }, t('groupsTitle')),
        h('button', { type: 'button', className: 'dpc-ghost', onClick: addGroup }, t('newGroup')),
      ),
      h('p', { className: 'dpc-hint' }, t('groupsHint')),
      (prefs.groups || []).length === 0
        ? h('p', { className: 'dpc-empty' }, t('noGroups'))
        : h(
            'ul',
            { className: 'dpc-groupList' },
            (prefs.groups || []).map((group) => {
              const members = order.filter((id) => (prefs.assign[id] || '') === group.id);
              return h(
                'li',
                { key: group.id, className: 'dpc-group' },
                h('span', { className: 'dpc-groupDot', 'aria-hidden': true }),
                h('input', {
                  className: 'dpc-input',
                  value: group.name,
                  'aria-label': t('groupName'),
                  title: t('groupName'),
                  onChange: (event) => renameGroup(group.id, event.target.value),
                }),
                h('span', { className: 'dpc-count' }, String(members.length)),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dpc-mini',
                    onClick: () => removeGroup(group.id),
                    'aria-label': t('deleteGroup'),
                    title: t('deleteGroup'),
                  },
                  '✕',
                ),
              );
            }),
          ),
    );

    const diagnostics = engine ? engine.diagnostics() : null;
    const diag = h(
      'details',
      { className: 'dpc-diag' },
      h('summary', { className: 'dpc-diagSummary' }, t('diagTitle')),
      h(
        'dl',
        { className: 'dpc-diagList' },
        h('dt', null, t('diagList')),
        h('dd', null, diagnostics && diagnostics.found ? `${t('diagFound')} · ${diagnostics.listClass || '—'}` : t('diagMissing')),
        h('dt', null, t('diagRows')),
        h('dd', null, String(diagnostics ? diagnostics.rows : 0)),
        h('dt', null, t('diagMapped')),
        h('dd', null, String(diagnostics ? diagnostics.mapped : 0)),
        h('dt', null, t('diagSource')),
        h('dd', null, `${entries.length}`),
        h('dt', null, t('diagAt')),
        h('dd', null, diagnostics && diagnostics.at ? new Date(diagnostics.at).toLocaleTimeString() : t('diagNone')),
        diagnostics && diagnostics.error ? h('dt', null, 'error') : null,
        diagnostics && diagnostics.error ? h('dd', { className: 'dpc-error' }, diagnostics.error) : null,
      ),
    );

    return h(
      'div',
      { className: 'dpc-root' },
      head,
      meta,
      order.length === 0
        ? h('p', { className: 'dpc-empty' }, t('empty'))
        : h('ul', { className: 'dpc-list' }, rows),
      groups,
      diag,
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
    .dpc-root{display:flex;flex-direction:column;gap:14px;padding:20px 24px 32px;margin:0 auto;width:100%;max-width:880px;box-sizing:border-box;color:var(--dsw-alias-label-primary,#ececf1);font-size:13px;line-height:1.55;min-height:100%;overflow-x:hidden;overflow-y:auto}
    .dpc-root *{box-sizing:border-box}
    .dpc-root :focus-visible{outline:2px solid var(--dsw-focus-ring-color,rgba(88,101,242,.65));outline-offset:2px}
    .dpc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .dpc-headText{min-width:0}
    .dpc-title{margin:0;font-size:16px;font-weight:600;letter-spacing:.01em}
    .dpc-sub{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.55))}
    .dpc-headActions{display:flex;gap:8px;flex-wrap:wrap}
    .dpc-meta{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;min-width:0}
    .dpc-count{font-size:12px;color:var(--dsw-alias-label-secondary,rgba(236,236,241,.72))}
    .dpc-hintInline{font-size:11.5px;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.5));min-width:0;overflow-wrap:anywhere}
    .dpc-ghost{appearance:none;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:transparent;color:var(--dsw-alias-label-secondary,rgba(236,236,241,.72));border-radius:var(--dsw-radius-md,8px);padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;transition:background .16s,border-color .16s,color .16s}
    .dpc-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.26));color:var(--dsw-alias-label-primary,#ececf1)}
    .dpc-ghost:disabled{opacity:.45;cursor:default}
    .dpc-primary{appearance:none;border:0;border-radius:var(--dsw-radius-md,8px);padding:5px 14px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;background:var(--dsw-alias-button-primary-fill,#5865f2);color:var(--dsw-alias-label-primary-inverted,#fff)}
    .dpc-primary:hover{background:var(--dsw-alias-button-primary-hover,#4a56d8)}
    .dpc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;width:100%;min-width:0}
    .dpc-row{display:flex;align-items:center;gap:8px;padding:7px 10px;width:100%;min-width:0;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.13));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-settings-card-fill,rgba(255,255,255,.03));transition:background .16s,border-color .16s,opacity .16s}
    .dpc-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.22))}
    .dpc-row[data-hidden="true"]{opacity:.55}
    .dpc-row[data-locked="true"]{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#5865f2) 35%,transparent)}
    .dpc-grip{cursor:grab;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.4));font-size:13px;line-height:1;user-select:none}
    .dpc-pos{min-width:18px;text-align:right;font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.45))}
    .dpc-glyph{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,rgba(236,236,241,.8));flex:none}
    .dpc-glyph:empty::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;display:block}
    .dpc-name{font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;max-width:220px}
    .dpc-key{font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:10.5px;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.4));min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 60px}
    .dpc-chip{font-size:10.5px;line-height:16px;padding:0 6px;border-radius:var(--dsw-radius-xs,6px);border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.6));white-space:nowrap;flex:none}
    .dpc-chip-locked{color:var(--dsw-alias-label-primary-bluish,#9db4f0);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#5865f2) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#5865f2) 10%,transparent)}
    .dpc-select{appearance:none;flex:0 1 auto;min-width:0;max-width:150px;padding:3px 22px 3px 8px;background-image:url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 7px center;font:inherit;font-size:11.5px;color:var(--dsw-alias-label-primary,#ececf1);background:var(--dsw-alias-bg-l2,rgba(255,255,255,.05));border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));border-radius:var(--dsw-radius-sm,6px);cursor:pointer}
    .dpc-select:hover{border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.26))}
    .dpc-mini{appearance:none;flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:.5px solid transparent;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,rgba(236,236,241,.7));font:inherit;font-size:12px;line-height:1;cursor:pointer}
    .dpc-mini:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.16));color:var(--dsw-alias-label-primary,#ececf1)}
    .dpc-mini:disabled{opacity:.3;cursor:default}
    .dpc-eye{appearance:none;flex:none;width:26px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,rgba(236,236,241,.72));font:inherit;font-size:11px;line-height:1;cursor:pointer}
    .dpc-eye:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));color:var(--dsw-alias-label-primary,#ececf1)}
    .dpc-eye[aria-pressed="false"]{color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.45))}
    .dpc-eye:disabled{opacity:.4;cursor:default}
    .dpc-section{display:flex;flex-direction:column;gap:8px;padding-top:6px;border-top:.5px solid var(--dsw-alias-separator-primary,rgba(255,255,255,.08))}
    .dpc-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .dpc-sectionTitle{margin:0;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.55))}
    .dpc-hint{margin:0;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.55))}
    .dpc-empty{margin:0;padding:16px;border:.5px dashed var(--dsw-alias-border-l2,rgba(255,255,255,.16));border-radius:var(--dsw-radius-xl,14px);color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.55));font-size:12px}
    .dpc-groupList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
    .dpc-group{display:flex;align-items:center;gap:8px}
    .dpc-groupDot{width:8px;height:8px;border-radius:2px;background:var(--dsw-alias-state-business-primary,#5865f2);opacity:.75;flex:none}
    .dpc-input{flex:1;min-width:0;padding:5px 9px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary,#ececf1);background:var(--dsw-alias-bg-l2,rgba(255,255,255,.05));border:.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));border-radius:var(--dsw-radius-md,8px)}
    .dpc-diag{border-top:.5px solid var(--dsw-alias-separator-primary,rgba(255,255,255,.08));padding-top:8px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.5))}
    .dpc-diagSummary{cursor:pointer;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.5))}
    .dpc-diagList{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:8px 0 0}
    .dpc-diagList dt{opacity:.7}
    .dpc-diagList dd{margin:0;font-family:var(--dsw-font-family-code,ui-monospace,monospace)}
    .dpc-error{color:var(--dsw-alias-label-error,#e06a6a)}
    .dpc-settings{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 2px}
    .dpc-settingsText{min-width:0}
    .dpc-settingsTitle{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#ececf1)}
    .dpc-settingsDesc{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.55))}
    @media (prefers-reduced-motion:reduce){.dpc-row,.dpc-ghost,.dpc-mini,.dpc-eye{transition:none}}
  `;

  const SIDEBAR_CSS = `
    .dpc-sep{display:flex;align-items:center;gap:6px;flex:none;padding:8px 8px 1px;font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,rgba(236,236,241,.42));line-height:14px;pointer-events:none;overflow:hidden;white-space:nowrap}
    .dpc-sep::after{content:'';flex:1;height:.5px;background:var(--dsw-alias-separator-primary,rgba(255,255,255,.08))}
  `;

  /* ----------------------------------------------------------------- entry */

  return {
    inject: ['slots', 'locale'],
    // Pure helpers the browser harness drives directly, without a Cordis context.
    testables: { createEngine, readEntries, normalize, sanitize, store, setCtx: (value) => { ctxRef = value; } },
    apply(ctx) {
      ctxRef = ctx;

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

      if (ctx.locale && typeof ctx.locale.register === 'function') {
        ctx.effect(() => {
          try {
            return ctx.locale.register(NS, { zh: flatten('zh'), en: flatten('en') });
          } catch (error) {
            console.error(`[${PACKAGE}] locale registration failed`, error);
            return () => {};
          }
        }, `${PACKAGE}: dictionaries`);
      }

      engineRef = createEngine(ctx);
      engineRef.start();

      // A registration, a rename or a locale switch changes the list this plugin
      // lays out, so every one of them re-runs the pass.
      if (typeof ctx.slots.subscribe === 'function') {
        ctx.effect(() => ctx.slots.subscribe(SLOT_PANELS, () => engineRef && engineRef.schedule()), `${PACKAGE}: panel entries`);
      }
      if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
        ctx.effect(() => ctx.locale.subscribe(() => engineRef && engineRef.schedule()), `${PACKAGE}: labels`);
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
