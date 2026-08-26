import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProtectController,
  evaluatePolicy,
  matchPathTemplate,
  ruleMatches,
} from '../src/protect.js';

describe('matchPathTemplate', () => {
  it('matches exact paths', () => {
    assert.equal(matchPathTemplate('/users', '/users'), true);
    assert.equal(matchPathTemplate('/users', '/users/1'), false);
  });

  it('matches :param segments', () => {
    assert.equal(matchPathTemplate('/users/:id', '/users/42'), true);
    assert.equal(matchPathTemplate('/users/:id', '/users/42/extra'), false);
  });

  it('matches /** prefix', () => {
    assert.equal(matchPathTemplate('/admin/**', '/admin'), true);
    assert.equal(matchPathTemplate('/admin/**', '/admin/users'), true);
    assert.equal(matchPathTemplate('/admin/**', '/public'), false);
  });
});

describe('evaluatePolicy observe/block', () => {
  const policy = {
    version: 1,
    rules: [
      {
        id: 'deny-unauth-admin',
        match: { pathTemplate: '/admin/**', authModes: ['none'] },
        action: 'deny',
      },
    ],
  };

  it('matches unauth admin', () => {
    const r = evaluatePolicy(policy, {
      method: 'GET',
      path: '/admin/keys',
      authObserved: 'none',
    });
    assert.equal(r.matched, true);
    assert.equal(r.rule.id, 'deny-unauth-admin');
  });

  it('skips when bearer present', () => {
    const r = evaluatePolicy(policy, {
      method: 'GET',
      path: '/admin/keys',
      authObserved: 'bearer',
    });
    assert.equal(r.matched, false);
  });

  it('observe mode allows but counts wouldBlock', () => {
    const ctrl = createProtectController({
      enabled: true,
      mode: 'observe',
      failMode: 'open',
      policy,
    });
    const d = ctrl.decide({ method: 'GET', path: '/admin/x', authObserved: 'none' });
    assert.equal(d.allow, true);
    assert.equal(d.wouldBlock, true);
    assert.equal(d.blocked, false);
    assert.equal(ctrl.getStats().wouldBlock, 1);
    assert.equal(ctrl.getStats().blocked, 0);
    ctrl.stop();
  });

  it('block mode denies matching requests', () => {
    const ctrl = createProtectController({
      enabled: true,
      mode: 'block',
      failMode: 'open',
      policy,
    });
    const d = ctrl.decide({ method: 'GET', path: '/admin/x', authObserved: 'none' });
    assert.equal(d.allow, false);
    assert.equal(d.blocked, true);
    ctrl.stop();
  });

  it('fail-open when policy missing', () => {
    const ctrl = createProtectController({
      enabled: true,
      mode: 'block',
      failMode: 'open',
      policy: null,
    });
    const d = ctrl.decide({ method: 'GET', path: '/admin/x', authObserved: 'none' });
    assert.equal(d.allow, true);
    assert.equal(d.blocked, false);
    ctrl.stop();
  });

  it('ruleMatches requires method when set', () => {
    assert.equal(
      ruleMatches(
        { match: { method: 'POST', pathTemplate: '/x' }, action: 'deny' },
        { method: 'GET', path: '/x', authObserved: 'none' },
      ),
      false,
    );
  });
});
