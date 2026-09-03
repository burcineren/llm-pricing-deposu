import { log, nowISO, globMatch, readJSON, p } from './util.js';
import { providerMeta, familyOf } from './providers.js';

/** Numeric fields we cross-check between sources. A disagreement here is the whole
 *  point of aggregating more than one source, so it is recorded, never averaged away. */
const VERIFIED_FIELDS = [
  ['pricing', 'input'],
  ['pricing', 'output'],
  ['pricing', 'cache_read'],
  ['pricing', 'cache_write'],
  ['context', 'input'],
  ['context', 'output'],
];

/** Relative difference below which two sources count as agreeing. Floating point and
 *  rounding conventions differ upstream; 0.5% is well under any real price change. */
const CONFLICT_TOLERANCE = 0.005;

/** No real model costs this much per 1M tokens. A value above the ceiling is an
 *  upstream unit error (a per-token figure published as if it were per-million, or
 *  vice versa), and publishing it would be worse than publishing nothing — so the
 *  field is nulled and the model is reported. Catches new upstream mistakes on its own. */
const SANITY_CEILING_PER_M = 5000;
const TOKEN_PRICE_FIELDS = ['input', 'output', 'cache_read', 'cache_write', 'input_batch', 'output_batch', 'input_audio', 'output_audio', 'reasoning'];

/** Fields whose best curator is not the highest-precedence source. */
const FIELD_OWNERS = {
  knowledge_cutoff: 'modelsdev',
  released_at: 'modelsdev',
  open_weights: 'modelsdev',
  display_name: 'modelsdev',
};

export function mergeAll(sourceResults, sourceMeta) {
  const precedence = new Map(sourceMeta.map((s) => [s.id, s.precedence ?? 0]));
  const byId = new Map();

  for (const records of sourceResults) {
    for (const rec of records) {
      if (!byId.has(rec.id)) byId.set(rec.id, []);
      byId.get(rec.id).push(rec);
    }
  }

  const overrides = readJSON(p('overrides', 'manual.json'), { models: {}, hide: { ids: [] } });
  const hidePatterns = overrides.hide?.ids || [];
  const manual = overrides.models || {};

  const models = [];
  const suspect = [];
  let conflictCount = 0;
  let hidden = 0;
  let zeroPriced = 0;

  for (const [id, candidates] of byId) {
    if (hidePatterns.some((pat) => globMatch(pat, id))) { hidden++; continue; }

    candidates.sort((a, b) => (precedence.get(b._source) ?? 0) - (precedence.get(a._source) ?? 0));

    const merged = mergeCandidates(id, dedupeBySource(candidates));
    conflictCount += merged.conflicts.length;

    const meta = providerMeta(merged.provider);

    const rejected = sanitizePricing(merged, meta.tier);
    if (rejected.length) suspect.push({ id, fields: rejected });
    if (merged._zero_priced) { zeroPriced++; delete merged._zero_priced; }

    const override = manual[id];
    if (override) applyOverride(merged, override);

    merged.provider_name = meta.name;
    merged.provider_tier = meta.tier;
    merged.pricing_url = merged.pricing_url || meta.pricing_url || null;
    merged.docs_url = merged.docs_url || meta.docs_url || null;
    merged.family = familyOf(merged.model);
    merged.updated_at = nowISO();

    models.push(merged);
  }

  models.sort((a, b) => a.id.localeCompare(b.id));
  log.info(`merged ${models.length} models · ${conflictCount} field conflicts recorded · ${hidden} hidden by overrides`);
  if (zeroPriced) log.info(`${zeroPriced} models quoted $0 for both input and output — treated as unknown, not free`);
  if (suspect.length) {
    log.warn(`${suspect.length} models had prices above $${SANITY_CEILING_PER_M}/1M — fields dropped as upstream unit errors:`);
    for (const s of suspect.slice(0, 10)) log.warn(`  ${s.id} (${s.fields.join(', ')})`);
    if (suspect.length > 10) log.warn(`  …and ${suspect.length - 10} more`);
  }
  return { models, conflictCount, suspect };
}

function sanitizePricing(model, providerTier) {
  const rejected = [];

  // A commercial endpoint quoting $0 for BOTH input and output is upstream shorthand
  // for "we don't have this price", not a free lunch — and left as 0 it sorts to the
  // top of every cheapest-first list, burying the real answer. Locally-run models are
  // the genuine exception, so they keep their zeros.
  if (providerTier !== 'local' && model.pricing.input === 0 && model.pricing.output === 0) {
    model.pricing.input = null;
    model.pricing.output = null;
    model._zero_priced = true;
  }

  for (const field of TOKEN_PRICE_FIELDS) {
    const v = model.pricing[field];
    if (v !== null && !inRange(v)) {
      model.pricing[field] = null;
      rejected.push(field);
    }
  }
  for (const field of ['per_image', 'per_second', 'per_request']) {
    const v = model.pricing[field];
    if (v !== null && v < 0) {
      model.pricing[field] = null;
      rejected.push(field);
    }
  }
  for (const tier of model.pricing.tiers || []) {
    for (const field of ['input', 'output', 'cache_read', 'cache_write']) {
      if (tier[field] != null && !inRange(tier[field])) {
        tier[field] = null;
        rejected.push(`tiers.${field}`);
      }
    }
  }
  return rejected;
}

/** Two-sided: OpenRouter publishes -1 for variable-price router entries, and a negative
 *  price is as much a non-fact as an absurdly large one. */
const inRange = (v) => v >= 0 && v <= SANITY_CEILING_PER_M;

/** One source can legitimately emit several upstream keys that canonicalize onto the same
 *  id — LiteLLM lists `gpt-5.2` and `chatgpt/gpt-5.2` separately, and both resolve to
 *  `openai/gpt-5.2`. Left alone they behave like independent sources: fields get mixed
 *  across two different products (subscription context window against API pricing), the
 *  winner is decided by upstream file order, and every difference is logged as a
 *  cross-source "conflict" between litellm and itself. Keep the most complete record per
 *  source and merge only genuinely distinct sources. */
function dedupeBySource(candidates) {
  const best = new Map();
  for (const c of candidates) {
    const cur = best.get(c._source);
    if (!cur || completeness(c) > completeness(cur)) best.set(c._source, c);
  }
  return [...best.values()];
}

function completeness(rec) {
  let n = 0;
  for (const v of Object.values(rec.pricing || {})) {
    if (Array.isArray(v)) n += v.length ? 1 : 0;
    else if (v !== null && v !== undefined) n++;
  }
  for (const v of Object.values(rec.context || {})) if (v !== null && v !== undefined) n++;
  return n;
}

function mergeCandidates(id, candidates) {
  const winner = candidates[0];
  const out = {
    id,
    provider: winner.provider,
    model: winner.model,
    // Left null so FIELD_OWNERS can hand it to the source that curates names; the
    // fallback to `model` happens after that pass.
    display_name: null,
    family: null,
    mode: winner.mode,
    context: { input: null, output: null, total: null },
    pricing: emptyPricing(),
    rate_limits: { rpm: null, tpm: null, rpd: null },
    capabilities: {},
    modalities: { input: [], output: [] },
    knowledge_cutoff: null,
    released_at: null,
    deprecated_at: null,
    open_weights: null,
    sources: candidates.map((c) => c._source),
    conflicts: [],
    docs_url: null,
    pricing_url: null,
    updated_at: null,
  };

  // First non-null wins, walking candidates in precedence order.
  for (const c of candidates) {
    fillScalar(out.pricing, c.pricing, ['input', 'output', 'cache_read', 'cache_write', 'input_batch', 'output_batch', 'input_audio', 'output_audio', 'reasoning', 'per_image', 'per_second', 'per_request']);
    fillScalar(out.context, c.context, ['input', 'output', 'total']);
    fillScalar(out.rate_limits, c.rate_limits, ['rpm', 'tpm', 'rpd']);
    if (!out.pricing.tiers?.length && c.pricing?.tiers?.length) out.pricing.tiers = c.pricing.tiers;
    if (!out.modalities.input.length && c.modalities?.input?.length) out.modalities.input = c.modalities.input;
    if (!out.modalities.output.length && c.modalities?.output?.length) out.modalities.output = c.modalities.output;
    if (out.deprecated_at === null && c.deprecated_at) out.deprecated_at = c.deprecated_at;
    if (out.docs_url === null && c.docs_url) out.docs_url = c.docs_url;
    if (out.pricing_url === null && c.pricing_url) out.pricing_url = c.pricing_url;
    // Capabilities are a union: a source that omits a flag is silent, not negative.
    for (const [k, v] of Object.entries(c.capabilities || {})) if (v === true) out.capabilities[k] = true;
  }

  // Curated fields go to their owner source when that source has the model at all.
  for (const [field, ownerId] of Object.entries(FIELD_OWNERS)) {
    const owner = candidates.find((c) => c._source === ownerId && c[field] != null);
    if (owner) out[field] = owner[field];
    else if (out[field] == null) {
      const any = candidates.find((c) => c[field] != null);
      if (any) out[field] = any[field];
    }
  }
  if (!out.display_name) out.display_name = out.model;

  // Cross-check every source that actually has an opinion.
  if (candidates.length > 1) {
    for (const [group, field] of VERIFIED_FIELDS) {
      const values = candidates
        .filter((c) => c[group]?.[field] !== null && c[group]?.[field] !== undefined)
        .map((c) => ({ source: c._source, value: c[group][field] }));
      if (values.length < 2) continue;
      if (!disagrees(values.map((v) => v.value))) continue;
      out.conflicts.push({ field: `${group}.${field}`, values });
    }
  }

  return out;
}

function disagrees(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return false;
  if (min === 0) return max !== 0;
  return (max - min) / Math.abs(min) > CONFLICT_TOLERANCE;
}

function fillScalar(target, src, fields) {
  if (!src) return;
  for (const f of fields) {
    if (target[f] === null || target[f] === undefined) {
      const v = src[f];
      if (v !== null && v !== undefined) target[f] = v;
    }
  }
}

function applyOverride(model, override) {
  for (const [key, value] of Object.entries(override)) {
    if (key.startsWith('_')) continue;
    if (key === 'pricing' || key === 'context' || key === 'rate_limits' || key === 'capabilities') {
      Object.assign(model[key], value);
    } else {
      model[key] = value;
    }
  }
  if (!model.sources.includes('manual')) model.sources.unshift('manual');
  // A human looked at it; stale machine disagreements are no longer interesting.
  model.conflicts = [];
}

function emptyPricing() {
  return {
    input: null, output: null, cache_read: null, cache_write: null,
    input_batch: null, output_batch: null, input_audio: null, output_audio: null,
    reasoning: null, per_image: null, per_second: null, per_request: null, tiers: [],
  };
}
