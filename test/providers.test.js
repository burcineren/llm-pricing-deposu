import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalProvider, isExcludedProvider, providerMeta, stripProviderPrefix, familyOf,
} from '../scripts/lib/providers.js';

describe('canonicalProvider', () => {
  test('resolves a known alias onto its canonical slug', () => {
    assert.equal(canonicalProvider('chatgpt'), 'openai');
  });
  test('is case- and whitespace-insensitive', () => {
    assert.equal(canonicalProvider('  ChatGPT  '), 'openai');
  });
  test('collapses unknown vertex_ai-* and bedrock_* variants', () => {
    assert.equal(canonicalProvider('vertex_ai-llama_models'), 'vertex_ai');
    assert.equal(canonicalProvider('bedrock_converse_anything_new'), 'bedrock');
  });
  test('splits azure from azure_ai', () => {
    assert.equal(canonicalProvider('azure'), 'azure');
    assert.equal(canonicalProvider('azure_ai'), 'azure_ai');
  });
  test('returns null for falsy input', () => {
    assert.equal(canonicalProvider(null), null);
    assert.equal(canonicalProvider(''), null);
  });
  test('passes an unrecognized slug through unchanged', () => {
    assert.equal(canonicalProvider('some_brand_new_host'), 'some_brand_new_host');
  });
});

describe('isExcludedProvider', () => {
  test('flags search/tooling providers that are not model providers', () => {
    assert.equal(isExcludedProvider('tavily'), true);
  });
  test('does not flag a real model provider', () => {
    assert.equal(isExcludedProvider('openai'), false);
  });
});

describe('providerMeta', () => {
  test('returns the curated entry for a known provider', () => {
    const meta = providerMeta('openai');
    assert.equal(meta.name, 'OpenAI');
    assert.equal(meta.tier, 'frontier');
  });
  test('falls back to a titleized name and tier "other" for an unknown provider', () => {
    const meta = providerMeta('some_brand_new_host');
    assert.equal(meta.name, 'Some Brand New Host');
    assert.equal(meta.tier, 'other');
  });
});

describe('stripProviderPrefix', () => {
  test('removes a redundant provider prefix', () => {
    assert.equal(stripProviderPrefix('gemini/gemini-2.5-pro', 'gemini'), 'gemini-2.5-pro');
  });
  test('leaves the key alone when the prefix belongs to a different provider', () => {
    assert.equal(stripProviderPrefix('openai/gpt-4o', 'gemini'), 'openai/gpt-4o');
  });
  test('leaves a key with no slash alone', () => {
    assert.equal(stripProviderPrefix('gpt-4o', 'openai'), 'gpt-4o');
  });
});

describe('familyOf', () => {
  test('strips a dated snapshot suffix', () => {
    assert.equal(familyOf('claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5');
  });
  test('strips channel tags, repeatedly', () => {
    assert.equal(familyOf('gemini-2.5-pro-preview-latest'), 'gemini-2.5-pro');
  });
  test('collapses a regional deployment path onto one family', () => {
    assert.equal(familyOf('eu/gpt-5.4'), 'gpt-5.4');
    assert.equal(familyOf('us.anthropic.claude-haiku-4-5'), 'claude-haiku-4-5');
  });
  test('strips a vendor dot-namespace without eating a version number', () => {
    assert.equal(familyOf('meta.llama-4-scout-17b-16e-instruct'), 'llama-4-scout-17b-16e-instruct');
    assert.equal(familyOf('gpt-5.4'), 'gpt-5.4');
  });
  test('keeps a meaningful suffix like -instruct or -reasoner', () => {
    assert.equal(familyOf('deepseek-chat'), 'deepseek-chat');
    assert.equal(familyOf('deepseek-reasoner'), 'deepseek-reasoner');
  });
  test('strips Vertex/Bedrock version suffixes', () => {
    assert.equal(familyOf('some-model@001'), 'some-model');
    assert.equal(familyOf('some-model-v1:0'), 'some-model-v1');
  });
});
