#!/usr/bin/env node
/**
 * Checks one DSH profile for the configuration that crashes it at startup.
 *
 * A bundle listed in `dsh.profile.bundles` whose package cannot be resolved is
 * fatal: the Host loads bundles in order and the failure happens outside any
 * per-plugin error boundary. The same is true of a half-installed plugin —
 * a name in `bundles` without the matching `dependencies` entry and
 * `node_modules` link.
 *
 * Usage:
 *   node scripts/profile-doctor.mjs                     # every profile
 *   node scripts/profile-doctor.mjs --profile <dir>     # one profile
 *   node scripts/profile-doctor.mjs --json
 *
 * Exit code 0 means every bundle resolves; 1 means at least one problem.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const profileFlag = args.indexOf('--profile');
const requested = profileFlag >= 0 ? args[profileFlag + 1] : '';

const profilesRoot = join(homedir(), '.dsh', 'profiles');

function profileDirs() {
  if (requested) return [requested];
  if (!existsSync(profilesRoot)) return [];
  return readdirSync(profilesRoot)
    .map((name) => join(profilesRoot, name))
    .filter((dir) => existsSync(join(dir, 'package.json')));
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function inspect(dir) {
  const manifestPath = join(dir, 'package.json');
  const manifest = readJson(manifestPath);
  if (!manifest) return { dir, error: `${manifestPath} is not readable JSON` };

  const bundles = manifest?.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) return { dir, error: 'dsh.profile.bundles is not an array' };

  const declared = manifest.dependencies || {};
  const problems = [];
  const warnings = [];
  const seen = new Set();

  for (const name of bundles) {
    if (typeof name !== 'string' || !name) {
      problems.push({ kind: 'bad-entry', name: String(name), detail: 'bundle name is not a string' });
      continue;
    }
    if (seen.has(name)) problems.push({ kind: 'duplicate', name, detail: 'listed more than once' });
    seen.add(name);

    const pkgDir = join(dir, 'node_modules', name);
    if (!existsSync(pkgDir)) {
      // Plugins that ship inside the app never appear in node_modules. Only a
      // declared dependency that is not installed is a half-finished install.
      if (declared[name] === undefined) {
        warnings.push({
          kind: 'not-in-profile',
          name,
          detail: 'not installed in this profile — assumed to ship with the app',
        });
      } else {
        problems.push({
          kind: 'missing-link',
          name,
          detail: 'dependency is declared but node_modules has no link for it',
        });
      }
      continue;
    }

    const entry = join(pkgDir, 'package.json');
    if (!existsSync(entry)) {
      problems.push({ kind: 'missing-manifest', name, detail: `${entry} does not exist` });
      continue;
    }
    const pkg = readJson(entry);
    if (!pkg) {
      problems.push({ kind: 'broken-manifest', name, detail: `${entry} is not readable JSON` });
      continue;
    }
    if (pkg.name !== name) {
      problems.push({ kind: 'name-mismatch', name, detail: `package.json says "${pkg.name}"` });
    }
    try {
      statSync(realpathSync(pkgDir));
    } catch {
      problems.push({ kind: 'broken-link', name, detail: 'node_modules link points at a missing directory' });
    }
  }

  for (const [name, spec] of Object.entries(declared)) {
    if (typeof spec === 'string' && spec.startsWith('link:') && !existsSync(spec.slice(5))) {
      problems.push({ kind: 'dangling-dependency', name, detail: `${spec} does not exist` });
    }
  }

  return { dir, bundles: bundles.length, problems, warnings };
}

const reports = profileDirs().map((dir) => {
  try {
    return inspect(dir);
  } catch (error) {
    return { dir, error: (error && error.message) || String(error) };
  }
});

if (json) {
  process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
} else {
  for (const report of reports) {
    if (report.error) {
      console.log(`FAIL ${report.dir}\n  ${report.error}`);
      continue;
    }
    const ok = report.problems.length === 0;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${report.dir} — ${report.bundles} bundle(s)`);
    for (const problem of report.problems) {
      console.log(`  - ${problem.kind}: ${problem.name} — ${problem.detail}`);
    }
    for (const warning of report.warnings || []) {
      console.log(`  . ${warning.kind}: ${warning.name} — ${warning.detail}`);
    }
  }
}

const failed = reports.some((report) => report.error || report.problems?.length);
if (!reports.length) {
  console.log('no profile found');
}
process.exit(failed ? 1 : 0);
