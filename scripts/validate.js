#!/usr/bin/env node
/**
 * Sanity checks over the generated dataset. Runs in CI before anything is committed.
 * Deliberately hand-rolled rather than pulling in a JSON Schema library: the repo has
 * zero dependencies, and the checks that actually catch regressions here are semantic
 * (a price that moved 10x, an override that has gone stale) rather than structural.
 */
import fs from 'node:fs';
import { p, readJSON, log, fmtUSD } from './lib/util.js';

const MODES = new Set([
  'chat', 'completion', 'embedding', 'rerank', 'moderation',
  'image_generation', 'image_edit', 'video_generation',
  'audio_transcription', 'audio_speech', 'responses', 'other',
]);

// Nothing legitimately costs more than this per 1M tokens; a hit means a unit error.
const ABSURD_PRICE = 5000;
const STALE_OVERRIDE_DAYS = 90;

const errors = [];
const warnings = [];

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function main() {
  if (!fs.existsSync(p('data', 'models.json'))) {
    err('data/models.json does not exist — run `npm run update` first');
    return report();
  }

  const dataset = readJSON(p('data', 'models.json'));
  checkSchemaFileParses();
  checkMeta(dataset);
  checkModels(dataset);
  checkOverrides();
  checkHistory();

  report();
}

function checkSchemaFileParses() {
  try {
    const schema = readJSON(p('schema', 'model.schema.json'));
    if (!schema.properties?.pricing) err('schema/model.schema.json is missing `pricing`');
  } catch (e) {
    err(`schema/model.schema.json does not parse: ${e.message}`);
  }
}

function checkMeta(d) {
  if (!d.meta) return err('dataset has no `meta`');
  if (d.meta.price_unit !== 'per_1m_tokens') err(`meta.price_unit is "${d.meta.price_unit}", expected "per_1m_tokens"`);
  if (!Array.isArray(d.meta.sources) || !d.meta.sources.length) err('meta.sources is empty');
  if (d.meta.counts?.models !== d.models?.length) {
    err(`meta.counts.models (${d.meta.counts?.models}) != models.length (${d.models?.length})`);
  }
  const dead = (d.meta.sources || []).filter((s) => !s.ok);
  for (const s of dead) warn(`source "${s.id}" returned nothing on the last run`);
}

function checkModels(d) {
  const models = d.models || [];
  if (!models.length) return err('dataset contains no models');

  const seen = new Set();
  let pricedChat = 0;

  for (const m of models) {
    const at = m.id || '<no id>';

    if (!m.id) err('a model has no id');
    else if (seen.has(m.id)) err(`duplicate id: ${m.id}`);
    else seen.add(m.id);

    if (!m.provider) err(`${at}: no provider`);
    if (!m.model) err(`${at}: no model name`);
    if (m.id && m.provider && m.model && m.id !== `${m.provider}/${m.model}`) {
      err(`${at}: id does not match provider/model (${m.provider}/${m.model})`);
    }
    if (!MODES.has(m.mode)) err(`${at}: unknown mode "${m.mode}"`);
    if (!Array.isArray(m.sources) || !m.sources.length) err(`${at}: no sources recorded`);
    if (!m.pricing) { err(`${at}: no pricing object`); continue; }

    for (const [field, v] of Object.entries(m.pricing)) {
      if (field === 'tiers') continue;
      if (v === null) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) { err(`${at}: pricing.${field} is not a finite number (${v})`); continue; }
      if (v < 0) err(`${at}: pricing.${field} is negative (${v})`);
      if (v > ABSURD_PRICE) warn(`${at}: pricing.${field} = ${fmtUSD(v)} per 1M — check the unit`);
    }

    for (const tier of m.pricing.tiers || []) {
      if (!Number.isInteger(tier.above_tokens)) err(`${at}: tier missing a numeric above_tokens`);
    }

    for (const field of ['input', 'output']) {
      const v = m.context?.[field];
      if (v !== null && v !== undefined && (!Number.isInteger(v) || v <= 0)) {
        err(`${at}: context.${field} is not a positive integer (${v})`);
      }
    }

    if (m.deprecated_at && !/^\d{4}-\d{2}-\d{2}$/.test(m.deprecated_at)) {
      warn(`${at}: deprecated_at is not YYYY-MM-DD ("${m.deprecated_at}")`);
    }

    if (m.mode === 'chat' && m.pricing.input !== null && m.pricing.output !== null) pricedChat++;
  }

  // A collapse here means the merge or a source broke, even if nothing threw.
  if (pricedChat < 200) err(`only ${pricedChat} chat models have both input and output prices — the merge looks broken`);

  const conflicted = models.filter((m) => m.conflicts?.length).length;
  if (conflicted) log.info(`${conflicted} models have cross-source conflicts (expected — they are published, not hidden)`);
}

function checkOverrides() {
  const overrides = readJSON(p('overrides', 'manual.json'), null);
  if (!overrides) return err('overrides/manual.json does not parse');

  const cutoff = new Date(Date.now() - STALE_OVERRIDE_DAYS * 86400000).toISOString().slice(0, 10);
  for (const [id, o] of Object.entries(overrides.models || {})) {
    if (!o._source) warn(`override ${id} has no _source link`);
    if (!o._verified) { warn(`override ${id} has no _verified date`); continue; }
    if (o._verified < cutoff) {
      warn(`override ${id} was last verified ${o._verified} (>${STALE_OVERRIDE_DAYS}d ago) — re-check it against ${o._source || 'the provider'}`);
    }
  }

  const featured = readJSON(p('overrides', 'featured.json'), null);
  if (!featured) return err('overrides/featured.json does not parse');
  for (const pat of featured.exclude_patterns || []) {
    try { new RegExp(pat); } catch { err(`featured.json: "${pat}" is not a valid regex`); }
  }
}

function checkHistory() {
  const file = p('data', 'history', 'prices.jsonl');
  if (!fs.existsSync(file)) return;
  let n = 0;
  for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    n++;
    try {
      const e = JSON.parse(line);
      if (!e.date || !e.type || !e.id) err(`history line ${i + 1}: missing date/type/id`);
    } catch {
      err(`history line ${i + 1} is not valid JSON`);
    }
  }
  log.info(`history: ${n} events`);
}

function report() {
  for (const w of warnings) log.warn(w);
  for (const e of errors) log.error(e);

  if (errors.length) {
    log.error(`${errors.length} error(s), ${warnings.length} warning(s) — failing`);
    process.exit(1);
  }
  log.info(`validation passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}`);
}

main();
