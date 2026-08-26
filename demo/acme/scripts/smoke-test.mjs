#!/usr/bin/env node
/**
 * Acme demo deploy smoke test — health checks + optional traffic.
 *
 * Usage:
 *   STOREFRONT_URL=https://... node smoke-test.mjs [--once] [--skip-traffic] [--internal]
 *
 * Env:
 *   STOREFRONT_URL     Public storefront-api (required)
 *   WEB_URL            Public web-storefront (optional)
 *   COMMERCE_URL       Optional internal health (Railway shell / VPN)
 *   FULFILLMENT_URL
 *   LEDGER_URL
 *   ACME_PROJECT_ID    Printed in dashboard checklist
 */

const STOREFRONT = (process.env.STOREFRONT_URL || '').replace(/\/$/, '');
const WEB = (process.env.WEB_URL || process.env.VITE_ACME_DEMO_WEB_URL || '').replace(/\/$/, '');
const INTERNAL = [
  ['commerce-api', process.env.COMMERCE_URL],
  ['fulfillment-api', process.env.FULFILLMENT_URL],
  ['ledger-api', process.env.LEDGER_URL],
].filter(([, url]) => url);

const args = process.argv.slice(2);
const skipTraffic = args.includes('--skip-traffic');
const once = args.includes('--once') || !args.includes('--loop');

let failed = 0;

function fail(msg) {
  console.error(`✗ ${msg}`);
  failed += 1;
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

async function health(name, base) {
  if (!base) return;
  const url = `${base.replace(/\/$/, '')}/health`;
  try {
    const resp = await fetch(url);
    const text = await resp.text();
    if (!resp.ok) {
      fail(`${name} ${url} → ${resp.status}`);
      return;
    }
    pass(`${name} ${url} → ${resp.status} ${text.slice(0, 80)}`);
  } catch (err) {
    fail(`${name} ${url} → ${err.message}`);
  }
}

async function main() {
  console.log('Acme demo smoke test\n');

  if (!STOREFRONT) {
    fail('STOREFRONT_URL is required (public storefront-api URL)');
    printChecklist();
    process.exit(1);
  }

  await health('storefront-api', STOREFRONT);
  if (WEB) await health('web-storefront', WEB);

  if (args.includes('--internal') || INTERNAL.length) {
    for (const [name, url] of INTERNAL) {
      await health(name, url);
    }
  } else {
    console.log('(skip internal health — set COMMERCE_URL etc. or pass --internal)');
  }

  if (!skipTraffic) {
    console.log('\nRunning traffic --profile full --once …\n');
    const { spawn } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const trafficPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'traffic.mjs');
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [trafficPath, '--profile', 'full', '--once'], {
        env: { ...process.env, STOREFRONT_URL: STOREFRONT },
        stdio: 'inherit',
      });
      child.on('exit', (code) => {
        if (code !== 0) fail(`traffic.mjs exited ${code}`);
        else pass('traffic.mjs full profile');
        resolve();
      });
    });
  }

  printChecklist();

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

function printChecklist() {
  const projectId = process.env.ACME_PROJECT_ID || process.env.VITE_ACME_DEMO_PROJECT_ID || '<projectId>';
  console.log(`
Dashboard checklist:
  1. Open /projects/${projectId}/topology
  2. Confirm baseline uploaded (demo/acme/baseline-topology.json)
  3. Refresh compare — expect matched edges after traffic
  4. Per-service inventory — storefront-api, commerce-api, ledger-api
  5. Run: node demo/acme/traffic.mjs --profile partial --once
  6. Refresh compare — missing fulfillment hop (demo drift)

Docs: docs/ACME_DEMO_SMOKE.md · docs/RAILWAY_ACME_DEMO.md
`);
}

main();
