import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InventoryAggregator } from './aggregate.js';

describe('InventoryAggregator caller edges', () => {
  it('creates two caller nodes for different x-service-name values', () => {
    const agg = new InventoryAggregator();
    agg.ingestSample({
      method: 'GET',
      path: '/api/users',
      statusCode: 200,
      authObserved: 'none',
      timestamp: '2026-01-15T12:00:00.000Z',
      caller: { name: 'orders-svc', source: 'header', uaFamily: 'sdk' },
    });
    agg.ingestSample({
      method: 'GET',
      path: '/api/users',
      statusCode: 200,
      authObserved: 'none',
      timestamp: '2026-01-15T12:00:01.000Z',
      caller: { name: 'billing-svc', source: 'header', uaFamily: 'sdk' },
    });
    agg.ingestSample({
      method: 'GET',
      path: '/api/users',
      statusCode: 200,
      authObserved: 'none',
      timestamp: '2026-01-15T12:00:02.000Z',
      caller: { name: 'orders-svc', source: 'header', uaFamily: 'sdk' },
    });

    const { endpoints, edges } = agg.drain();
    assert.equal(endpoints.length, 1);
    assert.equal(endpoints[0].hitCount, 3);
    assert.equal(edges.length, 2);
    const names = edges.map((e) => e.callerName).sort();
    assert.deepEqual(names, ['billing-svc', 'orders-svc']);
    const orders = edges.find((e) => e.callerName === 'orders-svc');
    assert.equal(orders.hitCount, 2);
    assert.equal(orders.callerKey, 'name:orders-svc');
  });
});
