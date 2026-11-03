/**
 * Host half of dsh-panel-control.
 *
 * The client half manages the panel-navigation area of the sidebar. Everything
 * it needs is local except one thing: "auto classify" asks a model to file the
 * entries into groups, and only the Host can reach a model.
 *
 * So this half does exactly one job: it registers one POST route under the
 * /api carrier every DSH Host already serves, and answers it with a single
 * non-streaming completion from the profile's default model. The Client calls
 * it through `ctx.connection.rpc.call`, so authentication, the request
 * envelope and the response envelope stay the Host's own, not ours.
 *
 * Nothing is streamed back: the caller needs a small JSON object, and the reply
 * is one short generation (a few hundred output tokens at most).
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = 'dsh-panel-control';
const ENDPOINT = 'dsh-panel-control/classify';
const ROUTE_PATH = `/api/${ENDPOINT}`;

/**
 * Where the Client's settings live.
 *
 * `localStorage` is not good enough for this: the renderer's origin is the
 * Host's loopback address, and its port changes between app launches, so every
 * restart lands on a fresh, empty storage area and the sidebar silently falls
 * back to registration order. A file under the profile's data directory
 * survives restarts, upgrades and origin changes alike.
 */
const STATE_DIR = path.join(os.homedir(), '.dsh', 'panel-control');
const PREFS_FILE = path.join(STATE_DIR, 'prefs.json');
const HOST_LOG = path.join(STATE_DIR, 'host.log');
const CLIENT_LOG = path.join(STATE_DIR, 'client.log');
const MAX_PREFS_BYTES = 256 * 1024;
const LOG_KEEP_BYTES = 256 * 1024;

/** The Client half this Host half ships with, used by the recovery nudge below. */
const CLIENT_FILE = fileURLToPath(new URL('./client.js', import.meta.url));

/** Set `DPC_NUDGE=off` to keep the Host strictly read-only about its own files. */
const NUDGE_ENABLED = String(process.env.DPC_NUDGE || '').toLowerCase() !== 'off';

/** Set once the nudge below actually rewrote the Client file in this process. */
let recoveredAt = 0;

/** `String.fromCharCode(10)`: a literal newline in source is easy to mangle. */
const NL = String.fromCharCode(10);

/** Identifies one Host process, so a log spanning several launches shows which
 * apply/mount lines belong together. */
const BOOT = Math.random().toString(36).slice(2, 8);

/** Route limits: this endpoint spends model tokens, so only local callers and
 * only a small body are accepted. */
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ENTRIES = 64;
const MAX_GROUPS = 4;
const MAX_OUTPUT_TOKENS = 700;
const TIMEOUT_MS = 45_000;

/* ------------------------------------------------------------------ helpers */

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLoopbackAuthority(authority) {
  if (typeof authority !== 'string' || authority === '') return false;
  try {
    const url = new URL(`http://${authority}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    const hostname = url.hostname.replace(/\.$/, '');
    return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Only the page the Host itself served may call this route.
 *
 * "Host and Origin are both loopback" is not enough: every dev server, every
 * other app's webview and every local playground on this machine is also
 * loopback, so that check let them rewrite the user's layout and spend model
 * tokens. The discriminator is the port: the page is same-origin only when its
 * origin carries the very authority this request arrived on.
 */
function isOwnRequest(request) {
  const host = request.headers.get('host');
  if (!isLoopbackAuthority(host)) return false;
  // A browser labels where the request came from; anything but same-origin (or
  // a non-browser caller) is a different page and has no business here.
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  try {
    const url = new URL(origin);
    if (url.host === host) return true;
    // The desktop shell serves the page from a custom protocol: that page is
    // still the Host's own, even though its origin is not an http authority.
    return url.protocol === 'dsh-app:' || url.protocol === 'file:';
  } catch {
    return false;
  }
}

function reply(rpcId, result) {
  // Connection's client requires `error.details`, even when empty.
  const value =
    result && result.ok === false
      ? { ...result, error: { ...result.error, details: (result.error && result.error.details) || {} } }
      : result;
  return Response.json({ type: 'server-response', rpcId, result: value });
}

function refusal(code, message) {
  return { ok: false, error: { code, message } };
}

function describeError(error) {
  if (error && typeof error.message === 'string' && error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/* --------------------------------------------------------------- local state */

async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

async function appendLine(file, line) {
  try {
    await ensureStateDir();
    await fs.appendFile(file, `${new Date().toISOString()} [${BOOT}] ${line}\n`, 'utf8');
    const stat = await fs.stat(file);
    if (stat.size > LOG_KEEP_BYTES) {
      const text = await fs.readFile(file, 'utf8');
      await fs.writeFile(file, text.slice(-Math.floor(LOG_KEEP_BYTES / 2)), 'utf8');
    }
  } catch {
    /* Logging is a convenience: it must never break a request. */
  }
}

const logHost = (line) => {
  void appendLine(HOST_LOG, line);
};

const logClient = (line) => {
  void appendLine(CLIENT_LOG, line);
};

async function readPrefsFile() {
  try {
    const text = await fs.readFile(PREFS_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    await logHost(`prefs read failed: ${describeError(error)}`);
    return null;
  }
}

async function writePrefsFileNow(prefs) {
  if (!isRecord(prefs)) throw new Error('preferences must be an object');
  const text = JSON.stringify(prefs);
  if (text.length > MAX_PREFS_BYTES) throw new Error('preferences are too large');
  await ensureStateDir();
  const temporary = `${PREFS_FILE}.tmp`;
  await fs.writeFile(temporary, text, 'utf8');
  await fs.rename(temporary, PREFS_FILE);
  return text.length;
}

/**
 * One writer at a time.
 *
 * Two windows (or a retry racing the debounce) otherwise both write the same
 * `.tmp` path: one rename wins, the other fails with EPERM/EEXIST and that save
 * is lost even though the caller was told nothing. A promise chain costs nothing
 * here -- saves are rare and small -- and keeps the last write the one on disk.
 */
let writeChain = Promise.resolve();

function writePrefsFile(prefs) {
  const next = writeChain.then(
    () => writePrefsFileNow(prefs),
    () => writePrefsFileNow(prefs),
  );
  // Keep the chain alive after a rejection: the caller still gets the error.
  writeChain = next.catch(() => {});
  return next;
}

/* ------------------------------------------------------------------- prompt */

/**
 * One prompt, no chat history: the model answers a single question about a
 * short list. Everything it needs is inside the message, and the reply is
 * parsed defensively because a model can always answer with prose.
 */
function buildPrompt(draft) {
  const language = draft.locale === 'zh' ? '中文' : 'English';
  const groupNames = (draft.groups || []).map((group) => group.name).filter(Boolean);
  const entries = draft.entries.map((entry) => ({ id: entry.id, label: entry.label }));
  return [
    `You are filing the entry list of a developer tool's sidebar into a few named sections.`,
    `Answer in ${language}.`,
    ``,
    `Existing section names (reuse them when they fit; you may add new ones):`,
    groupNames.length ? JSON.stringify(groupNames) : '[] (none yet)',
    ``,
    `Entries to file, as JSON:`,
    JSON.stringify(entries),
    ``,
    `Rules:`,
    `- Produce 2 to ${MAX_GROUPS} sections; every entry appears in exactly one section.`,
    `- Section names are short: 2-4 Chinese characters, or 1-3 English words.`,
    `- Group by what the entries are for, not by their order.`,
    `- Answer with a single JSON object and nothing else: {"groups":[{"name":"...","ids":["..."]}]}`,
    `- No prose, no markdown fence, no comments.`,
  ].join('\n');
}

/** Pull the first JSON object out of a model reply (tolerates a code fence). */
function extractJson(text) {
  const raw = typeof text === 'string' ? text : '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Keep only the answer this caller can use: known ids, at most MAX_GROUPS
 * sections, short names, no duplicates. */
function sanitizeAnswer(answer, draft) {
  if (!isRecord(answer) || !Array.isArray(answer.groups)) return null;
  const known = new Set(draft.entries.map((entry) => entry.id));
  const used = new Set();
  const groups = [];
  for (const group of answer.groups) {
    if (!isRecord(group) || !Array.isArray(group.ids)) continue;
    const name = typeof group.name === 'string' ? group.name.trim().slice(0, 24) : '';
    const ids = [];
    for (const id of group.ids) {
      if (typeof id !== 'string' || !known.has(id) || used.has(id)) continue;
      used.add(id);
      ids.push(id);
    }
    if (ids.length === 0) continue;
    groups.push({ name: name || `#${groups.length + 1}`, ids });
    if (groups.length >= MAX_GROUPS) break;
  }
  if (groups.length === 0) return null;
  return { groups };
}

/* --------------------------------------------------------------------- call */

function serviceOf(scope, key) {
  try {
    if (scope && typeof scope.get === 'function') {
      const value = scope.get(key);
      if (value !== undefined && value !== null) return value;
    }
  } catch {
    /* a service that is not available yet reads as missing, not as a crash */
  }
  try {
    return scope ? scope[key] : undefined;
  } catch {
    return undefined;
  }
}

function currentModel(scope) {
  const defaults = serviceOf(scope, 'agentDefaultModel');
  if (defaults && typeof defaults.currentSelection === 'function') {
    try {
      const selection = defaults.currentSelection();
      if (selection && typeof selection.provider === 'string' && typeof selection.model === 'string') {
        return selection;
      }
    } catch {
      /* fall through: the LLM service may still know a default */
    }
  }
  return null;
}

/** One non-streaming completion: the joined text of a single stream. */
async function complete(scope, prompt, signal) {
  const llm = serviceOf(scope, 'llm');
  if (!llm || typeof llm !== 'object') throw new Error('the Host LLM service is not available');
  const selection = currentModel(scope);
  if (!selection) throw new Error('no default model is configured for this profile');

  const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];
  const request = {
    provider: selection.provider,
    model: selection.model,
    messages,
    maxTokens: MAX_OUTPUT_TOKENS,
  };
  // Filing labels needs no deliberation, and a thinking budget would eat the
  // whole output allowance before a single character of the answer is emitted.
  request.reasoningEffort = 'off';

  let text = '';
  let finish = null;
  const seen = new Set();
  const consume = async (stream) => {
    for await (const chunk of stream) {
      if (!chunk || typeof chunk !== 'object') continue;
      seen.add(String(chunk.type));
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
      else if (chunk.type === 'finish') finish = chunk;
    }
  };

  // `prepareCall` validates the route and freezes the resolved config; the
  // prepared stream only accepts exactly that config, so hand it back as-is.
  let prepared = null;
  if (typeof llm.prepareCall === 'function') prepared = await llm.prepareCall(request, signal);
  if (prepared && typeof prepared.stream === 'function') await consume(prepared.stream(prepared.config));
  else await consume(llm.stream(request));

  if (finish && isRecord(finish.reason)) {
    const kind = finish.reason.kind;
    if (kind && kind !== 'stop' && kind !== 'max-tokens') throw new Error(`the model stopped early (${kind})`);
  }
  return { text, model: `${selection.provider}/${selection.model}`, seen: Array.from(seen).join('+') };
}

/* ------------------------------------------------------------------ handler */

async function classify(scope, payload, signal) {
  if (!isRecord(payload)) return refusal('bad-request', 'The request payload is not an object.');
  const entries = [];
  for (const entry of (Array.isArray(payload.entries) ? payload.entries : []).slice(0, MAX_ENTRIES)) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '') continue;
    entries.push({
      id: entry.id,
      label: typeof entry.label === 'string' && entry.label !== '' ? entry.label.slice(0, 80) : entry.id,
    });
  }
  if (entries.length === 0) return refusal('bad-request', 'There is nothing to file: the entry list is empty.');

  const groups = [];
  for (const group of (Array.isArray(payload.groups) ? payload.groups : []).slice(0, MAX_GROUPS)) {
    if (!isRecord(group) || typeof group.name !== 'string' || group.name.trim() === '') continue;
    groups.push({ name: group.name.trim().slice(0, 24) });
  }

  const draft = { entries, groups, locale: payload.locale === 'zh' ? 'zh' : 'en' };

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), TIMEOUT_MS);
  const mergedSignal = () => {
    if (!signal) return deadline.signal;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      return AbortSignal.any([signal, deadline.signal]);
    }
    return deadline.signal;
  };

  try {
    const answer = await complete(scope, buildPrompt(draft), mergedSignal());
    const parsed = sanitizeAnswer(extractJson(answer.text), draft);
    if (!parsed) {
      logHost(`classify: unusable answer (${answer.seen}, ${answer.text.length} chars)`);
      return refusal('unparsable-answer', 'The model did not answer with usable JSON.');
    }
    const filed = new Set(parsed.groups.flatMap((group) => group.ids));
    logHost(`classify: ${parsed.groups.length} groups over ${filed.size}/${entries.length} entries (${answer.model})`);
    return {
      ok: true,
      value: {
        groups: parsed.groups,
        unfiled: entries.filter((entry) => !filed.has(entry.id)).map((entry) => entry.id),
        model: answer.model,
      },
    };
  } catch (error) {
    const aborted = deadline.signal.aborted || (signal && signal.aborted);
    return refusal(aborted ? 'timeout' : 'model-failed', describeError(error));
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------- route */

async function handle(scope, request) {
  if (!isOwnRequest(request)) return new Response('forbidden', { status: 403 });
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const contentType = request.headers.get('content-type');
  if (!contentType || contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return new Response('content type must be application/json', { status: 415 });
  }

  // Read the text first: `request.json()` would parse the whole body before the
  // size check could refuse it, which is exactly what the limit exists to stop.
  let raw;
  try {
    raw = await request.text();
  } catch {
    return new Response('body is unreadable', { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) return new Response('body too large', { status: 413 });
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return new Response('body is not JSON', { status: 400 });
  }

  const rpcId = isRecord(message) && typeof message.rpcId === 'string' ? message.rpcId : 'invalid-request';
  if (
    !isRecord(message) ||
    message.type !== 'client-request' ||
    typeof message.rpcId !== 'string' ||
    message.method !== ENDPOINT ||
    !isRecord(message.payload)
  ) {
    return reply(rpcId, refusal('gateway/bad-request', 'This is not a panel-control request.'));
  }
  const call = message.payload;
  const method = typeof call.method === 'string' ? call.method : '';

  try {
    if (method === 'classify') return reply(rpcId, await classify(scope, call.payload, request.signal));
    if (method === 'load') return reply(rpcId, await loadPreferences());
    if (method === 'save') return reply(rpcId, await savePreferences(call.payload));
    if (method === 'inventory') return reply(rpcId, inventorySnapshot(scope));
    if (method === 'report') {
      const detail = isRecord(call.payload) ? call.payload : {};
      const text = JSON.stringify(detail).slice(0, 4_000);
      logClient(`${typeof detail.kind === 'string' ? detail.kind : 'report'} ${text}`);
      return reply(rpcId, { ok: true, value: { logged: true } });
    }
    return reply(rpcId, refusal('unknown-method', `Unknown method: ${String(call.method)}`));
  } catch (error) {
    logHost(`request ${method || '?'} failed: ${describeError(error)}`);
    return reply(rpcId, refusal('handler-failed', describeError(error)));
  }
}

async function loadPreferences() {
  const prefs = await readPrefsFile();
  return { ok: true, value: { prefs, file: PREFS_FILE } };
}

async function savePreferences(payload) {
  if (!isRecord(payload) || !isRecord(payload.prefs)) {
    return refusal('bad-request', 'A preferences object is required.');
  }
  const bytes = await writePrefsFile(payload.prefs);
  return { ok: true, value: { saved: true, bytes } };
}

/**
 * What the Host is serving to pages right now, taken from the same module graph
 * that builds `window.__DSH_BOOT__`. Comparing revisions is the only reliable
 * way to tell "this page booted with an older plugin list": the page cannot
 * read the Host's list, and the profile manifest says nothing about which
 * plugins actually made it into the served graph.
 */
let clientModules = null;

function inventorySnapshot(scope) {
  if (!clientModules) clientModules = serviceOf(scope, 'clientModules');
  const graph = clientModules && typeof clientModules.graph === 'function' ? clientModules.graph() : null;
  if (!graph || typeof graph.rev !== 'string') return { ok: false, error: { message: 'The plugin graph is not readable.' } };
  const entries = Array.isArray(graph.entries) ? graph.entries : [];
  return {
    ok: true,
    value: {
      rev: graph.rev,
      release: typeof graph.release === 'string' ? graph.release : null,
      ids: entries.map((entry) => String(entry && entry.id)).filter(Boolean),
      // True when this process had to hand itself to the page: the page's list is
      // still stale, but the entry it lacks is this very plugin, so there is
      // nothing left for the user to do.
      recovered: recoveredAt > 0,
    },
  };
}

/**
 * Say it out loud when the page never came back.
 *
 * The Host is up (this half ran) and yet the Client half reports nothing: the
 * window was built from a plugin list that no longer matches the code on disk,
 * so its script request went nowhere and the page silently omits the entry. The
 * user sees a plugin that "does not start", so write the diagnosis where it can
 * be found -- once per launch.
 *
 * This runs in a timer, outside every request and outside Cordis' own error
 * handling: anything thrown here kills the whole Host process. Every branch is
 * therefore contained, and the caller adds one more net.
 */
let watchdogSpoken = false;

async function watchFirstClientBoot(startedAt) {
  try {
    // Several applies can share one process (hot swap); only the first one speaks.
    if (watchdogSpoken) return;
    watchdogSpoken = true;
    let text = '';
    try {
      text = await fs.readFile(CLIENT_LOG, 'utf8');
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
    const since = startedAt - 4_000;
    const reported = text.split(String.fromCharCode(10)).some((line) => {
      if (!line.includes('"kind":"boot"')) return false;
      const stamp = Date.parse(line.slice(0, line.indexOf(' ')));
      return Number.isFinite(stamp) && stamp >= since;
    });
    if (reported) return;
    logHost(
      'client half did not report within 12s: the window is running a plugin list from before this code.',
    );
    // The page will not ask for a script that is not in its frozen list, but it
    // does watch this package's files: one byte-level change to the Client entry
    // makes the loader hand the module to the live page. Flip the trailing
    // newline, so the file stays byte-stable instead of growing on every launch.
    if (!NUDGE_ENABLED) {
      logHost('recovery nudge disabled by DPC_NUDGE=off; the entry stays hidden until the page reloads');
      return;
    }
    try {
      const source = await fs.readFile(CLIENT_FILE, 'utf8');
      const next = source.endsWith(NL + NL) ? source.slice(0, -1) : source + NL;
      await fs.writeFile(CLIENT_FILE, next, 'utf8');
      recoveredAt = Date.now();
      logHost(
        `recovery nudge: rewrote ${path.basename(CLIENT_FILE)} (${next.length - source.length} byte) so the ` +
          'loader hands this plugin to the running page; the sidebar entry should appear within a second',
      );
    } catch (error) {
      logHost(`recovery nudge failed: ${describeError(error)}`);
    }
  } catch (error) {
    logHost(`client boot watchdog failed: ${describeError(error)}`);
  }
}

/** Register the route; returns null while `connection` is not available yet so
 * that the caller can retry on a later tick. */
function mount(scope) {
  const connection = serviceOf(scope, 'connection');
  if (!connection || !connection.fetch || typeof connection.fetch.register !== 'function') return null;
  return connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handle(scope, request),
  });
}

export function apply(ctx) {
  let disposed = false;
  let dispose = null;
  let retry = null;
  let attempts = 0;

  logHost('apply: host half starting');

  const attach = (scope) => {
    if (disposed || dispose) return;
    // A hot swap replaces the services themselves: a reference cached from the
    // previous apply would answer with the old graph.
    clientModules = null;
    attempts += 1;
    try {
      dispose = mount(scope);
    } catch (error) {
      console.error(`[${PACKAGE}] failed to register ${ROUTE_PATH}`, error);
      logHost(`mount failed: ${describeError(error)}`);
    }
    if (dispose) {
      logHost(`route mounted at ${ROUTE_PATH} (attempt ${attempts})`);
      const startedAt = Date.now();
      // A timer callback that throws is fatal for the Host: contain it here and
      // again inside the async body.
      const watchdog = setTimeout(() => {
        void watchFirstClientBoot(startedAt).catch((error) =>
          logHost(`client boot watchdog failed: ${describeError(error)}`),
        );
      }, 12_000);
      if (typeof watchdog.unref === 'function') watchdog.unref();
      return;
    }
    if (!disposed) retry = setTimeout(() => attach(scope), 1000);
  };

  try {
    if (typeof ctx.inject === 'function') ctx.inject(['connection'], attach);
    else attach(ctx);
  } catch (error) {
    console.error(`[${PACKAGE}] host half could not start`, error);
  }

  // Cordis calls this on unload: drop the route and any pending retry.
  if (typeof ctx.effect === 'function') {
    ctx.effect(
      () => () => {
        disposed = true;
        if (retry) clearTimeout(retry);
        retry = null;
        if (typeof dispose === 'function') {
          try {
            dispose();
          } catch {
            /* the Host already tore the route down */
          }
        }
        dispose = null;
      },
      `${PACKAGE}: classification route`,
    );
  }
}
