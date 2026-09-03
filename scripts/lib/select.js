/** Model selection heuristics shared by the README renderer and the site.
 *  "Which models deserve the front page" is a judgement call that needs tuning, so the
 *  knobs live in overrides/featured.json rather than being buried in code. */
import { p, readJSON } from './util.js';

const config = readJSON(p('overrides', 'featured.json'));
const EXCLUDE = (config.exclude_patterns || []).map((s) => new RegExp(s, 'i'));

export function isLiveChatModel(m) {
  if (m.mode !== 'chat') return false;
  if (m.pricing.input === null || m.pricing.output === null) return false;
  if (m.deprecated_at && m.deprecated_at < new Date().toISOString().slice(0, 10)) return false;
  return true;
}

/** Collapse dated snapshots (`claude-sonnet-4-5-20250929`) onto the family's best entry. */
export function pickPerFamily(models, keyFn = (m) => `${m.provider}::${m.family}`) {
  const byFamily = new Map();
  for (const m of models) {
    const key = keyFn(m);
    const cur = byFamily.get(key);
    if (!cur || betterRepresentative(m, cur)) byFamily.set(key, m);
  }
  return [...byFamily.values()];
}

function betterRepresentative(a, b) {
  // Prefer the undated alias — it is the one people actually put in code.
  const aDated = /\d{8}|\d{4}-\d{2}-\d{2}/.test(a.model);
  const bDated = /\d{8}|\d{4}-\d{2}-\d{2}/.test(b.model);
  if (aDated !== bDated) return !aDated;

  const ar = a.released_at || '';
  const br = b.released_at || '';
  if (ar !== br) return ar > br;

  const ac = a.context.input || 0;
  const bc = b.context.input || 0;
  if (ac !== bc) return ac > bc;

  return a.model.length < b.model.length;
}

const isVariantSpelling = (name) => EXCLUDE.some((re) => re.test(name));

/** Does this model belong to the provider's own line-up, rather than being a model
 *  from another lab that this provider happens to resell? */
function ownLineup(model, prefixes) {
  const name = model.toLowerCase();
  return prefixes.some((pre) => name.startsWith(pre.toLowerCase()));
}

export function featuredModels(models, perProvider = config.per_provider || 5) {
  const live = models.filter(isLiveChatModel);
  const out = [];

  for (const entry of config.providers || []) {
    const mine = live.filter(
      (m) => m.provider === entry.slug && ownLineup(m.model, entry.prefixes) && !isVariantSpelling(m.model)
    );

    const families = pickPerFamily(mine);
    families.sort((a, b) => {
      const ar = a.released_at || '';
      const br = b.released_at || '';
      if (ar !== br) return br.localeCompare(ar);
      const ac = a.context.input || 0;
      const bc = b.context.input || 0;
      if (ac !== bc) return bc - ac;
      // Within a generation, the pricier model is the more capable one.
      return (b.pricing.output || 0) - (a.pricing.output || 0);
    });

    out.push(...families.slice(0, perProvider));
  }
  return out;
}

/** Blended $/1M assuming a 3:1 input:output ratio — the usual shape of a chat workload.
 *  Stated openly wherever it is used, because any single number here is a simplification. */
export function blendedCost(m, inputWeight = 3, outputWeight = 1) {
  if (m.pricing.input === null || m.pricing.output === null) return null;
  const total = inputWeight + outputWeight;
  return Number(((m.pricing.input * inputWeight + m.pricing.output * outputWeight) / total).toFixed(4));
}

/** Leaderboards dedupe by model family across providers: a top-12 listing the same
 *  open-weights model on eight different hosts tells you nothing you didn't know. */
export function leaderboard(models, { by, limit = 10, dir = 'asc', filter = isLiveChatModel }) {
  const rows = models
    .filter(filter)
    .map((m) => ({ m, v: by(m) }))
    .filter((r) => r.v !== null && r.v !== undefined && Number.isFinite(r.v));
  rows.sort((a, b) => (dir === 'asc' ? a.v - b.v : b.v - a.v));

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (isVariantSpelling(r.m.model)) continue;
    if (seen.has(r.m.family)) continue;
    seen.add(r.m.family);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
