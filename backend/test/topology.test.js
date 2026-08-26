/**
 * Unit tests for SF9 topology compare (shared helpers + fixtures, no DB).
 * Run: cd backend && npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateTopologyBaseline,
  buildObservedGraph,
  compareTopology,
  driftEventsFromCompare,
} from '@apiglimpse/shared';
import { baselineForStorage, baselineFromStorage } from '../lib/topology.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAcmeFixture() {
  return JSON.parse(
    readFileSync(
      join(__dirname, '../../packages/shared/fixtures/acme-baseline-v1.json'),
      'utf8',
    ),
  );
}

const observedServicesFixture = [
  {
    name: 'commerce-api',
    trafficEdges: [
      {
        callerKey: 'svc:storefront-api',
        callerLabel: 'storefront-api',
        method: 'POST',
        pathTemplate: '/api/checkout',
        hitCount: 10,
        lastSeenAt: new Date().toISOString(),
      },
    ],
  },
  {
    name: 'storefront-api',
    trafficEdges: [
      {
        callerKey: 'mobile-app',
        callerLabel: 'mobile-app',
        method: 'GET',
        pathTemplate: '/api/catalog',
        hitCount: 5,
        lastSeenAt: new Date().toISOString(),
      },
      {
        callerKey: 'svc:legacy-pricing',
        callerLabel: 'legacy-pricing',
        method: 'GET',
        pathTemplate: '/api/pricing/legacy',
        hitCount: 2,
        lastSeenAt: new Date().toISOString(),
      },
    ],
  },
];

describe('topology baseline storage helpers', () => {
  it('strips _nodeById before save and rehydrates on load', () => {
    const raw = loadAcmeFixture();
    const { baseline } = validateTopologyBaseline(raw);
    assert.ok(baseline._nodeById instanceof Map);

    const stored = baselineForStorage(baseline);
    assert.equal(stored._nodeById, undefined);

    const loaded = baselineFromStorage(stored);
    assert.ok(loaded._nodeById instanceof Map);
    assert.equal(loaded.nodes.length, 5);
  });
});

describe('topology compare (acme fixture)', () => {
  it('validates acme baseline fixture', () => {
    const result = validateTopologyBaseline(loadAcmeFixture());
    assert.equal(result.ok, true);
    assert.equal(result.baseline.edges.length, 4);
  });

  it('finds missing, shadow, and matched edges', () => {
    const { baseline } = validateTopologyBaseline(loadAcmeFixture());
    const observed = buildObservedGraph(observedServicesFixture);
    const compare = compareTopology(baseline, observed);

    assert.equal(compare.summary.matched, 1);
    assert.equal(compare.summary.missing, 3);
    assert.equal(compare.summary.shadow, 1);
    assert.equal(compare.summary.externalMatched, 1);

    const shadow = compare.edges.find((e) => e.status === 'shadow');
    assert.equal(shadow.from, 'legacy-pricing');
    assert.equal(shadow.to, 'storefront-api');

    const missingInternal = compare.edges.find(
      (e) => e.status === 'missing' && e.to === 'ledger-api',
    );
    assert.ok(missingInternal);
    assert.equal(missingInternal.severity, 'high');
  });

  it('builds drift events for new missing/shadow items', () => {
    const { baseline } = validateTopologyBaseline(loadAcmeFixture());
    const observed = buildObservedGraph(observedServicesFixture);
    const compare = compareTopology(baseline, observed);
    const events = driftEventsFromCompare(compare);

    assert.ok(events.some((e) => e.type === 'topology.edge.missing'));
    assert.ok(events.some((e) => e.type === 'topology.edge.shadow'));
    assert.ok(events.every((e) => e.driftKey && e.payload?.version === 1));

    const secondPass = driftEventsFromCompare(
      compare,
      new Set(events.map((e) => e.driftKey)),
    );
    assert.equal(secondPass.length, 0);
  });
});
