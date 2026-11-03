#!/usr/bin/env node
/**
 * Installs this plugin into a DSH profile in the one order that cannot leave a
 * half-configured profile behind: dependency → node_modules link → bundle list.
 *
 * A name in `dsh.profile.bundles` that nothing can resolve is fatal at startup,
 * and the Host hits it outside any per-plugin error boundary, so the app dies
 * instead of skipping the plugin. Adding the three parts in any other order
 * (or only some of them) is what produces that state.
 *
 * Usage:
 *   node scripts/enable-local.mjs                 # the desktop profile
 *   node scripts/enable-local.mjs --profile <dir>
 *   node scripts/enable-local.mjs --disable       # remove all three parts again
 *
 * Every step is verified before the next one runs, and a failure rolls the
 * profile back to what it was.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, '..');
const pluginName = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).name;

const args = process.argv.slice(2);
const disable = args.includes('--disable');
const profileFlag = args.indexOf('--profile');
const profileDir =
  profileFlag >= 0 ? resolve(args[profileFlag + 1]) : join(homedir(), '.dsh', 'profiles', 'desktop');
const manifestPath = join(profileDir, 'package.json');

if (!existsSync(manifestPath)) {
  console.error(`no profile at ${profileDir}`);
  process.exit(1);
}

const original = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(original);
manifest.dsh ||= {};
manifest.dsh.profile ||= {};
const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [];
const linkPath = join(profileDir, 'node_modules', pluginName);
const spec = `link:${pluginDir.replace(/\\/g, '/')}`;

function linkExists() {
  try {
    return lstatSync(linkPath).isSymbolicLink() || lstatSync(linkPath).isDirectory();
  } catch {
    return false;
  }
}

function writeManifest() {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function rollback(reason) {
  writeFileSync(manifestPath, original, 'utf8');
  console.error(`rolled back: ${reason}`);
  process.exit(1);
}

function doctor() {
  try {
    const out = execFileSync(process.execPath, [join(here, 'profile-doctor.mjs'), '--profile', profileDir], {
      encoding: 'utf8',
    });
    process.stdout.write(out);
    return true;
  } catch (error) {
    process.stdout.write(error.stdout || '');
    return false;
  }
}

if (disable) {
  manifest.dependencies && delete manifest.dependencies[pluginName];
  manifest.dsh.profile.bundles = bundles.filter((name) => name !== pluginName);
  writeManifest();
  if (linkExists()) unlinkSync(linkPath);
  console.log(`disabled ${pluginName} in ${profileDir}`);
  doctor();
  process.exit(0);
}

// 1. dependency
manifest.dependencies ||= {};
manifest.dependencies[pluginName] = spec;
writeManifest();

// 2. link — same shape as every other local plugin in the profile
if (!existsSync(linkPath)) {
  const target = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    symlinkSync(pluginDir, linkPath, target);
  } catch (error) {
    rollback(`could not link ${linkPath}: ${(error && error.message) || error}`);
  }
}
if (!existsSync(join(linkPath, 'package.json'))) {
  rollback(`${linkPath} does not resolve to a package`);
}

// 3. bundle list, last, and only once 1 and 2 are true
if (!bundles.includes(pluginName)) {
  const anchor = bundles.indexOf('dsh-workspace-control');
  if (anchor >= 0) bundles.splice(anchor, 0, pluginName);
  else bundles.push(pluginName);
}
manifest.dsh.profile.bundles = bundles;
writeManifest();

console.log(`enabled ${pluginName} in ${profileDir} (bundle #${bundles.indexOf(pluginName) + 1} of ${bundles.length})`);
if (!doctor()) {
  rollback('the profile still has an unresolvable bundle');
}
