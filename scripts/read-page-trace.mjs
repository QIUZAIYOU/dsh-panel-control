#!/usr/bin/env node
/**
 * Read the page-side trace this plugin leaves in the renderer's localStorage.
 *
 * The Host never hears from the Client half when the runner does not apply it,
 * so the trace is written by the bundle's own module scope and picked up here,
 * offline, straight out of Chromium's Local Storage LevelDB. No browser, no
 * DevTools, no waiting on a person to read a window title.
 *
 * Usage: node scripts/read-page-trace.mjs [--out <file>]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEY = 'dsh.panel-control.trace';
const ROAMING = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const PROFILE = path.join(ROAMING, '@deepseek-ai', 'dsh-desktop', 'Local Storage', 'leveldb');
const OUT = (() => {
  const at = process.argv.indexOf('--out');
  return at !== -1 ? process.argv[at + 1] : path.join(process.env.USERPROFILE || os.homedir(), '.dsh', 'panel-control', 'page-trace.log');
})();

function printable(text) {
  return text.replace(/[^\x20-\x7e\u4e00-\u9fff]/g, ' ').replace(/ {2,}/g, ' ').trim();
}

const found = [];
let files = [];
try {
  files = fs.readdirSync(PROFILE).filter((name) => /\.(log|ldb)$/.test(name));
} catch (error) {
  console.error('cannot read', PROFILE, error.message);
  process.exit(1);
}

for (const name of files) {
  const buf = fs.readFileSync(path.join(PROFILE, name));
  // keys are UTF-8, values are UTF-16LE: read the key to confirm the entry, then
  // decode the UTF-16LE value that carries the stage list.
  const keyAt = buf.toString('latin1').indexOf(KEY);
  const needle = Buffer.from('#ml=', 'utf16le');
  let value = '';
  let at = buf.indexOf(needle);
  while (at !== -1) {
    const slice = buf.subarray(Math.max(0, at - 800), at + 1600);
    value += printable(slice.toString('utf16le')) + '\n';
    at = buf.indexOf(needle, at + 1);
  }
  if (keyAt !== -1 || value) found.push({ name, keyAt, value: value.trim() });
}

// The full boot manifest sits under its own key; it is the only place that says
// whether the page was handed the same module twice.
const bootNeedle = Buffer.from('"dupes":', 'utf16le');
const boots = [];
for (const name of files) {
  const buf = fs.readFileSync(path.join(PROFILE, name));
  let at = buf.indexOf(bootNeedle);
  while (at !== -1) {
    const text = printable(buf.subarray(Math.max(0, at - 120), at + 9000).toString('utf16le')).trim();
    if (text) boots.push(text);
    at = buf.indexOf(bootNeedle, at + 1);
  }
}

// Small always-fresh record: "DPCPAGE|" is written on every stage and on every
// page error, so at least one copy stays in the live (uncompressed) log file.
const pageNeedle = Buffer.from('DPCPAGE|', 'utf16le');
const notes = [];
for (const name of files) {
  const buf = fs.readFileSync(path.join(PROFILE, name));
  let at = buf.indexOf(pageNeedle);
  while (at !== -1) {
    const text = printable(buf.subarray(at, at + 4000).toString('utf16le'));
    if (text) notes.push(`${name}: ${text}`);
    at = buf.indexOf(pageNeedle, at + 1);
  }
}
const lines = [];
lines.push(`read ${new Date().toISOString()} from ${PROFILE}`);
lines.push(`files: ${files.join(' ')}`);
if (found.length === 0) {
  lines.push(`no "${KEY}" entry: the bundle's module scope never ran in that page`);
} else {
  for (const item of found) {
    lines.push('');
    lines.push(`== ${item.name} (key at ${item.keyAt})`);
    lines.push(item.value || '(key present, value unreadable)');
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// BOOT KEY: "dsh.panel-control.trace.boot"
lines.push('');
lines.push('== page note');
if (notes.length === 0) lines.push('none');
else lines.push(notes.join('\n---\n'));
lines.push('');
lines.push('== boot dump');
if (boots.length === 0) lines.push('no boot dump: the bundle never described one');
else lines.push(boots.join('\n---\n'));
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
console.log('\nwritten to', OUT);
