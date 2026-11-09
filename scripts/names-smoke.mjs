// Behaviour gate for custom panel names and the original-name tag.
//
// client.js only runs inside the page module loader, so this harness loads the
// real file in a vm with a tiny DOM and drives the real engine apply(). It
// covers the parts a static check cannot: mapping renamed rows back to their
// entries, the tag's placement, the switch, and the restore on dispose.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
  useState: (value) => [value, () => {}],
  useReducer: (_reducer, initial) => [initial, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
};

function makeEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    parentElement: null,
    attributes: {},
    style: {},
    className: '',
    textContent: '',
    isConnected: true,
    _width: 260,
    classList: {
      contains: (name) => String(el.className).split(/\s+/).includes(name),
      add() {},
      remove() {},
    },
    setAttribute(key, value) {
      if (key === 'class') el.className = String(value);
      else el.attributes[key] = String(value);
    },
    getAttribute(key) {
      if (key === 'class') return el.className || null;
      return Object.prototype.hasOwnProperty.call(el.attributes, key) ? el.attributes[key] : null;
    },
    removeAttribute(key) {
      delete el.attributes[key];
    },
    hasAttribute(key) {
      return Object.prototype.hasOwnProperty.call(el.attributes, key);
    },
    appendChild(child) {
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    remove() {
      if (!el.parentElement) return;
      const at = el.parentElement.children.indexOf(el);
      if (at >= 0) el.parentElement.children.splice(at, 1);
      el.parentElement = null;
    },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { width: el._width, height: 40, top: 0, left: 0, right: el._width, bottom: 40 };
    },
    querySelectorAll(selector) {
      return selectAll(el, selector);
    },
    querySelector(selector) {
      return selectAll(el, selector)[0] || null;
    },
    contains(node) {
      if (node === el) return true;
      return el.children.some((child) => child.contains && child.contains(node));
    },
  };
  return el;
}

function descendants(root) {
  const out = [];
  for (const child of root.children) {
    out.push(child);
    out.push(...descendants(child));
  }
  return out;
}

function selectAll(root, selector) {
  const parts = String(selector).split(',').map((part) => part.trim());
  const found = [];
  for (const part of parts) {
    let hits = [];
    if (part === ':scope > button') {
      hits = root.children.filter((child) => child.tagName === 'BUTTON');
    } else if (part === 'button') {
      hits = descendants(root).filter((child) => child.tagName === 'BUTTON');
    } else if (part === '[data-dpc-sep]') {
      hits = descendants(root).filter((child) => child.hasAttribute('data-dpc-sep'));
    } else if (part === '.dpc-nameTag') {
      hits = descendants(root).filter((child) => String(child.className).split(/\s+/).includes('dpc-nameTag'));
    } else if (part === 'button[data-dpc-label]') {
      hits = descendants(root).filter((child) => child.tagName === 'BUTTON' && child.hasAttribute('data-dpc-label'));
    } else {
      const labelled = part.match(/^button\[(data-dpc-label|aria-label)="(.*)"\]$/);
      if (labelled) {
        hits = descendants(root).filter(
          (child) => child.tagName === 'BUTTON' && child.getAttribute(labelled[1]) === labelled[2],
        );
      }
    }
    for (const hit of hits) if (!found.includes(hit)) found.push(hit);
  }
  return found;
}

function makeButton(label, withTitle = true) {
  const button = makeEl('button');
  button.setAttribute('aria-label', label);
  const glyph = makeEl('span');
  glyph.setAttribute('aria-hidden', 'true');
  button.appendChild(glyph);
  if (withTitle) {
    const title = makeEl('span');
    title.className = 'panelTitle';
    title.textContent = label;
    button.appendChild(title);
  }
  return button;
}

function makeList(buttons, width = 260) {
  const list = makeEl('div');
  list.className = 'panelList-test';
  list._width = width;
  const parent = makeEl('div');
  parent.appendChild(list);
  parent.appendChild(makeEl('div'));
  for (const button of buttons) list.appendChild(button);
  return { list, parent };
}

function makeWindow(localPrefs) {
  const memory = new Map();
  if (localPrefs !== undefined) memory.set('dsh.panel-control.v1', JSON.stringify(localPrefs));
  return {
    document: makeDocument(),
    localStorage: {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    },
    navigator: { language: 'zh-CN' },
    location: { reload() {} },
    CSS: { escape: (value) => String(value) },
    addEventListener() {},
    removeEventListener() {},
    __DSH_BOOT__: {
      rev: 'names-test',
      entries: [],
      ids: ['plugins', 'dsh-market', 'workspace-control', 'panel-control', 'dup-a', 'dup-b'],
    },
    __ModuleLoader__: { def: null, load(def) { this.def = def; } },
  };
}

function makeDocument() {
  const doc = {
    _list: null,
    readyState: 'loading',
    head: makeEl('head'),
    body: makeEl('body'),
    documentElement: makeEl('html'),
    title: '',
    visibilityState: 'visible',
    createElement: (tag) => makeEl(tag),
    createTextNode: () => ({ textContent: '' }),
    createDocumentFragment: () => makeEl('div'),
    querySelectorAll(selector) {
      if (selector === '[class*="panelList"]') return doc._list ? [doc._list] : [];
      if (selector === 'style[data-dpc-style]') return [];
      return doc._list ? selectAll(doc._list, selector) : [];
    },
    querySelector(selector) {
      return doc.querySelectorAll(selector)[0] || null;
    },
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
  return doc;
}

const calls = { selectPanel: [], effects: [], classify: [] };
const PACKAGES = {
  plugins: '@deepseek-ai/dsh-client-ui-plugin-manager',
  'dsh-market': 'dshmarket',
  'panel-control': 'dsh-panel-control',
  'dup-a': 'dsh-dup-a',
  'dup-b': 'dsh-dup-b',
};
const layout = {
  panelInfo: { getSnapshot: () => ({ activePanelId: null }) },
  selectPanel(id) {
    calls.selectPanel.push(id);
  },
};
const locale = { getLocale: () => ({ active: 'zh-CN' }), register: () => {}, subscribe: () => () => {} };

function makeCtx(registries, classifyResult) {
  const makeRegistry = (name) => {
    if (!registries.has(name)) registries.set(name, []);
    return registries.get(name);
  };
  const subscribers = new Map();
  const notify = (name) => {
    for (const callback of subscribers.get(name) || []) Promise.resolve().then(callback);
  };
  const slotService = {
    register(options, component) {
      const record = { options, component, registrant: options.registrant || 'dsh-panel-control' };
      makeRegistry(options.name).push(record);
      notify(options.name);
      return () => {
        const all = makeRegistry(options.name);
        const at = all.indexOf(record);
        if (at >= 0) all.splice(at, 1);
        notify(options.name);
      };
    },
    entriesOfSlot(name) {
      return makeRegistry(name).slice();
    },
    inject(name, callback) {
      return callback();
    },
    subscribe(name, callback) {
      if (!subscribers.has(name)) subscribers.set(name, []);
      subscribers.get(name).push(callback);
      return () => {
        subscribers.set(name, (subscribers.get(name) || []).filter((fn) => fn !== callback));
      };
    },
    renderSlot(name, props, opts) {
      return stubReact.createElement('div', { 'data-slot': name, 'data-only': opts && opts.only });
    },
  };
  return {
    registries,
    ctx: {
      fiber: { name: 'dsh-panel-control' },
      get(name) {
        if (name === 'layout') return layout;
        if (name === 'locale') return locale;
        return undefined;
      },
      effect(fn) {
        const dispose = fn();
        if (typeof dispose === 'function') calls.effects.push(dispose);
        return dispose;
      },
      slots: slotService,
      connection: {
        rpc: {
          async call(_channel, _endpoint, message) {
            if (message && message.method === 'packages') {
              const ids = (message.payload && message.payload.ids) || [];
              const packages = {};
              for (const row of ids) if (PACKAGES[row.id]) packages[row.id] = PACKAGES[row.id];
              return { ok: true, value: { packages, rev: 'names-test' } };
            }
            if (message && message.method === 'classify') {
              calls.classify.push(message.payload);
              return { ok: true, value: classifyResult || { groups: [] } };
            }
            return { ok: true, value: {} };
          },
        },
      },
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function seed(registries, buttons) {
  const rows = [
    ['plugins', '插件', 0],
    ['dsh-market', '插件市场', 1],
    ['workspace-control', '工作区管理', 20],
  ];
  for (const [id, label, order] of rows) {
    registries.get('sidebar.panellist').push({
      options: { name: 'sidebar.panellist', id, order, label },
      component: () => null,
      registrant: 'tk',
    });
  }
  return rows.map(([, label]) => label);
}

async function run(localPrefs, options = {}) {
  calls.effects.length = 0;
  calls.selectPanel.length = 0;
  calls.classify.length = 0;
  const registries = new Map();
  const doc = makeDocument();
  const buttons = (options.labels || ['插件', '插件市场', '工作区管理', '面板管理']).map((label) =>
    makeButton(label, options.withTitle !== false),
  );
  const { list } = makeList(buttons, options.width || 260);
  doc._list = list;
  const win = makeWindow(localPrefs);
  win.document = doc;
  const app = makeCtx(registries, options.classify);
  registries.set('sidebar.panellist', []);
  seed(registries, buttons);
  if (options.extraEntries) {
    for (const [id, label, order] of options.extraEntries) {
      registries.get('sidebar.panellist').push({
        options: { name: 'sidebar.panellist', id, order, label },
        component: () => null,
        registrant: 'tk',
      });
    }
  }

  globalThis.window = win;
  globalThis.document = doc;
  globalThis.localStorage = win.localStorage;
  globalThis.CSS = win.CSS;
  win.__ModuleLoader__.def = null;
  vm.runInThisContext(SRC, { filename: 'client.js' });
  const mod = win.__ModuleLoader__.def.factory((name) => {
    if (name === 'react') return stubReact;
    throw new Error('unexpected require: ' + name);
  });
  mod.apply(app.ctx);
  await sleep(options.wait || 420);
  return { buttons, list, calls, ctx: app.ctx, registries, win };
}

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const titleOf = (button) => button.children.find((child) => child.tagName === 'SPAN' && String(child.className) !== 'dpc-nameTag' && child.getAttribute('aria-hidden') !== 'true');
const tagOf = (button) => button.children.find((child) => String(child.className).split(/\s+/).includes('dpc-nameTag'));

// 1. A renamed entry: custom text, original label addressable, one tag.
const renamed = await run({ version: 2, names: { plugins: '我的插件' }, tags: true });
const first = renamed.buttons[0];
check(first.getAttribute('aria-label') === '我的插件', 'the renamed row kept its old aria-label');
check(first.getAttribute('data-dpc-label') === '插件', 'the original label was not kept for mapping');
check(titleOf(first) && titleOf(first).textContent === '我的插件', 'the visible title was not renamed');
const tag = tagOf(first);
check(Boolean(tag), 'the renamed row has no package tag');
check(tag && tag.textContent === 'plugin-manager', 'the tag does not contain the package name');
check(tag && tag.getAttribute('aria-hidden') === 'true', 'the tag is not hidden from assistive tech');
check(!tagOf(renamed.buttons[1]), 'an unrenamed row grew a tag');
check(first.style.order !== undefined, 'the engine did not apply the row order');

// 2. The switch removes the tag but keeps the custom name.
const noTags = await run({ version: 2, names: { plugins: '我的插件' }, tags: false });
check(noTags.buttons[0].getAttribute('aria-label') === '我的插件', 'turning tags off also dropped the name');
check(!tagOf(noTags.buttons[0]), 'the tag switch did not remove the tag');

// 3. Clearing the name restores the host label.
const cleared = await run({ version: 2, names: {}, tags: true });
check(cleared.buttons[0].getAttribute('aria-label') === '插件', 'a cleared name did not restore the host label');
check(titleOf(cleared.buttons[0]).textContent === '插件', 'a cleared name did not restore the title');
check(!tagOf(cleared.buttons[0]), 'a cleared name left the tag behind');

// 4. Icon rail: no title span, no tag, but the accessible name still follows.
const rail = await run({ version: 2, names: { plugins: '我的插件' }, tags: true }, { width: 40, withTitle: false });
check(rail.buttons[0].getAttribute('aria-label') === '我的插件', 'the rail row did not get the custom name');
check(!tagOf(rail.buttons[0]), 'the rail row grew a tag');

// 5. Duplicate labels: positional mapping still reaches both rows, and only the
//    renamed one changes.
const dup = await run(
  { version: 2, names: { 'dup-a': '甲' }, tags: true },
  {
    labels: ['插件', '插件市场', '工作区管理', '面板管理', '相同', '相同'],
    extraEntries: [
      ['dup-a', '相同', 30],
      ['dup-b', '相同', 31],
    ],
  },
);
const dupButtons = dup.buttons.slice(-2);
check(dupButtons[0].getAttribute('aria-label') === '甲', 'the first duplicate-label row was not renamed');
check(dupButtons[1].getAttribute('aria-label') === '相同', 'the second duplicate-label row was renamed by mistake');
check(tagOf(dupButtons[0]).textContent === 'dup-a', 'the duplicate row tag did not use its package');

// 5b. An id the Host cannot map has no tag: the row id is not a package name.
const unmapped = await run({ version: 2, names: { 'workspace-control': '工作区' }, tags: true });
check(!tagOf(unmapped.buttons[2]), 'an unmapped package fell back to its row id');

// 6. Dispose restores the host DOM.
const disposed = await run({ version: 2, names: { plugins: '我的插件' }, tags: true });
for (const dispose of disposed.calls.effects.slice().reverse()) dispose();
check(disposed.buttons[0].getAttribute('aria-label') === '插件', 'dispose did not restore the host aria-label');
check(titleOf(disposed.buttons[0]).textContent === '插件', 'dispose did not restore the host title');
check(!tagOf(disposed.buttons[0]), 'dispose left the original-name tag behind');
check(!disposed.buttons[0].getAttribute('data-dpc-label'), 'dispose left the original-label marker behind');

// 7. A hidden group hides its members on its own, without writing them into
//    the per-row hidden list (so showing the group can restore the old state).
const grouped = await run({
  version: 2,
  groups: [{ id: 'g1', name: '组' }],
  assign: { plugins: 'g1', 'dsh-market': 'g1' },
  hiddenGroups: ['g1'],
});
check(grouped.buttons[0].style.display === 'none', 'a hidden group did not hide its first member');
check(grouped.buttons[1].style.display === 'none', 'a hidden group did not hide its second member');
check(grouped.buttons[2].style.display === 'none', 'an ungrouped row leaked into the sidebar');
check(grouped.buttons[3].style.display !== 'none', 'the ungrouped manager row disappeared');
check(
  !grouped.list.children.some((node) => node.getAttribute('data-dpc-group-id') === 'g1'),
  'a fully hidden group still drew its separator',
);

// 8. The member-count switch also governs the sidebar group separator. It is
//    off by default, so a visible group draws a title without a number.
const sepOf = (list) => list.children.find((node) => node.getAttribute('data-dpc-group-id') === 'g1');
const countOf = (sep) =>
  sep && sep.children.find((child) => String(child.className).split(/\s+/).includes('dpc-sepCount'));
const noCounts = await run({
  version: 2,
  groups: [{ id: 'g1', name: '组' }],
  assign: { plugins: 'g1', 'dsh-market': 'g1' },
});
const sepOff = sepOf(noCounts.list);
check(Boolean(sepOff), 'a visible group did not draw its separator');
check(sepOff && !countOf(sepOff), 'the sidebar showed a group count while the switch was off');

// 9. Turning it on adds the number of currently visible members.
const withCounts = await run({
  version: 2,
  counts: true,
  groups: [{ id: 'g1', name: '组' }],
  assign: { plugins: 'g1', 'dsh-market': 'g1' },
});
const sepOn = sepOf(withCounts.list);
check(Boolean(sepOn), 'the counted group did not draw its separator');
check(countOf(sepOn) && countOf(sepOn).textContent === '2', 'the sidebar group count is wrong or missing');

// 10. The group's member order is the pane order: moving a row inside a group
//     changes the sidebar order without a second ordering field.
const reordered = await run({
  version: 2,
  order: ['dsh-market', 'plugins', 'workspace-control'],
  groups: [{ id: 'g1', name: '组' }],
  assign: { plugins: 'g1', 'dsh-market': 'g1' },
});
check(
  Number(reordered.buttons[1].style.order) < Number(reordered.buttons[0].style.order),
  'the group member order was not applied to the sidebar',
);

// 11. The manager itself renders the two-pane tree. This executes the real
//     component once with the harness hooks, so a missing helper or a stale
//     column reference fails here instead of in the settings dialog.
const managerRun = await run({
  version: 2,
  groups: [
    { id: 'g1', name: '组' },
    { id: 'g2', name: '空组' },
  ],
  assign: { plugins: 'g1' },
});
const mainEntry = (managerRun.registries.get('main') || []).find(
  (entry) => entry.options && entry.options.key === 'panel-control',
);
let managerTree = null;
try {
  managerTree = mainEntry && mainEntry.component({});
} catch (error) {
  failures.push('the manager failed to render: ' + (error && error.message));
}
const classes = [];
const collectClasses = (node) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectClasses(child);
    return;
  }
  const props = node.props || {};
  if (props.className) classes.push(...String(props.className).split(/\s+/));
  collectClasses(props.children);
};
collectClasses(managerTree);
check(classes.includes('dpc-treeGrid'), 'the manager did not render the tree grid');
check(classes.includes('dpc-pane--plugins'), 'the manager did not render the plugins pane');
check(classes.includes('dpc-pane--groups'), 'the manager did not render the groups pane');
check(classes.includes('dpc-treeEmpty'), 'an empty group did not render its drop target');

// 12. Once a group is populated, ungrouped rows are staging-only: hidden in
//     the sidebar, while the manager keeps a row so it stays reachable.
const staged = await run({
  version: 2,
  groups: [{ id: 'g1', name: '组' }],
  assign: { plugins: 'g1' },
});
check(staged.buttons[1].style.display === 'none', 'an ungrouped plugin stayed in the sidebar');
check(staged.buttons[2].style.display === 'none', 'a second ungrouped plugin stayed in the sidebar');
check(staged.buttons[3].style.display !== 'none', 'the manager row was hidden with the ungrouped rows');
check(
  Number(staged.buttons[0].style.order) < Number(staged.buttons[3].style.order),
  'the manager row was not kept after the grouped rows',
);

// 13. An empty group is not a reason to empty the sidebar: with nothing filed,
//     the old ungrouped block is still the only way to reach the entries.
const emptyGroup = await run({
  version: 2,
  groups: [{ id: 'g1', name: '空组' }],
  assign: {},
});
check(emptyGroup.buttons[1].style.display !== 'none', 'an empty group hid every ungrouped row');
check(emptyGroup.buttons[3].style.display !== 'none', 'an empty group hid the manager row');

// 14. Hidden groups start folded, visible groups start open. Folding is a
//     settings-view concern: the group stays hidden in the sidebar either way.
const folded = await run({
  version: 2,
  groups: [
    { id: 'g1', name: '组' },
    { id: 'g2', name: '隐藏组' },
  ],
  assign: { plugins: 'g1', 'dsh-market': 'g2' },
  hiddenGroups: ['g2'],
});
const foldedEntry = (folded.registries.get('main') || []).find(
  (entry) => entry.options && entry.options.key === 'panel-control',
);
let foldedTree = null;
try {
  foldedTree = foldedEntry && foldedEntry.component({});
} catch (error) {
  failures.push('the folded manager failed to render: ' + (error && error.message));
}
const foldedNodes = [];
const collectFolded = (node) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectFolded(child);
    return;
  }
  foldedNodes.push(node);
  collectFolded(node.props && node.props.children);
};
collectFolded(foldedTree);
const groupNode = (id) =>
  foldedNodes.find(
    (node) =>
      node &&
      node.props &&
      node.props.key === id &&
      String(node.props.className || '').split(/\s+/).includes('dpc-treeGroup'),
  );
const g1Node = groupNode('g1');
const g2Node = groupNode('g2');
const childList = (node) =>
  Boolean(
    node &&
      Array.isArray(node.props.children) &&
      node.props.children.some(
        (child) =>
          child &&
          child.props &&
          String(child.props.className || '').split(/\s+/).includes('dpc-treeChildren'),
      ),
  );
check(Boolean(g1Node && g2Node), 'the manager did not render both group nodes');
check(g1Node && g1Node.props['data-collapsed'] === 'false', 'a visible group started collapsed');
check(g2Node && g2Node.props['data-collapsed'] === 'true', 'a hidden group did not start collapsed');
check(childList(g1Node), 'an open group lost its children');
check(!childList(g2Node), 'a collapsed group still mounted its children');
const caretNodes = foldedNodes.filter(
  (node) =>
    node &&
    node.props &&
    String(node.props.className || '').split(/\s+/).includes('dpc-treeCaret'),
);
check(caretNodes.length === 2, 'the manager did not render one caret per group');
check(
  caretNodes.some((node) => node.props['aria-expanded'] === 'true') &&
    caretNodes.some((node) => node.props['aria-expanded'] === 'false'),
  'the caret state does not match the group fold state',
);

// 15. The safe reclassify must not undo a manual drag: entries that were dragged
//     out stay ungrouped, and only untouched entries reach the model.
const autoRun = await run(
  {
    version: 2,
    auto: true,
    groups: [{ id: 'g1', name: '组' }],
    assign: { 'dsh-market': 'g1' },
    autoFiled: ['plugins', 'dsh-market', 'workspace-control'],
    autoSkip: ['plugins'],
  },
  {
    classify: {
      groups: [{ name: '模型组', ids: ['plugins', 'workspace-control', 'newcomer'] }],
      model: 'fake',
    },
    extraEntries: [['newcomer', '新入口', 30]],
  },
);
const autoEntry = (autoRun.registries.get('main') || []).find(
  (entry) => entry.options && entry.options.key === 'panel-control',
);
let autoTree = null;
try {
  autoTree = autoEntry && autoEntry.component({});
} catch (error) {
  failures.push('the auto-classify manager failed to render: ' + (error && error.message));
}
const autoNodes = [];
const collectAuto = (node) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectAuto(child);
    return;
  }
  autoNodes.push(node);
  collectAuto(node.props && node.props.children);
};
collectAuto(autoTree);
const autoLink = autoNodes.find(
  (node) =>
    node &&
    node.props &&
    node.props.type === 'button' &&
    String(node.props.className || '').split(/\\s+/).includes('dpc-link') &&
    (node.props.children || []).includes('只分未动过的'),
);
check(Boolean(autoLink), 'the manager did not render the safe classify button');
const classifyCallsBefore = calls.classify.length;
if (autoLink) await autoLink.props.onClick();
check(
  calls.classify.length === classifyCallsBefore + 1,
  'the classify-again button did not start one classification run',
);
const autoPayload = calls.classify[0] || { entries: [] };
const autoPayloadIds = autoPayload.entries.map((entry) => entry.id);
check(!autoPayloadIds.includes('plugins'), 'a manually ungrouped entry was sent to the model');
check(!autoPayloadIds.includes('workspace-control'), 'a second manual entry was sent to the model');
check(autoPayloadIds.includes('newcomer'), 'an untouched entry was left out of classification');
const autoPrefs = JSON.parse(autoRun.win.localStorage.getItem('dsh.panel-control.v1'));
check(!autoPrefs.assign.plugins, 'the classify-again run put a manual entry back into a group');
check(!autoPrefs.assign['workspace-control'], 'the classify-again run re-filed a second manual entry');
check(Boolean(autoPrefs.assign.newcomer), 'the untouched entry was not filed by the model result');
check(
  (autoPrefs.autoSkip || []).includes('plugins'),
  'the manual lock was not persisted for the dragged entry',
);

// 16. "Classify all" is the explicit override: it is available even while the
//     auto switch is off, sends locked entries too, and keeps the lock for later
//     safe runs instead of clearing it.
const allRun = await run(
  {
    version: 2,
    auto: false,
    groups: [{ id: 'g1', name: '组' }],
    assign: { 'dsh-market': 'g1' },
    autoFiled: ['plugins', 'dsh-market', 'workspace-control'],
    autoSkip: ['plugins'],
  },
  {
    classify: {
      groups: [{ name: '模型组', ids: ['plugins', 'workspace-control', 'newcomer'] }],
      model: 'fake',
    },
    extraEntries: [['newcomer', '新入口', 30]],
  },
);
const allEntry = (allRun.registries.get('main') || []).find(
  (entry) => entry.options && entry.options.key === 'panel-control',
);
let allTree = null;
try {
  allTree = allEntry && allEntry.component({});
} catch (error) {
  failures.push('the all-classify manager failed to render: ' + (error && error.message));
}
const allNodes = [];
const collectAll = (node) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectAll(child);
    return;
  }
  allNodes.push(node);
  collectAll(node.props && node.props.children);
};
collectAll(allTree);
const allButton = (text) =>
  allNodes.find(
    (node) =>
      node &&
      node.props &&
      node.props.type === 'button' &&
      String(node.props.className || '').includes('dpc-link') &&
      (node.props.children || []).includes(text),
  );
const safeAgain = allButton('只分未动过的');
const allAgain = allButton('全部分类');
check(
  Boolean(safeAgain) && Boolean(allAgain),
  'the two classify buttons do not both appear while auto is off',
);
const allCallsBefore = calls.classify.length;
if (allAgain) await allAgain.props.onClick();
check(
  calls.classify.length === allCallsBefore + 1,
  'the classify-all button did not start one classification run',
);
const allPayloadIds = ((calls.classify[0] || { entries: [] }).entries || []).map(
  (entry) => entry.id,
);
check(allPayloadIds.includes('plugins'), 'classify-all left a locked entry out of the request');
check(
  allPayloadIds.includes('workspace-control'),
  'classify-all left the second locked entry out of the request',
);
check(allPayloadIds.includes('newcomer'), 'classify-all left an untouched entry out of the request');
const allPrefs = JSON.parse(allRun.win.localStorage.getItem('dsh.panel-control.v1'));
check(Boolean(allPrefs.assign.plugins), 'classify-all did not reassign the locked entry');
check(
  Boolean(allPrefs.assign['workspace-control']),
  'classify-all did not reassign the second locked entry',
);
check(Boolean(allPrefs.assign.newcomer), 'classify-all did not file the untouched entry');
check(
  (allPrefs.autoSkip || []).includes('plugins'),
  'classify-all cleared the manual lock instead of overriding it once',
);
check(allPrefs.auto === false, 'a manual classify run flipped the auto switch on');

console.log(
  JSON.stringify(
    {
      renamed: Boolean(tag),
      tag: tag ? tag.textContent : null,
      tagsOff: !tagOf(noTags.buttons[0]),
      restored: cleared.buttons[0].getAttribute('aria-label'),
      railTag: Boolean(tagOf(rail.buttons[0])),
      duplicates: dupButtons.map((button) => button.getAttribute('aria-label')),
      unmappedTag: tagOf(unmapped.buttons[2]) ? tagOf(unmapped.buttons[2]).textContent : null,
      sidebarCountOff: sepOff ? !countOf(sepOff) : null,
      sidebarCountOn: countOf(sepOn) ? countOf(sepOn).textContent : null,
      groupOrder: [reordered.buttons[1].style.order, reordered.buttons[0].style.order],
      autoAllPayload: allPayloadIds,
      autoAllLocks: allPrefs.autoSkip || [],
    },
    null,
    2,
  ),
);
if (failures.length) {
  console.error('names-smoke: ' + failures.length + ' problem(s)');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('names-smoke: ok');
process.exit(0);
