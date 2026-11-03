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
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// `npm run smoke -- <file>` points the harness at another copy, which is how
// a regression (or the broken revision that shipped once) gets reproduced.
const override = process.argv[2];
const MODULE = pathToFileURL(override ? path.resolve(override) : path.join(here, '..', 'index.js')).href;

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
      return { graph: () => ({ rev: 'rev-test', release: 'rel', entries: [{ id: 'a' }, { id: 'b' }], batches: [] }) };
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
// Give the async timer bodies a beat to settle.
await new Promise((resolve) => realSetTimeout(resolve, 150));

if (route) {
  const request = (payload) => ({
    method: 'POST',
    headers: new Headers({ host: '127.0.0.1:1234', origin: 'http://127.0.0.1:1234', 'content-type': 'application/json' }),
    json: async () => payload,
  });
  const envelope = (method) => ({
    type: 'client-request',
    rpcId: 'r1',
    method: 'dsh-panel-control/classify',
    payload: { method, payload: {} },
  });
  try {
    const response = await route.fetch(request(envelope('inventory')));
    const body = await response.json();
    check('inventory answers', body && body.result && body.result.ok === true, JSON.stringify(body).slice(0, 160));
    check('inventory rev matches graph', body.result.value.rev === 'rev-test', body.result.value && body.result.value.rev);
    check('inventory ids', Array.isArray(body.result.value.ids) && body.result.value.ids.join() === 'a,b');
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
      json: async () => envelope('inventory'),
    });
    check('non-loopback refused', response.status === 403, String(response.status));
  } catch (error) {
    check('non-loopback refused', false, error.message);
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
