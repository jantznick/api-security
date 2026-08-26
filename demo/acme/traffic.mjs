#!/usr/bin/env node
/**
 * Acme demo traffic generator — hits public storefront-api only.
 *
 * Usage:
 *   node traffic.mjs [--profile web|mobile|partner|full|partial] [--once] [--loop 30s]
 *
 * Env:
 *   STOREFRONT_URL  default http://localhost:4011
 */

const BASE = (process.env.STOREFRONT_URL || 'http://localhost:4011').replace(/\/$/, '');

const args = process.argv.slice(2);
let profile = 'web';
let once = false;
let loopMs = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--profile' && args[i + 1]) {
    profile = args[++i];
  } else if (a.startsWith('--profile=')) {
    profile = a.slice('--profile='.length);
  } else if (a === '--once') {
    once = true;
  } else if (a === '--loop' && args[i + 1]) {
    loopMs = parseDuration(args[++i]);
  } else if (a.startsWith('--loop=')) {
    loopMs = parseDuration(a.slice('--loop='.length));
  } else if (a === '--help' || a === '-h') {
    console.log(`Usage: node traffic.mjs [--profile web|mobile|partner|full|partial] [--once] [--loop 30s]`);
    process.exit(0);
  }
}

function parseDuration(raw) {
  const m = String(raw).trim().match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/i);
  if (!m) throw new Error(`Invalid duration: ${raw}`);
  const n = Number(m[1]);
  const unit = (m[2] || 'ms').toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n;
}

async function request(method, path, { headers = {}, body } = {}) {
  const url = `${BASE}${path}`;
  const init = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url, init);
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  const line = `${method} ${path} → ${resp.status}`;
  console.log(line);
  return { status: resp.status, data };
}

async function runWeb() {
  await request('GET', '/health');
  await request('POST', '/api/auth/login', {
    body: { email: 'alice@example.com', password: 'demo-password' },
  });
}

async function runMobile() {
  await request('GET', '/api/catalog', {
    headers: { 'X-Service-Name': 'mobile-app' },
  });
}

async function runPartner() {
  await request('POST', '/api/webhooks/billing', {
    headers: { 'X-Service-Name': 'partner-billing' },
    body: { partnerId: 'partner_demo', invoiceId: 'inv_1001', amount: 199.0 },
  });
}

async function runPartial() {
  await request('POST', '/api/auth/login', {
    body: { email: 'alice@example.com', password: 'demo-password' },
  });
  await request('GET', '/api/catalog', {
    headers: { 'X-Service-Name': 'mobile-app' },
  });
  console.log('(partial) skipping POST /api/checkout — missing commerce→fulfillment chain proof');
}

async function runFull() {
  await request('POST', '/api/auth/login', {
    body: { email: 'alice@example.com', password: 'demo-password' },
  });
  await request('POST', '/api/checkout', {
    body: {
      email: 'alice@example.com',
      amount: 99.99,
      cardPan: '4111111111111111',
      triggerShadowExport: true,
    },
  });
  await request('GET', '/api/catalog', {
    headers: { 'X-Service-Name': 'mobile-app' },
  });
  await request('POST', '/api/webhooks/billing', {
    headers: { 'X-Service-Name': 'partner-billing' },
    body: { partnerId: 'partner_demo', invoiceId: 'inv_full', amount: 249.0 },
  });
  await request('GET', '/api/pricing/legacy');
  console.log('(full) shadow ledger export triggered via checkout chain (triggerShadowExport)');
}

async function runProfile(name) {
  console.log(`\n=== profile: ${name} ===`);
  switch (name) {
    case 'web':
      await runWeb();
      break;
    case 'mobile':
      await runMobile();
      break;
    case 'partner':
      await runPartner();
      break;
    case 'partial':
      await runPartial();
      break;
    case 'full':
      await runFull();
      break;
    default:
      throw new Error(`Unknown profile: ${name}`);
  }
}

function printAeChecklist() {
  console.log(`
--- AE demo checklist ---
[ ] Project "Acme Demo" with five Services matching baseline node ids
[ ] API keys set in docker-compose / Railway for each service
[ ] Upload demo/acme/baseline-topology.json when SF9 compare is available
[ ] Pre-warm: node traffic.mjs --profile full --once
[ ] Live missing edge: node traffic.mjs --profile partial --once
[ ] Show callers on storefront-api (mobile-app, partner-billing)
[ ] Show chain depth on ledger-api inventory (fulfillment-api → ledger)
[ ] Shadow: GET /api/pricing/legacy (undocumented) + ledger /internal/debug/export via full checkout
[ ] Public URLs: web-storefront :4010, storefront-api :4011 only
`);
}

async function main() {
  console.log(`Storefront URL: ${BASE}`);
  if (loopMs != null && once) {
    console.warn('Note: --once and --loop both set; running once then exiting.');
  }

  do {
    await runProfile(profile);
    if (once || loopMs == null) break;
    console.log(`Sleeping ${loopMs}ms…`);
    await new Promise((r) => setTimeout(r, loopMs));
  } while (true);

  printAeChecklist();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
