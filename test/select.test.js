import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isLiveChatModel, pickPerFamily, blendedCost, leaderboard } from '../scripts/lib/select.js';

function model(overrides = {}) {
  return {
    id: 'openai/gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    family: 'gpt-4o',
    mode: 'chat',
    pricing: { input: 2.5, output: 10 },
    context: { input: 128000, output: 4096 },
    released_at: null,
    deprecated_at: null,
    ...overrides,
  };
}

describe('isLiveChatModel', () => {
  test('rejects a non-chat model', () => {
    assert.equal(isLiveChatModel(model({ mode: 'embedding' })), false);
  });
  test('rejects a model with no price at all', () => {
    assert.equal(isLiveChatModel(model({ pricing: { input: null, output: null } })), false);
  });
  test('rejects a model whose deprecation date has passed', () => {
    assert.equal(isLiveChatModel(model({ deprecated_at: '2000-01-01' })), false);
  });
  test('accepts a priced, non-deprecated chat model', () => {
    assert.equal(isLiveChatModel(model()), true);
  });
});

describe('blendedCost', () => {
  test('blends input:output at a 3:1 ratio by default', () => {
    // (2.5*3 + 10*1) / 4 = 4.375
    assert.equal(blendedCost(model()), 4.375);
  });
  test('returns null when either price is missing', () => {
    assert.equal(blendedCost(model({ pricing: { input: null, output: 10 } })), null);
  });
});

describe('pickPerFamily', () => {
  test('prefers the undated alias over a dated snapshot', () => {
    const dated = model({ model: 'gpt-4o-2024-08-06' });
    const alias = model({ model: 'gpt-4o' });
    const [picked] = pickPerFamily([dated, alias]);
    assert.equal(picked.model, 'gpt-4o');
  });

  test('breaks a tie between two undated entries by release date', () => {
    const older = model({ model: 'gpt-4o', released_at: '2024-01-01' });
    const newer = model({ model: 'gpt-4o', released_at: '2025-01-01' });
    const [picked] = pickPerFamily([older, newer]);
    assert.equal(picked.released_at, '2025-01-01');
  });
});

describe('leaderboard', () => {
  test('dedupes by family across providers', () => {
    const a = model({ id: 'groq/llama-3.1-8b', family: 'llama-3.1-8b', pricing: { input: 0.1, output: 0.1 } });
    const b = model({ id: 'together_ai/llama-3.1-8b', family: 'llama-3.1-8b', pricing: { input: 0.2, output: 0.2 } });
    const rows = leaderboard([a, b], { by: (m) => m.pricing.input, limit: 10, dir: 'asc' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].m.id, 'groq/llama-3.1-8b');
  });

  test('sorts ascending or descending as requested', () => {
    const cheap = model({ id: 'a/cheap', family: 'cheap', pricing: { input: 0.1, output: 0.1 } });
    const pricey = model({ id: 'b/pricey', family: 'pricey', pricing: { input: 20, output: 20 } });
    const asc = leaderboard([cheap, pricey], { by: (m) => m.pricing.input, limit: 10, dir: 'asc' });
    assert.equal(asc[0].m.id, 'a/cheap');
    const desc = leaderboard([cheap, pricey], { by: (m) => m.pricing.input, limit: 10, dir: 'desc' });
    assert.equal(desc[0].m.id, 'b/pricey');
  });

  test('drops rows where the metric itself is null, even if the row passes the filter', () => {
    const withPrice = model({ id: 'a/priced', family: 'priced' });
    const withoutPrice = model({ id: 'b/unpriced', family: 'unpriced', pricing: { input: null, output: null } });
    const rows = leaderboard([withPrice, withoutPrice], {
      by: (m) => m.pricing.input, limit: 10, dir: 'asc', filter: () => true,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].m.id, 'a/priced');
  });
});
