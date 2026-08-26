#!/usr/bin/env node
/**
 * Publish @apiglimpse/nestjs to npm.
 *
 * Monorepo DX keeps file: deps on middleware + fastify.
 * This script temporarily swaps them to registry ^versions, installs,
 * publishes, then restores file: deps (even on failure).
 *
 * Usage (from packages/nestjs):
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
const dryRun = process.argv.includes('--dry-run');

/** @type {{ name: string, fileDep: string }[]} */
const FILE_DEPS = [
  { name: '@apiglimpse/middleware', fileDep: 'file:../middleware' },
  { name: '@apiglimpse/fastify', fileDep: 'file:../fastify' },
];

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

function writePkg(pkg) {
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function fail(message) {
  console.error(`publish.mjs: ${message}`);
  process.exit(1);
}

const original = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(original);

if (pkg.name !== '@apiglimpse/nestjs') {
  fail(`expected package name @apiglimpse/nestjs, got ${pkg.name}`);
}

for (const { name, fileDep } of FILE_DEPS) {
  const currentDep = pkg.dependencies?.[name];
  if (!currentDep) {
    fail(`missing dependency ${name}`);
  }
  if (currentDep !== fileDep && !String(currentDep).startsWith('^')) {
    fail(`${name} should be "${fileDep}" (or already ^x.y.z). Found: ${currentDep}`);
  }
}

console.log('Checking that you are logged in to npm…');
let whoami;
try {
  whoami = runCapture('npm', ['whoami']);
} catch {
  fail('npm whoami failed. Run: npm login');
}
console.log(`Logged in as: ${whoami}`);

for (const { name } of FILE_DEPS) {
  console.log(`Checking that ${name} is published…`);
  let version;
  try {
    version = runCapture('npm', ['view', name, 'version']);
  } catch {
    fail(
      `${name} is not on the registry yet. Publish it first:\n` +
        `  cd ../${name.split('/')[1]} && npm run publish:npm`,
    );
  }
  const registryDep = `^${version}`;
  pkg.dependencies[name] = registryDep;
  console.log(`Temporarily set ${name} → ${registryDep}`);
}

writePkg(pkg);

let publishOk = false;
try {
  console.log('npm run build…');
  run('npm', ['run', 'build']);

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
  console.log('Restored package.json (file: deps)');
  try {
    console.log('npm install (restore local file: dependencies)…');
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
    console.log('Verify: npm view @apiglimpse/nestjs version');
  }
}
