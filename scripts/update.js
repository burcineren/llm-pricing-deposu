#!/usr/bin/env node
/**
 * Daily pipeline: fetch every source -> normalize -> merge -> diff against yesterday
 * -> write data files, changelog and README tables.
 *
 *   node scripts/update.js            # normal run
 *   node scripts/update.js --offline  # reuse .cache/*.json, no network
 *   node scripts/update.js --dry-run  # compute and report, write nothing
 */
import fs from 'node:fs';
import { p, writeJSON, log, nowISO, readJSON } from './lib/util.js';
import { providerMeta } from './lib/providers.js';
import { mergeAll } from './lib/merge.js';
import { diffDatasets, appendHistory, renderChangelog, recentEvents, loadPrevious } from './lib/diff.js';
import { renderReadmes } from './lib/render-readme.js';

import * as litellm from './sources/litellm.js';
import * as openrouter from './sources/openrouter.js';
import * as modelsdev from './sources/modelsdev.js';

const SOURCES = [litellm, openrouter, modelsdev];

const argv = new Set(process.argv.slice(2));
const OFFLINE = argv.has('--offline');
const DRY_RUN = argv.has('--dry-run');

async function main() {
  const started = Date.now();
  log.step(`Fetching ${SOURCES.length} sources${OFFLINE ? ' (offline)' : ''}`);

  const results = [];
  const sourceMeta = [];

  const settled = await Promise.allSettled(
    SOURCES.map((s) => s.fetch({ offline: OFFLINE }))
  );

  settled.forEach((res, i) => {
    const s = SOURCES[i];
    const records = res.status === 'fulfilled' ? res.value : [];
    if (res.status === 'rejected') log.error(`${s.meta.id} threw: ${res.reason?.message || res.reason}`);
    results.push(records);
    sourceMeta.push({
      id: s.meta.id,
      name: s.meta.name,
      url: s.meta.url,
      license: s.meta.license,
      precedence: s.meta.precedence,
      ok: records.length > 0,
      records: records.length,
    });
  });

  const live = sourceMeta.filter((s) => s.ok);
  if (!live.length) {
    log.error('every source failed — refusing to overwrite good data with nothing');
    process.exit(1);
  }

  // A source that normally carries thousands of models suddenly returning a handful
  // means an upstream schema change, not a real catalogue shrink. Publishing that
  // would wipe half the dataset and fire a changelog full of false removals.
  const previous = loadPrevious();
  if (previous?.meta?.sources) {
    for (const s of sourceMeta) {
      const before = previous.meta.sources.find((x) => x.id === s.id);
      // No `s.ok` check: a source dropping to zero (5xx, DNS, rate limit — all of which
      // fetchJSON swallows) is the worst case, not an exempt one. Publishing then would
      // retire that source's entire catalogue and write the false removals into history
      // permanently.
      if (before?.ok && before.records > 100 && s.records < before.records * 0.5) {
        log.error(`${s.id}: ${before.records} -> ${s.records} records (>50% drop). Aborting; inspect the upstream feed.`);
        process.exit(1);
      }
    }
  }

  log.step('Merging');
  const { models, suspect } = mergeAll(results, sourceMeta);

  log.step('Diffing against previous run');
  const events = diffDatasets(previous, { models });
  summarize(events);

  const dataset = {
    meta: buildMeta(models, sourceMeta, started),
    models,
  };
  dataset.meta.rejected_prices = suspect;

  if (DRY_RUN) {
    log.warn('dry run — nothing written');
    return;
  }

  log.step('Writing');
  appendHistory(events);
  renderChangelog();

  dataset.meta.recent_changes = recentEvents(30).slice(0, 500);

  writeJSON(p('data', 'models.json'), dataset);
  writeJSON(p('data', 'models.min.json'), dataset, { pretty: false });
  writeJSON(p('data', 'chat.json'), {
    meta: { ...dataset.meta, subset: 'chat' },
    models: models.filter((m) => m.mode === 'chat'),
  });
  writeJSON(p('data', 'providers.json'), buildProviderFile(dataset));

  renderReadmes(dataset, recentEvents(30));

  log.step('Done');
  log.info(`${models.length} models · ${events.length} events · ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

function buildMeta(models, sourceMeta, started) {
  const byProvider = {};
  const byMode = {};
  let priced = 0;
  let conflicted = 0;

  for (const m of models) {
    const slug = m.provider;
    byProvider[slug] ||= { total: 0, priced: 0, chat: 0 };
    byProvider[slug].total++;
    byMode[m.mode] = (byMode[m.mode] || 0) + 1;
    if (m.mode === 'chat') byProvider[slug].chat++;
    if (m.pricing.input !== null || m.pricing.output !== null) {
      byProvider[slug].priced++;
      priced++;
    }
    if (m.conflicts.length) conflicted++;
  }

  return {
    name: 'llm-pricing-deposu',
    description: 'Daily-updated LLM pricing, context windows and rate limits, cross-verified across sources.',
    homepage: 'https://apideposu.github.io/llm-pricing-deposu/',
    repository: 'https://github.com/apideposu/llm-pricing-deposu',
    license: 'MIT',
    schema: 'https://apideposu.github.io/llm-pricing-deposu/schema/model.schema.json',
    currency: 'USD',
    price_unit: 'per_1m_tokens',
    disclaimer: 'Aggregated from public sources on a best-effort basis. Verify against the provider before relying on a price.',
    generated_at: nowISO(),
    generation_ms: Date.now() - started,
    counts: {
      models: models.length,
      priced,
      conflicted,
      providers: Object.keys(byProvider).length,
      by_mode: byMode,
      by_provider: byProvider,
    },
    sources: sourceMeta,
  };
}

function buildProviderFile(dataset) {
  const providers = [];
  for (const [slug, stat] of Object.entries(dataset.meta.counts.by_provider)) {
    const meta = providerMeta(slug);
    providers.push({
      slug,
      name: meta.name,
      tier: meta.tier,
      pricing_url: meta.pricing_url || null,
      docs_url: meta.docs_url || null,
      models: stat.total,
      chat_models: stat.chat,
      priced_models: stat.priced,
    });
  }
  providers.sort((a, b) => b.models - a.models);
  return { meta: { generated_at: dataset.meta.generated_at, count: providers.length }, providers };
}

function summarize(events) {
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
  if (!events.length) { log.info('no changes since last run'); return; }
  log.info('changes: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));

  const notable = events
    .filter((e) => e.type === 'price_change' && Math.abs(e.pct) >= 10)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 8);
  for (const e of notable) {
    log.info(`  ${e.direction === 'down' ? '▼' : '▲'} ${e.id} ${e.field} ${e.pct > 0 ? '+' : ''}${e.pct}%`);
  }

  // Consumed by the workflow to write the commit message and the job summary.
  if (process.env.GITHUB_OUTPUT) {
    const summary = Object.entries(counts).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changes=${events.length}\nsummary=${summary}\n`);
  }
}

main().catch((err) => {
  log.error(err.stack || err.message);
  process.exit(1);
});
