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
import { createRequire } from 'node:module';
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
// Tests (and anyone sandboxing this plugin) point DPC_STATE_DIR somewhere else;
// the smoke harness writes here, and it must not touch the real preferences or
// the real log that support questions get asked about.
const STATE_DIR = process.env.DPC_STATE_DIR
  ? path.resolve(process.env.DPC_STATE_DIR)
  : path.join(os.homedir(), '.dsh', 'panel-control');
const PREFS_FILE = path.join(STATE_DIR, 'prefs.json');
const HOST_LOG = path.join(STATE_DIR, 'host.log');
const CLIENT_LOG = path.join(STATE_DIR, 'client.log');
const MAX_PREFS_BYTES = 256 * 1024;
const LOG_KEEP_BYTES = 256 * 1024;

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
 * The desktop's dev-proxy serves the page from a reserved origin such as
 * `http://unlag.invalid`. That TLD never resolves, so only a proxy running
 * inside this Host can put it in a Host header -- but the page is still ours.
 * Treating it as foreign refused every call the plugin made for itself.
 */
function isProxyAuthority(authority) {
  if (typeof authority !== 'string' || authority === '') return false;
  try {
    const url = new URL(`http://${authority}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    return /\.invalid$/.test(url.hostname.replace(/\.$/, ''));
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
  const proxied = isProxyAuthority(host);
  if (!isLoopbackAuthority(host) && !proxied) return false;
  // A proxied page cannot be told apart by port: the proxy owns the authority.
  if (proxied) return true;
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
  // A page beacon is a plain GET: it has to work from the bundle's module scope,
  // where no service exists yet, and it is the only channel that still speaks
  // when the runner never applies the Client half.
  {
    const beaconUrl = new URL(String(request.url || ''), 'http://beacon.invalid');
    if (beaconUrl.pathname === ROUTE_PATH && beaconUrl.searchParams.has('d')) {
      if (!isOwnRequest(request)) {
        logHost(`page-beacon refused: host=${request.headers.get('host')} origin=${request.headers.get('origin')}`);
        return new Response('forbidden', { status: 403 });
      }
      const text = String(beaconUrl.searchParams.get('d') || '').slice(0, 700);
      logHost(`page-beacon: ${text}`);
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
  }
  if (!isOwnRequest(request)) {
    // Stay quiet here and "the page ran but was refused" looks exactly like
    // "the page never ran": every hostCall returns null on a 403, so the
    // Client half logs nothing either way.
    logHost(
      `refused: ${request.method} host=${request.headers.get('host')} origin=${request.headers.get('origin')} site=${request.headers.get('sec-fetch-site')} · ${String(request.url || '').split('?')[0].slice(0, 80)}`,
    );
    return new Response('forbidden', { status: 403 });
  }
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
    if (method === 'packages') return reply(rpcId, await packageMap(scope, call.payload));
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
    },
  };
}

/**
 * Which package serves each panel / settings section.
 *
 * A slot entry carries no package field: `registrant` is the fiber that ran the
 * registration, and the client runner applies most plugins inside one shared
 * fiber. The package name exists only in the Host's module graph, so this maps
 * an entry id to its module id by reading each module's served bundle and
 * looking for the registration site: the slot literal plus the id as a quoted
 * string. Constant-style registrations keep the two strings close together;
 * an id is only accepted from a module that contains both.
 */
const PACKAGE_SCAN_LIMIT = 8 * 1024 * 1024;
const PACKAGE_CACHE_KEPT = 4;
const packageCache = new Map();

/**
 * How strongly one bundle looks like the registration of `id` in `slot`.
 *
 * `strong` means the quoted id sits immediately after an `id:` / `key:` field
 * (or an `id =` / `key =` assignment), which is the shape of a slot
 * registration. Everything else is only a distance guess and must be close;
 * a long comment can mention both words without registering anything.
 */
function slotMatch(text, slot, id) {
  const slots = [];
  let at = text.indexOf(slot);
  while (at !== -1) {
    slots.push(at);
    at = text.indexOf(slot, at + slot.length);
  }
  if (slots.length === 0) return null;
  let strong = Infinity;
  let weak = Infinity;
  for (const needle of [`'${id}'`, `"${id}"`, '`' + id + '`']) {
    let pos = text.indexOf(needle);
    while (pos !== -1) {
      let distance = Infinity;
      for (const slotAt of slots) distance = Math.min(distance, Math.abs(pos - slotAt));
      const before = text.slice(Math.max(0, pos - 48), pos);
      if (/(?:^|[\s,{;])(?:id|key)\s*[:=]\s*$/.test(before)) strong = Math.min(strong, distance);
      else weak = Math.min(weak, distance);
      pos = text.indexOf(needle, pos + needle.length);
    }
  }
  if (Number.isFinite(strong)) return { strong: true, distance: strong };
  if (weak <= 400) return { strong: false, distance: weak };
  return null;
}

async function readModuleText(modules, id, texts) {
  if (texts.has(id)) return texts.get(id);
  let text = null;
  try {
    const file = modules.clientPath(id);
    if (file) {
      const stat = await fs.stat(file);
      if (stat.isFile() && stat.size <= PACKAGE_SCAN_LIMIT) text = await fs.readFile(file, 'utf8');
    }
  } catch {
    text = null;
  }
  texts.set(id, text);
  return text;
}

async function packageMap(scope, payload) {
  const modules = clientModules || serviceOf(scope, 'clientModules');
  if (!modules || typeof modules.graph !== 'function' || typeof modules.clientPath !== 'function') {
    return refusal('packages-unavailable', 'The Host module graph does not expose client paths.');
  }
  const graph = modules.graph();
  if (!graph || !Array.isArray(graph.entries)) {
    return refusal('packages-unavailable', 'The Host module graph is not readable.');
  }
  const requested = [];
  const seen = new Set();
  for (const raw of Array.isArray(payload && payload.ids) ? payload.ids : []) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const slot = raw.slot === 'settings.section' ? 'settings.section' : 'sidebar.panellist';
    if (!id || id.length > 120 || seen.has(slot + ':' + id)) continue;
    seen.add(slot + ':' + id);
    requested.push({ id, slot });
  }
  if (requested.length === 0) return { ok: true, value: { packages: {}, rev: graph.rev || null } };
  // Stable order makes two calls for the same set share the cache entry.
  requested.sort((left, right) => (left.slot + ':' + left.id).localeCompare(right.slot + ':' + right.id));
  const key = String(graph.rev || '') + '|' + requested.map((row) => row.slot + ':' + row.id).join(',');
  if (packageCache.has(key)) return { ok: true, value: packageCache.get(key) };

  const packages = {};
  const best = new Map();
  const texts = new Map();
  for (const entry of graph.entries) {
    const moduleId = entry && typeof entry.id === 'string' ? entry.id : '';
    if (!moduleId) continue;
    const text = await readModuleText(modules, moduleId, texts);
    if (!text) continue;
    for (const want of requested) {
      if (!text.includes(want.slot)) continue;
      // A bundle may mention a generic id (the plugin manager's id is also a
      // dictionary word). A real registration field wins over a mere mention,
      // and within the same tier the closest match wins over graph order.
      const match = slotMatch(text, want.slot, want.id);
      if (!match) continue;
      const previous = best.get(want.id);
      if (previous) {
        if (previous.strong && !match.strong) continue;
        if (previous.strong === match.strong && previous.distance <= match.distance) continue;
      }
      best.set(want.id, { moduleId, strong: match.strong, distance: match.distance });
    }
  }
  for (const [id, match] of best) packages[id] = match.moduleId;
  const value = { packages, rev: typeof graph.rev === 'string' ? graph.rev : null };
  packageCache.set(key, value);
  while (packageCache.size > PACKAGE_CACHE_KEPT) packageCache.delete(packageCache.keys().next().value);
  return { ok: true, value };
}

/**
 * Write one line per apply that answers the only question a cold start leaves
 * open: did this package even reach the Host's plugin graph?
 *
 * The page can only load what the graph advertises, so "missing from the list"
 * and "listed but never fetched" have completely different fixes. One line,
 * once per apply, settles it from `host.log` alone.
 */
function logInventoryOnApply(scope) {
  try {
    const snapshot = inventorySnapshot(scope);
    if (!snapshot.ok) {
      logHost(`graph: unreadable (${String(snapshot.error && snapshot.error.message)})`);
      return;
    }
    const value = snapshot.value;
    const listed = value.ids.includes(PACKAGE);
    logHost(
      `graph: ${listed ? 'lists' : 'does not list'} ${PACKAGE} · rev ${value.rev} · ` +
        `${value.ids.length} client entr${value.ids.length === 1 ? 'y' : 'ies'}`,
    );
    if (listed) {
      void probeOwnBundle(scope);
      logBatchPlacement(scope);
    }
  } catch (error) {
    logHost(`graph: probe failed (${describeError(error)})`);
  }
}

/**
 * Where in the composed graph this package sits. The page's frozen list names
 * our package by two URLs: the single-resource URL on `entry.url` (rev == our
 * artifact rev) and the batch URL it actually boots with (a combo rev shared
 * with the neighbours). When a cold start serves the batch but never executes
 * it, these lines show whether the page's batch rev matches the one the Host
 * composed now, or is a retired batch.
 */
function logBatchPlacement(scope) {
  try {
    const modules = clientModules || serviceOf(scope, 'clientModules');
    const graph = modules && typeof modules.graph === 'function' ? modules.graph() : null;
    const entries = graph && Array.isArray(graph.entries) ? graph.entries : [];
    const batches = graph && Array.isArray(graph.batches) ? graph.batches : [];
    const entry = entries.find((row) => row && row.id === PACKAGE);
    if (entry) {
      logHost(
        `graph: own row ${JSON.stringify({
          id: entry.id,
          url: entry.url,
          rev: entry.rev,
          immediately: entry.immediately,
          inject: entry.inject,
          external: entry.external,
        })}`,
      );
    }
    // Every row, once per start: a repeated id, or two ids over one bundle, is what makes a
    // page apply a plugin twice and collide on the slot ids it registers.
    const rows = entries.map((row) => ({
        id: row && row.id,
        rev: row && row.rev,
        immediately: row && row.immediately,
        url: String((row && row.url) || '').slice(0, 120),
      }));
      const byId = new Map();
      for (const row of rows) byId.set(row.id, (byId.get(row.id) || 0) + 1);
      const repeated = [...byId].filter((pair) => pair[1] > 1).map((pair) => `${pair[0]}x${pair[1]}`);
      const byUrl = new Map();
      for (const row of rows) {
        const key = String(row.url || '').split('&rev=')[0];
        byUrl.set(key, [...(byUrl.get(key) || []), row.id]);
      }
      const shared = [...byUrl].filter((pair) => pair[1].length > 1).map((pair) => `${pair[0]} <- ${pair[1].join(',')}`);
      logHost(`graph: batches=${batches.length} rows=${rows.length} repeated=${JSON.stringify(repeated)} shared-bundle=${JSON.stringify(shared.slice(0, 4))}`);
        for (const batch of batches) {
          const ids = batch && Array.isArray(batch.entries) ? batch.entries : [];
          logHost(`graph: batch dump one phase=${String(batch && batch.phase)} rev=${String(batch && batch.rev)} n=${ids.length} ws=${ids.includes('dsh-workspace-control')} pc=${ids.includes(PACKAGE)}`);
        }
      logHost(`graph: ids ${rows.map((row) => row.id).join(',')}`);
    for (const batch of batches) {
      if (!batch || !Array.isArray(batch.entries) || !batch.entries.includes(PACKAGE)) continue;
      const index = batch.entries.indexOf(PACKAGE);
      const neighbours = batch.entries
        .slice(Math.max(0, index - 1), index + 2)
        .map((id, i) => (id === PACKAGE ? `[${id}]` : id))
        .join(',');
      logHost(
        `graph: batch ${batch.phase} · rev ${String(batch.rev)} · ${batch.entries.length} entries · ` +
          `#${index} near {${neighbours}} · url ${String(batch.url)}`,
      );
    }
  } catch (error) {
    logHost(`graph: batch placement failed (${describeError(error)})`);
  }
}

/**
 * Serve the current revision when a page asks for one this process has retired.
 *
 * The registry addresses every bundle by a revision derived from the file's
 * mtime, ctime and size, and it answers only the revisions it read at
 * composition time ("versioned code is immutable"). A page keeps the list it
 * booted with, so as soon as this package's file is rewritten - by an editor, by
 * git normalising line endings, or by the retry nudge that used to live here -
 * the page's revision stops existing and its request becomes a 404 that nothing
 * reports: the plugin is simply absent from the sidebar.
 *
 * This wraps the registry's own resource lookup for this one package. A 404 for
 * a stale revision is retried at the revision the Host holds now, and the page
 * gets the bytes it needs; everything else passes straight through, and the
 * patch is undone on teardown.
 */
// Off by default: rewriting the shared bundle service is a whole-page change that
// other plugins pay for. It stays available as an explicit escape hatch only.
const SERVE_CURRENT = String(process.env.DPC_SERVE_CURRENT || '').toLowerCase() === 'on';
let servePatched = null;
let serveLoggedAt = 0;
/**
 * Bytes this Host has already served, kept by revision.
 *
 * The registry serves a revision only while it is the current one. A page
 * (or a page rebuilt by another tool) keeps asking for the revision it booted
 * with, so the copy we handed out is the only thing that can answer it later.
 * Five revisions is a few hundred kilobytes and covers a run of edits.
 */
const servedBytes = new Map();
const SERVED_BYTES_KEPT = 5;

/**
 * A combo request asks for several bundles at once (`/plugins/??a,b,c`).
 *
 * A combo response can only be answered whole: handing back one module's bytes
 * for a combo URL is not a stale revision, it is a broken batch. The page that
 * receives it registers this plugin and nothing else in the batch, so every
 * plugin after ours in the composition disappears without an error. Keep the
 * two shapes strictly apart.
 */
function isComboUrl(url) {
  const value = String(url || '');
  const query = value.indexOf('??');
  return query !== -1 && value.slice(query + 2).split('&')[0].includes(',');
}

/** Bytes are remembered per (revision, shape): one revision can exist as a
 * single bundle and as a combo, and the two bodies are not interchangeable. */
function servedKey(url) {
  return `${revisionOf(url) || ''}|${isComboUrl(url) ? 'combo' : 'single'}`;
}
/** Requests to log per Host process: enough to see a boot, not a chatty stream. */
let bundleAsked = 0;
const BUNDLE_ASK_LIMIT = 120;

function revisionOf(url) {
  const match = /[?&]rev=([A-Za-z0-9._-]+)/.exec(String(url || ''));
  return match ? match[1] : null;
}

function serveCurrentRevision(scope) {
  if (!SERVE_CURRENT || servePatched) return;
  const modules = clientModules || serviceOf(scope, 'clientModules');
  if (!modules || typeof modules.bundleResource !== 'function') return;
  const original = modules.bundleResource.bind(modules);
  servePatched = modules;
  modules.bundleResource = async function bundleResourceWithFallback(method, url) {
    const answer = await original(method, url);
    // Log every bundle the page asks for, whichever plugin it belongs to: when a
    // neighbour disappears, the question is whether its script *failed to arrive*
    // (a status code here) or arrived and failed (a client-side message instead).
    const askedUrl = String(url || '');
    if (askedUrl.includes('??') && bundleAsked < BUNDLE_ASK_LIMIT) {
      bundleAsked += 1;
      logHost(
        `bundle: asked ${isComboUrl(askedUrl) ? 'combo' : 'single'} ` +
          `rev ${String(revisionOf(askedUrl))} -> ${answer && answer.status} · ${askedUrl.slice(0, 160)}`,
      );
    }
    if (answer && answer.status === 200 && method === 'GET' && String(url || '').includes(PACKAGE)) {
      const rev = revisionOf(url);
      if (rev && typeof answer.body === 'string') {
        const key = servedKey(url);
        servedBytes.delete(key);
        servedBytes.set(key, answer);
        while (servedBytes.size > SERVED_BYTES_KEPT) {
          servedBytes.delete(servedBytes.keys().next().value);
        }
      }
    }
    if (answer && answer.status !== 404) return answer;
    try {
      const requested = String(url || '');
      // A revision this Host already handed out outranks the current one: the
      // page booted with it, and its list will keep naming it.
      const asked = revisionOf(requested);
      const remembered = asked && requested.includes(PACKAGE)
        ? servedBytes.get(servedKey(requested))
        : undefined;
      if (remembered !== undefined) {
        if (Date.now() - serveLoggedAt > 30_000) {
          serveLoggedAt = Date.now();
          logHost(
            `served ${PACKAGE} again at revision ${asked}: the page still runs the list it booted with`,
          );
        }
        return method === 'HEAD' ? { ...remembered, body: undefined } : remembered;
      }
      // Only a single-bundle request may be re-pointed at the current revision.
      // A combo has to be answered as the batch it asked for: replying with this
      // package alone drops every other module the page listed, and the ones
      // ordered after us in the composition never run. Let the registry's 404
      // through instead, so the page reloads its list instead of half-booting.
      if (isComboUrl(requested)) {
        if (Date.now() - serveLoggedAt > 30_000) {
          serveLoggedAt = Date.now();
          logHost(
            `bundle: stale combo rev ${String(asked)} left as a 404 (a batch cannot be ` +
              'answered with one module; the page must reload its plugin list)',
          );
        }
        return answer;
      }
      const graph = typeof modules.graph === 'function' ? modules.graph() : null;
      const rows = graph && Array.isArray(graph.entries) ? graph.entries : [];
      // Every plugin that declares `immediately` is fetched as a single bundle
      // of its own, so a retired revision drops exactly one plugin: its script
      // never runs, it never registers a slot, and the manager still reports it
      // running. Rescuing only this package made this plugin outlive its
      // neighbours: the one carrying the fallback survived while the one next
      // to it vanished. Rescue every row the page named instead.
      const entry = rows.find(
        (row) =>
          row &&
          typeof row.id === 'string' &&
          typeof row.url === 'string' &&
          requested.includes(`${row.id}/client.js`),
      );
      if (!entry) return answer;
      const retryUrl = entry.url.startsWith('/') ? entry.url : `/${entry.url}`;
      if (retryUrl === requested) return answer;
      const retried = await original(method, retryUrl);
      if (!retried || retried.status !== 200) return answer;
      if (Date.now() - serveLoggedAt > 30_000) {
        serveLoggedAt = Date.now();
        logHost(
          entry.id === PACKAGE
            ? `served ${PACKAGE} at the current revision: the page asked for a retired ` +
              'one (its plugin list predates the last write to client.js)'
            : `served ${entry.id} at the current revision: the page asked for a retired ` +
              'one, and a missing bundle silently drops that plugin',
        );
      }
      return retried;
    } catch (error) {
      logHost(`stale revision fallback failed: ${describeError(error)}`);
      return answer;
    }
  };
}

function releaseServeCurrent() {
  const modules = servePatched;
  servePatched = null;
  if (!modules) return;
  try {
    delete modules.bundleResource;
  } catch {
    /* a frozen service keeps the wrapper; it only ever adds a retry */
  }
}

/**
 * Ask the Host to serve this package's own bundle, the way the page would.
 *
 * A row can be advertised and still be unservable: the registry answers only
 * the revisions it read at composition time, and everything else is a 404 that
 * the page drops without a word. Runs the same request the browser would make.
 */
async function probeOwnBundle(scope) {
  try {
    const modules = clientModules || serviceOf(scope, 'clientModules');
    const graph = modules && typeof modules.graph === 'function' ? modules.graph() : null;
    const entries = graph && Array.isArray(graph.entries) ? graph.entries : [];
    const entry = entries.find((row) => row && row.id === PACKAGE);
    if (!entry || typeof entry.url !== 'string' || typeof modules.fetchBundle !== 'function') return;
    const response = await modules.fetchBundle({ method: 'GET', url: entry.url });
    logHost(
      `graph: own bundle at rev ${String(entry.rev)} answers ${response.status}` +
        (response.status === 200 ? '' : ' — the page cannot load a bundle the Host will not serve'),
    );
  } catch (error) {
    logHost(`graph: own bundle probe failed (${describeError(error)})`);
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
      logInventoryOnApply(scope);
      serveCurrentRevision(scope);
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
        releaseServeCurrent();
      },
      `${PACKAGE}: classification route`,
    );
  }
}
