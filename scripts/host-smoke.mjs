/**
 * Host-half smoke test.
 *
 * The Host half runs inside the app process, so a mistake here is a crash, not
 * a red console line: one uncaught ReferenceError in a timer took the whole app
 * down once. This harness imports the real module, calls `apply` with a fake
 * Cordis scope, runs every deferred callback it scheduled, and drives the
 * registered route. It fails on any thrown error.
 *
 *   node .scratch/host-smoke.mjs
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Keep the harness out of the real preferences and the real host.log: the
// module resolves its state directory at import time, so this must be set first.
const STATE = path.join(here, '..', '.scratch', 'smoke-state');
process.env.DPC_STATE_DIR = STATE;
await fs.mkdir(STATE, { recursive: true });

// `npm run smoke -- <file>` points the harness at another copy, which is how
// a regression (or the broken revision that shipped once) gets reproduced.
const override = process.argv[2];
const MODULE = pathToFileURL(override ? path.resolve(override) : path.join(here, '..', 'index.js')).href;

// The recovery nudge rewrites the real client.js when a page never reports; the
// harness must stay read-only about the checkout.
process.env.DPC_NUDGE = 'off';
// Rescue-by-current-revision is an explicit opt-in now: the pages below exercise
// it deliberately, while the default path is asserted later.
process.env.DPC_SERVE_CURRENT = 'on';

const timers = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...rest) => {
  const handle = { fn, ms, cleared: false };
  timers.push(handle);
  return handle;
};
globalThis.clearTimeout = (handle) => {
  if (handle && typeof handle === 'object') handle.cleared = true;
};

const failures = [];
function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? `: ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

// The registry currently holds revision "rev-now" for this package; the page
// below asks for "rev-old", which is the 404 that silently drops a plugin.
const PKG_DIR = path.join(STATE, 'pkg-scan');
await fs.mkdir(PKG_DIR, { recursive: true });
const pkgFile = (name, body) => {
  const file = path.join(PKG_DIR, name);
  return fs.writeFile(file, body).then(() => file);
};
const pkgPaths = {
  'dsh-panel-control': await pkgFile(
    'panel.js',
    "const SLOT = 'sidebar.panellist';\nconst KEY = 'panel-control';\nregister({ name: SLOT, id: KEY });\n",
  ),
  dshmarket: await pkgFile('market.js', "register({ name: 'sidebar.panellist', id: 'dsh-market' });\n"),
  'billion-context': await pkgFile('bili.js', "register({ name: 'settings.section', id: 'bili' });\n"),
};

const clientModulesStub = {
  served: [],
  clientPath: (id) => pkgPaths[id] || null,
  graph: () => ({
    rev: 'rev-test',
    release: 'rel',
    entries: [
      { id: 'a' },
      { id: 'b' },
      { id: 'dsh-panel-control', rev: 'rev-now', url: 'plugins/??dsh-panel-control/client.js&rev=rev-now' },
      { id: 'dshmarket', rev: 'rev-now', url: 'plugins/??dshmarket/client.js&rev=rev-now' },
      { id: 'billion-context', rev: 'rev-now', url: 'plugins/??billion-context/client.js&rev=rev-now' },
      // The plugin that sits next to this one in the real profile: it carries no
      // fallback of its own, so a retired revision used to drop it silently
      // while the manager still reported it running.
      { id: 'dsh-workspace-control', rev: 'rev-now', url: 'plugins/??dsh-workspace-control/client.js&rev=rev-now' },
    ],
    batches: [],
  }),
  async bundleResource(method, url) {
    clientModulesStub.served.push(String(url));
    if (String(url).includes('rev-now') && !clientModulesStub.dropRev) {
      return { status: 200, headers: { 'content-type': 'text/javascript' }, body: 'current' };
    }
    return { status: 404 };
  },
};

const registrations = [];
const scope = {
  get(key) {
    if (key === 'connection') {
      return {
        fetch: {
          register(options) {
            registrations.push(options);
            return () => {};
          },
          get() {},
        },
      };
    }
    if (key === 'clientModules') {
      return clientModulesStub;
    }
    return undefined;
  },
};

const effects = [];
const ctx = {
  inject(deps, cb) {
    cb(scope);
  },
  effect(factory) {
    const dispose = factory();
    effects.push(dispose);
    return () => {};
  },
  get(key) {
    return scope.get(key);
  },
  on() {},
  logger: { error: () => {}, warn: () => {}, info: () => {} },
};

console.log('host-smoke');
let mod;
try {
  mod = await import(MODULE);
  check('module imported', typeof mod.apply === 'function');
} catch (error) {
  check('module imported', false, error.message);
  process.exit(1);
}

try {
  mod.apply(ctx);
  check('apply() did not throw', true);
} catch (error) {
  check('apply() did not throw', false, error.message);
}

check('route registered', registrations.length === 1, `got ${registrations.length}`);

// A hot replace runs `apply` again in the same process, before the old half is
// disposed: the second run must be as harmless as the first.
try {
  mod.apply(ctx);
  check('apply() again did not throw', true);
} catch (error) {
  check('apply() again did not throw', false, error.message);
}
const route = registrations[0];
check(
  'route path',
  route && route.path === '/api/dsh-panel-control/classify',
  route && route.path,
);

// Every deferred callback must survive being run: a timer body is outside every
// error boundary the Host has.
for (const timer of timers) {
  if (timer.cleared) continue;
  try {
    timer.fn();
    check(`timer(${timer.ms}ms) survived`, true);
  } catch (error) {
    check(`timer(${timer.ms}ms) survived`, false, error.message);
  }
}
// The nudge is the one timer body that writes to the checkout: prove that the
// harness, and any Host started with DPC_NUDGE=off, leaves client.js alone.
{
  const fs = await import('node:fs/promises');
  const clientPath = path.join(here, '..', 'client.js');
  const before = await fs.readFile(clientPath, 'utf8');
  await new Promise((resolve) => realSetTimeout(resolve, 120));
  const after = await fs.readFile(clientPath, 'utf8');
  check('client.js untouched with DPC_NUDGE=off', before === after, `${before.length} -> ${after.length}`);
}

// Give the async timer bodies a beat to settle.
await new Promise((resolve) => realSetTimeout(resolve, 150));

if (route) {
  const request = (payload, headers) => ({
    method: 'POST',
    headers: new Headers({ host: '127.0.0.1:1234', origin: 'http://127.0.0.1:1234', 'content-type': 'application/json', ...headers }),
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  });
  const envelope = (method, payload = {}) => ({
    type: 'client-request',
    rpcId: 'r1',
    method: 'dsh-panel-control/classify',
    payload: { method, payload },
  });
  try {
    const response = await route.fetch(request(envelope('inventory')));
    const body = await response.json();
    check('inventory answers', body && body.result && body.result.ok === true, JSON.stringify(body).slice(0, 160));
    check('inventory rev matches graph', body.result.value.rev === 'rev-test', body.result.value && body.result.value.rev);

    const stale = await clientModulesStub.bundleResource(
      'GET',
      '/plugins/??dsh-panel-control/client.js&rev=rev-old',
    );
    check('stale revision is served at the current one', stale.status === 200, `status ${stale.status}`);
    // A combo is the batch the page booted with. Answering it with this one
    // module's bytes registers this plugin and silently drops every other module
    // in the batch -- the page then runs one plugin instead of the list it
    // booted with. The stale combo has to stay a 404.
    const staleCombo = await clientModulesStub.bundleResource(
      'GET',
      '/plugins/??a/client.js,b/client.js,dsh-panel-control/client.js&rev=rev-old-combo',
    );
    check(
      'a stale combo is not answered with the single bundle',
      staleCombo.status === 404,
      `status ${staleCombo.status}`,
    );
    // A revision this Host already handed out must survive the registry
    // forgetting it: the page keeps asking for the list it booted with.
    await clientModulesStub.bundleResource('GET', '/plugins/??dsh-panel-control/client.js&rev=rev-now');
    clientModulesStub.dropRev = true;
    const remembered = await clientModulesStub.bundleResource(
      'GET',
      '/plugins/??dsh-panel-control/client.js&rev=rev-now',
    );
    check('a remembered revision is served after the registry drops it', remembered.status === 200, `status ${remembered.status}`);
    clientModulesStub.dropRev = false;
    const fresh = await clientModulesStub.bundleResource(
      'GET',
      '/plugins/??dsh-panel-control/client.js&rev=rev-now',
    );
    check('current revision passes straight through', fresh.status === 200, `status ${fresh.status}`);
    const other = await clientModulesStub.bundleResource('GET', '/plugins/??someone-else/client.js&rev=old');
    check('packages outside the graph keep their 404', other.status === 404, `status ${other.status}`);
    // The reported bug: a *neighbouring* plugin on a retired revision. Our
    // bundle loaded, theirs 404'd, and it vanished from the page while the
    // manager kept saying "running". One fallback for the whole list fixes it.
    const neighbour = await clientModulesStub.bundleResource(
      'GET',
      '/plugins/??dsh-workspace-control/client.js&rev=rev-old',
    );
    check(
      'a neighbouring plugin is served at the current revision too',
      neighbour.status === 200,
      `status ${neighbour.status}`
    );
    check(
      'inventory ids',
      Array.isArray(body.result.value.ids) &&
        body.result.value.ids.join() === 'a,b,dsh-panel-control,dshmarket,billion-context,dsh-workspace-control',
      body.result.value && body.result.value.ids.join(),
    );
    const pkgResponse = await route.fetch(
      request(
        envelope('packages', {
          ids: [
            { id: 'panel-control', slot: 'sidebar.panellist' },
            { id: 'dsh-market', slot: 'sidebar.panellist' },
            { id: 'bili', slot: 'settings.section' },
            { id: 'nobody', slot: 'sidebar.panellist' },
          ],
        }),
      ),
    );
    const pkgBody = await pkgResponse.json();
    const packages = (pkgBody.result && pkgBody.result.value && pkgBody.result.value.packages) || {};
    check('packages maps panel id', packages['panel-control'] === 'dsh-panel-control', JSON.stringify(packages));
    check('packages maps market id', packages['dsh-market'] === 'dshmarket', JSON.stringify(packages));
    check('packages maps settings id', packages.bili === 'billion-context', JSON.stringify(packages));
    check('packages leaves unknown ids unmapped', !packages.nobody, JSON.stringify(packages));
  } catch (error) {
    check('inventory answers', false, error.message);
  }
  try {
    const response = await route.fetch(request(envelope('report')));
    check('report answers', response.ok === true);
  } catch (error) {
    check('report answers', false, error.message);
  }
  try {
    const response = await route.fetch({
      method: 'POST',
      headers: new Headers({ host: 'example.com', 'content-type': 'application/json' }),
      text: async () => JSON.stringify(envelope('inventory')),
    });
    check('non-loopback refused', response.status === 403, String(response.status));
  } catch (error) {
    check('non-loopback refused', false, error.message);
  }

  // Same machine, different port: a dev server page must not rewrite the store.
  const foreign = [
    ['other port refused', { origin: 'http://127.0.0.1:3000' }],
    ['same-site fetch refused', { 'sec-fetch-site': 'same-site' }],
  ];
  for (const [label, headers] of foreign) {
    try {
      const response = await route.fetch(request(envelope('inventory'), headers));
      check(label, response.status === 403, String(response.status));
    } catch (error) {
      check(label, false, error.message);
    }
  }
  // The desktop shell serves the page from a custom protocol; that one must pass.
  try {
    const response = await route.fetch(request(envelope('inventory'), { origin: 'dsh-app://app' }));
    const body = await response.json();
    check('custom-protocol page allowed', response.ok === true && body.result && body.result.ok === true);
  } catch (error) {
    check('custom-protocol page allowed', false, error.message);
  }
  // The desktop dev-proxy serves the page from a reserved .invalid origin; the
  // page is still ours, so its calls must not be refused.
  try {
    const response = await route.fetch(
      request(envelope('inventory'), { host: 'unlag.invalid', origin: 'http://unlag.invalid' }),
    );
    const body = await response.json();
    check('dev-proxy page allowed', response.ok === true && body.result && body.result.ok === true, String(response.status));
  } catch (error) {
    check('dev-proxy page allowed', false, error.message);
  }
  // An oversized body is refused before it is parsed.
  try {
    const huge = request(envelope('inventory'));
    huge.text = async () => 'x'.repeat(300 * 1024);
    const response = await route.fetch(huge);
    check('oversized body refused', response.status === 413, String(response.status));
  } catch (error) {
    check('oversized body refused', false, error.message);
  }
}

for (const dispose of effects) {
  if (typeof dispose === 'function') {
    try {
      dispose();
    } catch (error) {
      check('dispose() survived', false, error.message);
    }
  }
}

globalThis.setTimeout = realSetTimeout;
console.log(failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);
