import fs from 'node:fs';
import { p, readJSON, today, fmtUSD, fmtTokens, log } from './util.js';

const TRACKED_PRICES = ['input', 'output', 'cache_read', 'cache_write', 'input_batch', 'output_batch'];
const TRACKED_CONTEXT = ['input', 'output'];

/** A price is only "changed" if it moved more than this. Upstream sources round
 *  differently from one day to the next; without a floor the changelog fills with noise. */
const NOISE_FLOOR = 0.005; // 0.5%

export function diffDatasets(previous, next) {
  const prevById = new Map((previous?.models || []).map((m) => [m.id, m]));
  const nextById = new Map(next.models.map((m) => [m.id, m]));

  const events = [];
  const date = today();

  for (const [id, m] of nextById) {
    const before = prevById.get(id);

    if (!before) {
      // Never announce "new model" on the very first run — everything would be new.
      if (prevById.size > 0) {
        events.push({
          date, type: 'added', id, provider: m.provider, model: m.model,
          pricing: { input: m.pricing.input, output: m.pricing.output },
          context: m.context.input,
        });
      }
      continue;
    }

    for (const field of TRACKED_PRICES) {
      const a = before.pricing?.[field] ?? null;
      const b = m.pricing?.[field] ?? null;
      if (a === b) continue;
      if (a === null || b === null) {
        events.push({ date, type: b === null ? 'price_removed' : 'price_added', id, provider: m.provider, model: m.model, field, from: a, to: b });
        continue;
      }
      const rel = a === 0 ? (b === 0 ? 0 : 1) : (b - a) / Math.abs(a);
      if (Math.abs(rel) <= NOISE_FLOOR) continue;
      events.push({
        date, type: 'price_change', id, provider: m.provider, model: m.model,
        field, from: a, to: b, pct: Number((rel * 100).toFixed(2)),
        direction: b > a ? 'up' : 'down',
      });
    }

    for (const field of TRACKED_CONTEXT) {
      const a = before.context?.[field] ?? null;
      const b = m.context?.[field] ?? null;
      if (a === b || a === null || b === null) continue;
      events.push({ date, type: 'context_change', id, provider: m.provider, model: m.model, field, from: a, to: b, direction: b > a ? 'up' : 'down' });
    }

    if (!before.deprecated_at && m.deprecated_at) {
      events.push({ date, type: 'deprecation', id, provider: m.provider, model: m.model, to: m.deprecated_at });
    }
  }

  for (const [id, m] of prevById) {
    if (!nextById.has(id)) {
      events.push({ date, type: 'removed', id, provider: m.provider, model: m.model });
    }
  }

  return events;
}

export function appendHistory(events) {
  if (!events.length) return 0;
  const file = p('data', 'history', 'prices.jsonl');
  fs.mkdirSync(p('data', 'history'), { recursive: true });
  const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(file, lines);
  return events.length;
}

/** Rebuild CHANGELOG.md from the full history file, newest day first. */
export function renderChangelog() {
  const file = p('data', 'history', 'prices.jsonl');

  const byDate = new Map();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e);
    }
  }

  const dates = [...byDate.keys()].sort().reverse().slice(0, 180);

  const out = [
    '# Price change log',
    '',
    'Every pricing, context-window and availability change this repo has observed, newest first.',
    'Generated from [`data/history/prices.jsonl`](data/history/prices.jsonl) — do not edit by hand.',
    '',
    'Machine-readable: each line of that file is one JSON event with `date`, `type`, `id`, `field`, `from`, `to`, `pct`.',
    '',
  ];

  if (!dates.length) {
    out.push(
      '_Nothing recorded yet._',
      '',
      'History starts on the second run: the first pass has no previous snapshot to compare',
      'against, so it would report every model in the catalogue as new. Entries appear here',
      'from the next daily update onward, and accumulate from there.',
      '',
    );
  }

  for (const date of dates) {
    const events = byDate.get(date);
    out.push(`## ${date}`, '');

    const cuts = events.filter((e) => e.type === 'price_change' && e.direction === 'down');
    const hikes = events.filter((e) => e.type === 'price_change' && e.direction === 'up');
    const added = events.filter((e) => e.type === 'added');
    const removed = events.filter((e) => e.type === 'removed');
    const deprecated = events.filter((e) => e.type === 'deprecation');
    const ctx = events.filter((e) => e.type === 'context_change');
    const priceAdded = events.filter((e) => e.type === 'price_added');
    const priceRemoved = events.filter((e) => e.type === 'price_removed');

    if (cuts.length) {
      out.push(`### Price cuts (${cuts.length})`, '');
      for (const e of cuts.sort((a, b) => a.pct - b.pct)) out.push(priceLine(e));
      out.push('');
    }
    if (hikes.length) {
      out.push(`### Price increases (${hikes.length})`, '');
      for (const e of hikes.sort((a, b) => b.pct - a.pct)) out.push(priceLine(e));
      out.push('');
    }
    if (added.length) {
      out.push(`### New models (${added.length})`, '');
      for (const e of added.slice(0, 60)) {
        out.push(`- \`${e.id}\` — ${fmtUSD(e.pricing?.input)} in / ${fmtUSD(e.pricing?.output)} out, ${fmtTokens(e.context)} ctx`);
      }
      if (added.length > 60) out.push(`- …and ${added.length - 60} more`);
      out.push('');
    }
    if (deprecated.length) {
      out.push(`### Deprecations announced (${deprecated.length})`, '');
      for (const e of deprecated) out.push(`- \`${e.id}\` — retires ${e.to}`);
      out.push('');
    }
    if (ctx.length) {
      out.push(`### Context window changes (${ctx.length})`, '');
      for (const e of ctx) out.push(`- \`${e.id}\` — max ${e.field} ${fmtTokens(e.from)} → **${fmtTokens(e.to)}**`);
      out.push('');
    }
    if (priceAdded.length || priceRemoved.length) {
      out.push(`### Billing dimensions changed (${priceAdded.length + priceRemoved.length})`, '');
      for (const e of priceAdded) out.push(`- \`${e.id}\` — now bills \`${e.field}\` at ${fmtUSD(e.to)}`);
      for (const e of priceRemoved) out.push(`- \`${e.id}\` — no longer bills \`${e.field}\` (was ${fmtUSD(e.from)})`);
      out.push('');
    }
    if (removed.length) {
      out.push(`### Removed from catalogues (${removed.length})`, '');
      for (const e of removed.slice(0, 40)) out.push(`- \`${e.id}\``);
      if (removed.length > 40) out.push(`- …and ${removed.length - 40} more`);
      out.push('');
    }
  }

  fs.writeFileSync(p('CHANGELOG.md'), out.join('\n') + '\n');
  log.info(`changelog: ${dates.length} days rendered`);
}

function priceLine(e) {
  const arrow = e.direction === 'down' ? '▼' : '▲';
  const sign = e.pct > 0 ? '+' : '';
  return `- ${arrow} \`${e.id}\` — ${e.field} ${fmtUSD(e.from)} → **${fmtUSD(e.to)}** (${sign}${e.pct}%)`;
}

/** Rolling window of recent events, embedded in the dataset so API consumers get
 *  "what moved lately" without downloading the whole history file. */
export function recentEvents(days = 30) {
  const file = p('data', 'history', 'prices.jsonl');
  if (!fs.existsSync(file)) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const events = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.date >= cutoff) events.push(e);
    } catch { /* skip malformed line */ }
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export function loadPrevious() {
  return readJSON(p('data', 'models.json'), null);
}
