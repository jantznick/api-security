/**
 * Unit tests for org slug helpers (no DB).
 * Run: cd backend && npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrgSlugCandidate, slugifyOrgName } from '../lib/orgSlug.js';

describe('slugifyOrgName', () => {
  it('slugifies typical names', () => {
    assert.equal(slugifyOrgName('Acme Engineering'), 'acme-engineering');
    assert.equal(slugifyOrgName('  Foo   Bar  '), 'foo-bar');
  });

  it('strips non-alphanumeric and trims hyphens', () => {
    assert.equal(slugifyOrgName('!!!Hello!!!'), 'hello');
    assert.equal(slugifyOrgName('A&B Co.'), 'a-b-co');
  });

  it('caps length at 48', () => {
    const long = 'a'.repeat(60);
    assert.equal(slugifyOrgName(long).length, 48);
  });
});

describe('normalizeOrgSlugCandidate', () => {
  it('prefixes when slug would not start with a letter', () => {
    assert.equal(normalizeOrgSlugCandidate('123'), 'org-123');
  });
});
