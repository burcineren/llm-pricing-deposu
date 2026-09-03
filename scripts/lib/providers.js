import { p, readJSON } from './util.js';

const registry = readJSON(p('overrides', 'providers.json'));

const ALIAS_TO_CANON = new Map();
for (const [canon, meta] of Object.entries(registry.providers)) {
  ALIAS_TO_CANON.set(canon, canon);
  for (const alias of meta.aliases || []) ALIAS_TO_CANON.set(alias, canon);
}

const EXCLUDED = new Set(registry.exclude_providers || []);

/** Collapse an upstream provider slug (litellm's `vertex_ai-llama_models`, OpenRouter's
 *  `google`, …) onto one canonical slug so the same provider never shows up twice. */
export function canonicalProvider(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (ALIAS_TO_CANON.has(s)) return ALIAS_TO_CANON.get(s);
  // Unknown `vertex_ai-something` / `bedrock_something` variants added upstream later.
  if (s.startsWith('vertex_ai')) return 'vertex_ai';
  if (s.startsWith('bedrock')) return 'bedrock';
  if (s.startsWith('azure_') || s === 'azure') return s === 'azure_ai' ? 'azure_ai' : 'azure';
  return s;
}

export function isExcludedProvider(canon) {
  return EXCLUDED.has(canon);
}

export function providerMeta(canon) {
  const meta = registry.providers[canon];
  if (meta) return { slug: canon, tier: 'other', ...meta };
  return { slug: canon, name: titleize(canon), tier: 'other' };
}

export function allProviders() {
  return registry.providers;
}

function titleize(slug) {
  return String(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bApi\b/g, 'API');
}

/** Strip a redundant provider prefix from a model key: `gemini/gemini-2.5-pro` -> `gemini-2.5-pro`. */
export function stripProviderPrefix(key, canon) {
  const idx = key.indexOf('/');
  if (idx === -1) return key;
  const head = key.slice(0, idx).toLowerCase();
  if (canonicalProvider(head) === canon) return key.slice(idx + 1);
  return key;
}

/** Best-effort family grouping so the site can collapse 40 snapshot dates into one row.
 *  Deliberately conservative: only release-tag noise is stripped. Suffixes like
 *  `-chat`, `-instruct` or `-reasoner` name genuinely different models and must survive,
 *  or `deepseek-chat` and `deepseek-reasoner` would collapse into one row. */
// Vendor namespaces that appear as a dot-prefix inside a model name on resale platforms
// (`meta.llama-4-scout`, `anthropic.claude-haiku-4-5`). Matched explicitly rather than by
// a `word.` regex, which would happily eat the `gpt-5.` out of `gpt-5.4`.
const VENDOR_NAMESPACES = [
  'meta', 'anthropic', 'amazon', 'cohere', 'ai21', 'mistral', 'deepseek', 'qwen',
  'openai', 'google', 'stability', 'luma', 'writer', 'twelvelabs', 'nvidia', 'microsoft',
];
const VENDOR_DOT_RE = new RegExp(`^(${VENDOR_NAMESPACES.join('|')})\\.`, 'i');

// Region and routing prefixes: `eu/gpt-5.4`, `us.anthropic.claude-…`, `global.…`
const REGION_RE = /^(us|eu|apac|global|jp|au|ca|uk|in|sa|me|il)[./]/i;

export function familyOf(model) {
  let m = String(model).toLowerCase();

  // Same model, many spellings: strip the deployment path so `meta/llama-4-scout-…-maas`,
  // `meta.llama-4-scout-…` and `eu/llama-4-scout-…` collapse onto one family instead of
  // filling a top-12 with regional copies of a single model.
  m = m.replace(REGION_RE, '');
  const lastSegment = m.slice(m.lastIndexOf('/') + 1);
  if (lastSegment) m = lastSegment;
  m = m.replace(REGION_RE, '').replace(VENDOR_DOT_RE, '');
  m = m.replace(/-maas$/, '');

  const stripped = m
    // Vertex/Bedrock style version suffixes: `model@001`, `model:0`, `model-v1:0`
    .replace(/[@:]\d[\d.:-]*$/, '')
    // Trailing date stamps: -20250929, -2025-09-29, -0929
    .replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, '')
    // Channel tags, repeatedly (e.g. `-preview-latest`)
    .replace(/-(latest|preview|exp|experimental|beta|alpha|stable|ga)$/g, '')
    .replace(/-(latest|preview|exp|experimental|beta|alpha|stable|ga)$/g, '')
    .replace(/-(\d{8}|\d{4}-\d{2}-\d{2})$/, '');
  return stripped || m;
}
