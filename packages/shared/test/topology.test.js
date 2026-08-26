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
} from '../src/topology.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8'));
}

describe('topology baseline (SF9)', () => {
  it('validates acme fixture', () => {
    const raw = loadFixture('acme-baseline-v1.json');
    const result = validateTopologyBaseline(raw);
    assert.equal(result.ok, true);
    assert.equal(result.baseline.nodes.length, 5);
    assert.equal(result.baseline.edges.length, 4);
  });

  it('compare finds missing and shadow edges', () => {
    const raw = loadFixture('acme-baseline-v1.json');
    const { baseline } = validateTopologyBaseline(raw);

    const observed = buildObservedGraph([
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
            callerKey: 'svc:mobile-app',
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
    ]);

    const compare = compareTopology(baseline, observed);
    assert.equal(compare.summary.matched, 1);
    assert.equal(compare.summary.missing, 3);
    assert.equal(compare.summary.shadow, 1);
    assert.equal(compare.summary.externalMatched, 1);

    const shadow = compare.edges.find((e) => e.status === 'shadow');
    assert.equal(shadow.from, 'legacy-pricing');
    assert.equal(shadow.to, 'storefront-api');

    const events = driftEventsFromCompare(compare);
    assert.ok(events.some((e) => e.type === 'topology.edge.missing'));
    assert.ok(events.some((e) => e.type === 'topology.edge.shadow'));
  });
});
