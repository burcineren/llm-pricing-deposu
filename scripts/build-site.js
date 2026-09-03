#!/usr/bin/env node
/**
 * Stages the data files the GitHub Pages site fetches.
 *
 * The site lives in docs/ and Pages serves that directory, so it cannot reach
 * ../data/. Rather than duplicating the whole dataset, this copies a trimmed
 * build: fields the table never reads are dropped, which takes the payload the
 * browser downloads from several MB to a fraction of that.
 */
import fs from 'node:fs';
import { p, readJSON, writeJSON, log } from './lib/util.js';

const OUT = p('docs', 'data');

function main() {
  const src = p('data', 'models.json');
  if (!fs.existsSync(src)) {
    log.error('data/models.json not found — run `npm run update` first');
    process.exit(1);
  }

  const dataset = readJSON(src);

  const slim = {
    meta: {
      generated_at: dataset.meta.generated_at,
      counts: dataset.meta.counts,
      sources: dataset.meta.sources,
      price_unit: dataset.meta.price_unit,
      currency: dataset.meta.currency,
      disclaimer: dataset.meta.disclaimer,
      recent_changes: (dataset.meta.recent_changes || []).slice(0, 200),
    },
    models: dataset.models.map(trim),
  };

  fs.mkdirSync(OUT, { recursive: true });
  writeJSON(p('docs', 'data', 'models.json'), slim, { pretty: false });

  // The site is static; a copy of the schema next to it makes the JSON self-describing
  // for anyone who lands on the Pages URL rather than the repo.
  fs.mkdirSync(p('docs', 'schema'), { recursive: true });
  fs.copyFileSync(p('schema', 'model.schema.json'), p('docs', 'schema', 'model.schema.json'));

  // Pages would otherwise run the output through Jekyll, which skips files and
  // directories beginning with an underscore.
  fs.writeFileSync(p('docs', '.nojekyll'), '');

  const kb = (fs.statSync(p('docs', 'data', 'models.json')).size / 1024).toFixed(0);
  log.info(`site data: ${slim.models.length} models, ${kb} KB`);
}

function trim(m) {
  const out = {
    id: m.id,
    provider: m.provider,
    provider_name: m.provider_name,
    provider_tier: m.provider_tier,
    model: m.model,
    display_name: m.display_name !== m.model ? m.display_name : undefined,
    mode: m.mode,
    context: stripNulls(m.context),
    pricing: stripNulls(m.pricing),
    capabilities: m.capabilities,
    sources: m.sources,
  };

  if (m.rate_limits?.rpm || m.rate_limits?.tpm) out.rate_limits = stripNulls(m.rate_limits);
  if (m.modalities?.input?.length) out.modalities = m.modalities;
  if (m.conflicts?.length) out.conflicts = m.conflicts;
  if (m.deprecated_at) out.deprecated_at = m.deprecated_at;
  if (m.released_at) out.released_at = m.released_at;
  if (m.knowledge_cutoff) out.knowledge_cutoff = m.knowledge_cutoff;
  if (m.open_weights != null) out.open_weights = m.open_weights;
  if (m.pricing_url) out.pricing_url = m.pricing_url;
  if (m.docs_url) out.docs_url = m.docs_url;

  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

function stripNulls(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out;
}

main();
