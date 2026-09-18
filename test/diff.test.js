import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diffDatasets } from '../scripts/lib/diff.js';

function model(overrides = {}) {
  return {
    id: 'openai/gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    pricing: { input: 5, output: 15 },
    context: { input: 128000, output: 4096 },
    deprecated_at: null,
    ...overrides,
  };
}

describe('diffDatasets', () => {
  test('never reports "added" on the very first run', () => {
    const events = diffDatasets(null, { models: [model()] });
    assert.equal(events.length, 0);
  });

  test('reports a genuinely new model once there is a previous snapshot', () => {
    const previous = { models: [model({ id: 'openai/other', model: 'other' })] };
    const events = diffDatasets(previous, { models: [previous.models[0], model()] });
    const added = events.filter((e) => e.type === 'added');
    assert.equal(added.length, 1);
    assert.equal(added[0].id, 'openai/gpt-4o');
  });

  test('reports a removed model', () => {
    const previous = { models: [model()] };
    const events = diffDatasets(previous, { models: [] });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'removed');
  });

  test('reports a price change above the noise floor', () => {
    const previous = { models: [model({ pricing: { input: 5, output: 15 } })] };
    const next = { models: [model({ pricing: { input: 6, output: 15 } })] };
    const events = diffDatasets(previous, next);
    const change = events.find((e) => e.type === 'price_change');
    assert.ok(change);
    assert.equal(change.field, 'input');
    assert.equal(change.direction, 'up');
    assert.equal(change.pct, 20);
  });

  test('ignores a price move under the 0.5% noise floor', () => {
    const previous = { models: [model({ pricing: { input: 5, output: 15 } })] };
    const next = { models: [model({ pricing: { input: 5.01, output: 15 } })] };
    const events = diffDatasets(previous, next);
    assert.equal(events.filter((e) => e.type === 'price_change').length, 0);
  });

  test('reports price_added when a field goes from null to priced', () => {
    const previous = { models: [model({ pricing: { input: 5, output: null } })] };
    const next = { models: [model({ pricing: { input: 5, output: 15 } })] };
    const events = diffDatasets(previous, next);
    const e = events.find((e) => e.type === 'price_added');
    assert.ok(e);
    assert.equal(e.field, 'output');
  });

  test('reports price_removed when a field goes from priced to null', () => {
    const previous = { models: [model({ pricing: { input: 5, output: 15 } })] };
    const next = { models: [model({ pricing: { input: 5, output: null } })] };
    const events = diffDatasets(previous, next);
    const e = events.find((e) => e.type === 'price_removed');
    assert.ok(e);
    assert.equal(e.field, 'output');
  });

  test('reports a newly announced deprecation exactly once', () => {
    const previous = { models: [model({ deprecated_at: null })] };
    const next = { models: [model({ deprecated_at: '2026-12-01' })] };
    const events = diffDatasets(previous, next);
    assert.equal(events.filter((e) => e.type === 'deprecation').length, 1);
  });

  test('produces no events for two identical snapshots', () => {
    const previous = { models: [model()] };
    const next = { models: [model()] };
    assert.deepEqual(diffDatasets(previous, next), []);
  });
});
