import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  perMillion, round, num, int, posInt, fmtUSD, fmtTokens, globMatch,
} from '../scripts/lib/util.js';

describe('perMillion', () => {
  test('converts a per-token rate to per-1M and kills float noise', () => {
    assert.equal(perMillion(0.0000025), 2.5);
  });
  test('passes through null/undefined as null', () => {
    assert.equal(perMillion(null), null);
    assert.equal(perMillion(undefined), null);
  });
  test('rejects non-numeric input', () => {
    assert.equal(perMillion('not-a-number'), null);
  });
});

describe('round', () => {
  test('rounds to the given precision', () => {
    assert.equal(round(1.23456789, 2), 1.23);
  });
  test('normalizes -0 to 0', () => {
    assert.equal(round(-0), 0);
  });
  test('returns null for non-finite input', () => {
    assert.equal(round(NaN), null);
    assert.equal(round(null), null);
  });
});

describe('num / int / posInt', () => {
  test('num parses numeric strings and rejects empties', () => {
    assert.equal(num('3.5'), 3.5);
    assert.equal(num(''), null);
    assert.equal(num(null), null);
  });
  test('int rounds to the nearest integer', () => {
    assert.equal(int('3.6'), 4);
  });
  test('posInt treats zero and negatives as missing, not real values', () => {
    assert.equal(posInt(0), null);
    assert.equal(posInt(-5), null);
    assert.equal(posInt(128000), 128000);
  });
});

describe('fmtUSD', () => {
  test('formats a missing price as an em dash', () => {
    assert.equal(fmtUSD(null), '—');
  });
  test('formats a literal zero as free', () => {
    assert.equal(fmtUSD(0), 'free');
  });
  test('trims trailing zeros at every magnitude', () => {
    assert.equal(fmtUSD(30), '$30');
    assert.equal(fmtUSD(2.5), '$2.5');
    assert.equal(fmtUSD(0.025), '$0.025');
    assert.equal(fmtUSD(0.0044), '$0.0044');
  });
});

describe('fmtTokens', () => {
  test('formats a missing context as an em dash', () => {
    assert.equal(fmtTokens(null), '—');
  });
  test('abbreviates thousands and millions', () => {
    assert.equal(fmtTokens(128000), '128K');
    assert.equal(fmtTokens(1_050_000), '1.05M');
  });
  test('leaves small numbers untouched', () => {
    assert.equal(fmtTokens(512), '512');
  });
});

describe('globMatch', () => {
  test('matches an exact string with no wildcard', () => {
    assert.equal(globMatch('openai/gpt-4o', 'openai/gpt-4o'), true);
    assert.equal(globMatch('openai/gpt-4o', 'openai/gpt-4o-mini'), false);
  });
  test('matches a provider/* glob', () => {
    assert.equal(globMatch('openrouter/*', 'openrouter/auto'), true);
    assert.equal(globMatch('openrouter/*', 'openai/gpt-4o'), false);
  });
  test('escapes regex metacharacters in the pattern', () => {
    assert.equal(globMatch('gpt-3.5-turbo', 'gpt-3.5-turbo'), true);
    assert.equal(globMatch('gpt-3.5-turbo', 'gpt-3X5-turbo'), false);
  });
});
