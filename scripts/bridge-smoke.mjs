// Scratch harness: does the bridge discover settings-only plugins, register the
// panellist+main pair, avoid plugins that already have a row, and honour the switch?
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
};

const element = () => ({
  style: {},
  dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  setAttribute() {},
  removeAttribute() {},
  appendChild() {},
  remove() {},
  addEventListener() {},
  removeEventListener() {},
  contains() {
    return false;
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  textContent: '',
  children: [],
  childNodes: [],
});

const document = {
  readyState: 'loading',
  head: element(),
  body: element(),
  documentElement: element(),
  title: '',
  visibilityState: 'visible',
  createElement: () => element(),
  createTextNode: () => ({ textContent: '' }),
  createDocumentFragment: () => element(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
};

function makeWindow(localPrefs) {
  const memory = new Map();
  if (localPrefs !== undefined) memory.set('dsh.panel-control.v1', JSON.stringify(localPrefs));
  const localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
    key: () => null,
    length: 0,
  };
  return {
    document,
    localStorage,
    navigator: { language: 'zh-CN' },
    location: { reload() {} },
    CSS: { escape: (value) => String(value) },
    addEventListener() {},
    removeEventListener() {},
    __DSH_BOOT__: {
      rev: 'test-rev',
      entries: [],
      ids: [
        'plugins',
        'dsh-market',
        'panel-control',
        'dsh-flash-presets',
        'billion-context',
        'dshmarket',
        '@deepseek-ai/dsh-client-ui-settings-general',
      ],
    },
    __ModuleLoader__: { def: null, load(def) { this.def = def; } },
  };
}

function section(options, registrant, extra) {
  // Mirrors the host's StoredEntry: `inject`, `store`, `locale` and `children`
  // live beside `options`, not inside it.
  return { options, component: () => null, registrant, ...(extra || {}) };
}
function panelEntry(options, registrant) {
  return { options, component: () => null, registrant };
}

function install(ctx, slots) {
  globalThis.window = ctx;
  globalThis.document = document;
  globalThis.localStorage = ctx.localStorage;
  window.__ModuleLoader__.def = null;
  vm.runInThisContext(SRC, { filename: 'client.js' });
  return window.__ModuleLoader__.def.factory((name) => {
    if (name === 'react') return stubReact;
    throw new Error('unexpected require: ' + name);
  });
}

const calls = { selectPanel: [], renders: [] };
const layout = {
  panelInfo: { getSnapshot: () => ({ activePanelId: null }) },
  selectPanel(id) {
    calls.selectPanel.push(id);
  },
};
const locale = {
  getLocale: () => ({ active: 'zh-CN' }),
  register: () => {},
  subscribe: () => () => {},
};

function makeCtx(seedSections = true) {
  const registries = new Map();
  const list = (name) => {
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
      list(options.name).push(record);
      notify(options.name);
      return () => {
        const all = list(options.name);
        const at = all.indexOf(record);
        if (at >= 0) all.splice(at, 1);
        notify(options.name);
      };
    },
    entriesOfSlot(name) {
      return list(name).slice();
    },
    inject(name, callback) {
      return callback();
    },
    subscribe(name, callback) {
      if (!subscribers.has(name)) subscribers.set(name, []);
      subscribers.get(name).push(callback);
      return () => {};
    },
    renderSlot(name, props, opts) {
      calls.renders.push({ name, props, opts });
      return stubReact.createElement('div', { 'data-slot': name, 'data-only': opts && opts.only });
    },
  };
  list('sidebar.panellist').push(
    panelEntry({ name: 'sidebar.panellist', id: 'plugins', order: 0, label: '插件' }, 'tk'),
  );
  list('sidebar.panellist').push(
    panelEntry({ name: 'sidebar.panellist', id: 'dsh-market', order: 1, label: '插件市场' }, 'dsh-market'),
  );
  list('sidebar.panellist').push(
    panelEntry({ name: 'sidebar.panellist', id: 'workspace-control', order: 20, label: '工作区管理' }, 'tk'),
  );
  list('settings.section').push(
    section({ name: 'settings.section', id: 'general', order: 0, label: '通用' }, 'tk'),
  );
  list('settings.section').push(
    section({ name: 'settings.section', id: 'market', order: 40, label: '插件市场' }, 'dsh-market'),
  );
  if (seedSections) {
    list('settings.section').push(
      section({ name: 'settings.section', id: 'plan-mode', order: 5, label: '计划模式' }, 'tk', {
        inject: () => ({ t: (key) => key }),
        locale: 'dsh-flash-presets',
      }),
    );
    list('settings.section').push(
      section({ name: 'settings.section', id: 'bili', order: 100, label: () => '上下文' }, 'tk', {
        inject: () => ({ t: (key) => key }),
        locale: 'billion-context',
        store: { actions: {} },
      }),
    );
    list('settings.section').push(
      section({ name: 'settings.section', id: 'with-children', order: 110, label: '带子槽的设置页' }, 'tk', {
        children: { 'with-children-slot': { kind: 'single', scope: 'root' } },
      }),
    );
    list('settings.section').push(
      section({ name: 'settings.section', id: 'workspace-control-settings', order: 30, label: '工作区管理' }, 'tk'),
    );
    list('settings.section').push(
      section({ name: 'settings.section', id: 'composer-rewind-settings', order: 50, label: '输入历史' }, 'tk'),
    );
    for (const [id, label] of [
      ['account', '账户'],
      ['models', '模型'],
      ['agent-presets', '智能体预设'],
    ]) {
      list('settings.section').push(section({ name: 'settings.section', id, order: 1, label }, 'tk'));
    }
  }
  return {
    registries,
    subscribers,
    ctx: {
      fiber: { name: 'dsh-panel-control' },
      get(name) {
        if (name === 'layout') return layout;
        if (name === 'locale') return locale;
        return undefined;
      },
      effect(fn) {
        return fn();
      },
      slots: slotService,
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(localPrefs) {
  const app = makeCtx();
  const mod = install(makeWindow(localPrefs), app.registries);
  mod.apply(app.ctx);
  // The bridge sync is debounced (120 ms) and the engine coalesces its passes
  // (100 ms), so the store needs a beat longer than the panellist rows to see
  // the bridged entries.
  await sleep(500);
  const rows = app.registries.get('sidebar.panellist') || [];
  const mains = app.registries.get('main') || [];
  const labelOf = (options) => (typeof options.label === 'function' ? options.label() : options.label);
  return {
    ids: rows.map((row) => row.options.id),
    labels: rows.map((row) => labelOf(row.options)),
    mains: mains.map((row) => row.options.key),
    mainRows: mains,
    rows,
    registries: app.registries,
    // What the settings page actually renders from: the engine copies every
    // pass's panellist entries into the shared store before touching the DOM.
    storeEntries: mod.testables.store.state.entries.map((entry) => entry.id),
    prefs: mod.testables.store.state.prefs,
    normalize: mod.testables.normalize,
  };
}

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// Boot order is not registration order: a plugin that applies after us adds its
// settings section later. The subscription installed when the slot is declared
// must pick that up without a reload.
async function runLate() {
  const app = makeCtx(false);
  const mod = install(makeWindow(undefined), app.registries);
  mod.apply(app.ctx);
  await sleep(300);
  const before = (app.registries.get('sidebar.panellist') || []).map((row) => row.options.id);
  app.ctx.slots.register(
    { name: 'settings.section', id: 'plan-mode', order: 5, label: '计划模式', registrant: 'tk' },
    () => null,
  );
  app.ctx.slots.register(
    { name: 'settings.section', id: 'bili', order: 100, label: () => '上下文', registrant: 'tk' },
    () => null,
  );
  await sleep(420);
  const after = (app.registries.get('sidebar.panellist') || []).map((row) => row.options.id);
  const storeAfter = mod.testables.store.state.entries.map((entry) => entry.id);
  return { before, after, storeAfter };
}

const late = await runLate();
check(!late.before.some((id) => id.startsWith('dpc-bridge-')), 'bridged a section before it was registered');
check(
  late.after.includes('dpc-bridge-plan-mode') && late.after.includes('dpc-bridge-bili'),
  'late-registered settings sections were not bridged',
);
check(
  late.storeAfter.includes('dpc-bridge-plan-mode') && late.storeAfter.includes('dpc-bridge-bili'),
  'late-registered settings sections never reached the left-pane entry list',
);

const on = await run(undefined);
check(on.ids.includes('dpc-bridge-plan-mode'), 'missing bridge row for dsh-flash-presets');
check(on.ids.includes('dpc-bridge-bili'), 'missing bridge row for billion-context');
check(on.ids.includes('dpc-bridge-composer-rewind-settings'), 'missing bridge row for dsh-composer-rewind');

// The settings page's left pane is fed by the store, not by the bridge map: a
// bridged row is only visible there once the engine's pass has read the slot.
const leftPane = (prefs, ids) => {
  const order = on.normalize(
    prefs,
    ids.map((id) => ({ id })),
  );
  const groups = new Set((prefs.groups || []).map((group) => group.id));
  return order.filter((id) => !groups.has((prefs.assign || {})[id] || ''));
};
const paneIds = leftPane(on.prefs, on.storeEntries);
for (const id of ['dpc-bridge-plan-mode', 'dpc-bridge-bili', 'dpc-bridge-composer-rewind-settings']) {
  check(on.storeEntries.includes(id), 'bridged row missing from the store entries (left pane source): ' + id);
  check(paneIds.includes(id), 'bridged row was staged out of the left pane: ' + id);
}
check(!on.ids.includes('dpc-bridge-market'), 'bridged dshmarket even though it has a panel');
check(!on.ids.includes('dpc-bridge-general'), 'bridged a core settings section');
check(!on.ids.includes('dpc-bridge-account'), 'bridged a core settings section');
check(!on.ids.includes('dpc-bridge-models'), 'bridged a core settings section');
check(!on.ids.includes('dpc-bridge-agent-presets'), 'bridged a core settings section');
check(!on.ids.includes('dpc-bridge-workspace-control-settings'), 'bridged a plugin whose panel id is the section base');
check(!on.ids.includes('dpc-bridge-with-children'), 'bridged a section that declares its own child slots');
check(on.mains.includes('dpc-bridge-plan-mode') && on.mains.includes('dpc-bridge-bili'), 'a bridge row has no main entry');
const planRow = on.rows.find((row) => row.options.id === 'dpc-bridge-plan-mode');
check(planRow && planRow.options.order === 85, 'bridge rows lost their order');
check(planRow && planRow.options.label() === '计划模式', 'bridge label is not the section label');

const tree = on.rows.find((row) => row.options.id === 'dpc-bridge-bili').component({ size: 18, active: false });
check(tree && tree.type === 'svg', 'bridge icon is not an svg');

const off = await run({ version: 2, bridge: false, order: ['plugins', 'dsh-market', 'panel-control'] });
check(!off.ids.some((id) => id.startsWith('dpc-bridge-')), 'the switch did not remove the bridge rows');

// The settings shell owns `settings.section`, so the ctx-level renderSlot cannot
// reach it. The bridge declares its own child slot, registers the section
// component into it, and renders it through the props face the host binds.
const biliMain = on.mainRows.find((row) => row.options.key === 'dpc-bridge-bili');
check(Boolean(biliMain), 'no main key for the bridged row');
const slotName = 'dpc-bridge-slot-bili';
const declared = biliMain && biliMain.options.children;
check(Boolean(declared && declared[slotName]), 'the bridge main entry declared no child slot');
check(declared && declared[slotName] && declared[slotName].kind === 'single', 'the bridge child slot is not single');
const face = (name, props, opts) => {
  if (!declared || !declared[name]) throw new Error('slot ' + name + ' is not declared by this entry children');
  calls.renders.push({ name, props, opts });
  return stubReact.createElement('div', { 'data-slot': name });
};
const view = biliMain ? biliMain.component({ renderSlot: face }) : null;
const slot = calls.renders.find((render) => render.name === slotName);
check(Boolean(slot), 'the bridge page did not render its child slot');
check(slot && typeof slot.props.close === 'function', 'the bridge page gave the section no close');
check(Boolean(view) && view.type === 'div', 'the bridge page did not render its frame');
const childEntries = on.registries.get(slotName) || [];
check(childEntries.length === 1, 'the section component was not re-registered into the bridge slot');
check(childEntries[0] && typeof childEntries[0].component === 'function', 'the bridge slot has no component');
check(
  childEntries[0] && typeof childEntries[0].options.inject === 'function',
  'the bridge slot lost the section inject (translations/store would be missing)',
);
check(
  childEntries[0] && childEntries[0].options.locale === 'billion-context',
  'the bridge slot lost the section locale namespace',
);
check(
  childEntries[0] && childEntries[0].options.store && childEntries[0].options.store.actions,
  'the bridge slot lost the section store',
);
if (slot) slot.props.close();
check(calls.selectPanel.includes(null), 'closing the bridge page did not select the Conversation');

console.log(JSON.stringify({ on: on.ids, onLabels: on.labels, mains: on.mains, off: off.ids, renders: calls.renders.length }, null, 2));
if (failures.length) {
  console.error('bridge-smoke: ' + failures.length + ' problem(s)');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('bridge-smoke: ok');
process.exit(0);
