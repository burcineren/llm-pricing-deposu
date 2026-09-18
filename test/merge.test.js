import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAll } from '../scripts/lib/merge.js';

/** Minimal valid record, as a source adapter would emit it. */
function rec(overrides = {}) {
  return {
    id: 'openai/gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    mode: 'chat',
    context: { input: null, output: null, total: null },
    pricing: { input: null, output: null, cache_read: null, cache_write: null, tiers: [] },
    rate_limits: {},
    capabilities: {},
    _source: 'a',
    ...overrides,
  };
}

const SOURCE_META = [
  { id: 'a', precedence: 3 },
  { id: 'b', precedence: 1 },
];

describe('mergeAll — precedence and field-filling', () => {
  test('a higher-precedence source wins when both publish a field', () => {
    const a = rec({ pricing: { input: 5, output: 15, tiers: [] } });
    const b = rec({ _source: 'b', pricing: { input: 999, output: 999, tiers: [] } });
    const { models } = mergeAll([[a], [b]], SOURCE_META);
    assert.equal(models[0].pricing.input, 5);
    assert.equal(models[0].pricing.output, 15);
  });

  test('a lower-precedence source fills a field the winner left null', () => {
    const a = rec({ pricing: { input: 5, output: null, tiers: [] } });
    const b = rec({ _source: 'b', pricing: { input: 999, output: 15, tiers: [] } });
    const { models } = mergeAll([[a], [b]], SOURCE_META);
    assert.equal(models[0].pricing.input, 5);
    assert.equal(models[0].pricing.output, 15);
  });

  test('records the sources that contributed, highest precedence first', () => {
    const a = rec();
    const b = rec({ _source: 'b' });
    const { models } = mergeAll([[a], [b]], SOURCE_META);
    assert.deepEqual(models[0].sources, ['a', 'b']);
  });
});

describe('mergeAll — conflicts', () => {
  test('flags a real disagreement between two sources', () => {
    const a = rec({ pricing: { input: 5, output: 15, tiers: [] } });
    const b = rec({ _source: 'b', pricing: { input: 20, output: 15, tiers: [] } });
    const { models } = mergeAll([[a], [b]], SOURCE_META);
    assert.equal(models[0].conflicts.length, 1);
    assert.equal(models[0].conflicts[0].field, 'pricing.input');
  });

  test('does not flag a difference under the noise tolerance', () => {
    const a = rec({ pricing: { input: 5, output: 15, tiers: [] } });
    const b = rec({ _source: 'b', pricing: { input: 5.001, output: 15, tiers: [] } });
    const { models } = mergeAll([[a], [b]], SOURCE_META);
    assert.equal(models[0].conflicts.length, 0);
  });

  test('a single source can never conflict with itself', () => {
    const a = rec({ pricing: { input: 5, output: 15, tiers: [] } });
    const { models } = mergeAll([[a]], SOURCE_META);
    assert.equal(models[0].conflicts.length, 0);
  });
});

describe('mergeAll — sanitizePricing', () => {
  test('nulls a price above the sanity ceiling and reports it', () => {
    const a = rec({ pricing: { input: 999999, output: 15, tiers: [] } });
    const { models, suspect } = mergeAll([[a]], SOURCE_META);
    assert.equal(models[0].pricing.input, null);
    assert.equal(suspect.length, 1);
    assert.deepEqual(suspect[0].fields, ['input']);
  });

  test('nulls a negative price (OpenRouter\'s -1 sentinel)', () => {
    const a = rec({ pricing: { input: -1, output: 15, tiers: [] } });
    const { models } = mergeAll([[a]], SOURCE_META);
    assert.equal(models[0].pricing.input, null);
  });

  test('treats a commercial 0/0 quote as unknown, not free', () => {
    const a = rec({ provider: 'openai', pricing: { input: 0, output: 0, tiers: [] } });
    const { models } = mergeAll([[a]], SOURCE_META);
    assert.equal(models[0].pricing.input, null);
    assert.equal(models[0].pricing.output, null);
  });

  test('leaves a genuinely free local model at 0/0', () => {
    const a = rec({ id: 'ollama/llama3', provider: 'ollama', model: 'llama3', pricing: { input: 0, output: 0, tiers: [] } });
    const { models } = mergeAll([[a]], SOURCE_META);
    assert.equal(models[0].pricing.input, 0);
    assert.equal(models[0].pricing.output, 0);
  });
});

describe('mergeAll — dedup', () => {
  test('keeps only the most complete record when one source lists a model twice', () => {
    const thin = rec({ pricing: { input: null, output: null, tiers: [] } });
    const full = rec({ pricing: { input: 5, output: 15, tiers: [] } });
    const { models } = mergeAll([[thin, full]], SOURCE_META);
    assert.equal(models.length, 1);
    assert.equal(models[0].pricing.input, 5);
  });
});
