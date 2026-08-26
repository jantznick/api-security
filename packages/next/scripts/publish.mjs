#!/usr/bin/env node
/**
 * Publish @apiglimpse/next to npm.
 *
 * Monorepo DX keeps "@apiglimpse/shared": "file:../shared".
 * This script temporarily swaps to "^<sharedVersion>", installs,
 * publishes, then restores file:../shared (even on failure).
 *
 * Usage (from packages/next):
 *   npm run publish:npm
 *   node ./scripts/publish.mjs
 *   node ./scripts/publish.mjs --dry-run
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, '..');
const pkgPath = join(pkgDir, 'package.json');
const SHARED_NAME = '@apiglimpse/shared';
const FILE_DEP = 'file:../shared';
const dryRun = process.argv.includes('--dry-run');

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, {
    cwd: pkgDir,
    stdio: 'inherit',
    ...opts,
  });
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: pkgDir,
    encoding: 'utf8',
  }).trim();
}

function readPkg() {
  return JSON.parse(readFileSync(pkgPath, 'utf8'));
}

function writePkg(pkg) {
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function fail(message) {
  console.error(`publish.mjs: ${message}`);
  process.exit(1);
}

const original = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(original);

if (pkg.name !== '@apiglimpse/next') {
  fail(`expected package name @apiglimpse/next, got ${pkg.name}`);
}

const currentDep = pkg.dependencies?.[SHARED_NAME];
if (!currentDep) {
  fail(`missing dependency ${SHARED_NAME}`);
}
if (currentDep !== FILE_DEP && !String(currentDep).startsWith('^')) {
  fail(
    `${SHARED_NAME} should be "${FILE_DEP}" (or already ^x.y.z). Found: ${currentDep}`,
  );
}

console.log('Checking that you are logged in to npm…');
let whoami;
try {
  whoami = runCapture('npm', ['whoami']);
} catch {
  fail('npm whoami failed. Run: npm login');
}
console.log(`Logged in as: ${whoami}`);

console.log(`Checking that ${SHARED_NAME} is published…`);
let sharedVersion;
try {
  sharedVersion = runCapture('npm', ['view', SHARED_NAME, 'version']);
} catch {
  fail(
    `${SHARED_NAME} is not on the registry yet. Publish shared first:\n` +
      `  cd ../shared && npm publish --access public`,
  );
}
console.log(`Found ${SHARED_NAME}@${sharedVersion}`);

const registryDep = `^${sharedVersion}`;
pkg.dependencies[SHARED_NAME] = registryDep;
writePkg(pkg);
console.log(`Temporarily set ${SHARED_NAME} → ${registryDep}`);

let publishOk = false;
try {
  console.log('npm install…');
  run('npm', ['install']);

  const publishArgs = ['publish', '--access', 'public'];
  if (dryRun) publishArgs.push('--dry-run');
  console.log(`npm ${publishArgs.join(' ')}…`);
  run('npm', publishArgs);
  publishOk = true;
} catch (err) {
  console.error('Publish step failed.');
  throw err;
} finally {
  writeFileSync(pkgPath, original, 'utf8');
  console.log(`Restored package.json (${SHARED_NAME}: ${FILE_DEP})`);
  try {
    console.log('npm install (restore local file: dependency)…');
    run('npm', ['install']);
  } catch (restoreErr) {
    console.error(
      'Warning: could not reinstall after restore. Run: npm install',
    );
    console.error(restoreErr);
  }
}

if (publishOk) {
  if (dryRun) {
    console.log('Dry run finished. Nothing was published.');
  } else {
    console.log(`Published ${pkg.name}@${pkg.version}`);
    console.log('Verify: npm view @apiglimpse/next version');
  }
}
