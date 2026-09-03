import fs from 'node:fs';
import { p, fmtUSD, fmtTokens, log } from './util.js';
import { featuredModels, leaderboard, blendedCost, isLiveChatModel } from './select.js';
import { providerMeta } from './providers.js';

const STRINGS = {
  en: {
    model: 'Model', provider: 'Provider', input: 'Input', output: 'Output',
    cache: 'Cache read', ctx: 'Context', maxOut: 'Max out', caps: 'Notes',
    blended: 'Blended', change: 'Change', field: 'Field', when: 'When',
    models: 'Models', priced: 'with prices', tier: 'Tier',
    noChanges: '_No price movements recorded in the last 30 days._',
    perM: 'All prices are USD per 1M tokens.',
  },
  tr: {
    model: 'Model', provider: 'Sağlayıcı', input: 'Girdi', output: 'Çıktı',
    cache: 'Önbellek', ctx: 'Bağlam', maxOut: 'Maks. çıktı', caps: 'Notlar',
    blended: 'Harman', change: 'Değişim', field: 'Alan', when: 'Tarih',
    models: 'Model', priced: 'fiyatlı', tier: 'Kategori',
    noChanges: '_Son 30 günde fiyat hareketi kaydedilmedi._',
    perM: 'Tüm fiyatlar 1M token başına USD.',
  },
};

export function renderReadmes(dataset, events) {
  for (const [lang, file] of [['en', 'README.md'], ['tr', 'README.tr.md']]) {
    const path = p(file);
    if (!fs.existsSync(path)) { log.warn(`${file} missing, skipping`); continue; }
    let md = fs.readFileSync(path, 'utf8');
    const blocks = buildBlocks(dataset, events, lang);
    for (const [name, content] of Object.entries(blocks)) {
      md = replaceBlock(md, name, content);
    }
    fs.writeFileSync(path, md);
    log.info(`rendered ${file}`);
  }
}

function buildBlocks(dataset, events, lang) {
  const t = STRINGS[lang];
  const models = dataset.models;
  return {
    stats: statsBlock(dataset, lang),
    featured: featuredTable(models, t),
    cheapest: cheapestTable(models, t),
    context: contextTable(models, t),
    recent: recentTable(events, t),
    providers: providersTable(dataset, t, lang),
  };
}

function statsBlock(dataset, lang) {
  const m = dataset.meta;
  const badge = (label, value, color) =>
    `![${label}](https://img.shields.io/badge/${enc(label)}-${enc(value)}-${color})`;
  const line = [
    badge(lang === 'tr' ? 'model' : 'models', String(m.counts.models), '2f81f7'),
    badge(lang === 'tr' ? 'sağlayıcı' : 'providers', String(m.counts.providers), '8957e5'),
    badge(lang === 'tr' ? 'güncelleme' : 'updated', m.generated_at.slice(0, 10), '3fb950'),
    badge(lang === 'tr' ? 'kaynak' : 'sources', String(m.sources.filter((s) => s.ok).length), 'db6d28'),
    '[![daily update](https://github.com/apideposu/llm-pricing-deposu/actions/workflows/update.yml/badge.svg)](https://github.com/apideposu/llm-pricing-deposu/actions/workflows/update.yml)',
  ].join(' ');
  return line;
}

const enc = (s) => encodeURIComponent(String(s)).replace(/-/g, '--').replace(/_/g, '__');

function featuredTable(models, t) {
  const rows = featuredModels(models, 5);
  if (!rows.length) return '_No data yet — run `npm run update`._';

  const out = [
    `| ${t.provider} | ${t.model} | ${t.input} | ${t.output} | ${t.cache} | ${t.ctx} | ${t.maxOut} | ${t.caps} |`,
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  let lastProvider = null;
  for (const m of rows) {
    const provider = m.provider === lastProvider ? '' : `**${m.provider_name}**`;
    lastProvider = m.provider;
    out.push(
      `| ${provider} | \`${m.model}\` | ${fmtUSD(m.pricing.input)} | ${fmtUSD(m.pricing.output)} | ` +
      `${fmtUSD(m.pricing.cache_read)} | ${fmtTokens(m.context.input)} | ${fmtTokens(m.context.output)} | ${capIcons(m)} |`
    );
  }
  return out.join('\n');
}

function capIcons(m) {
  const c = m.capabilities || {};
  const icons = [];
  if (c.reasoning) icons.push('🧠');
  if (c.vision) icons.push('👁');
  if (c.function_calling) icons.push('🔧');
  if (c.prompt_caching) icons.push('💾');
  if (c.audio_input || c.audio_output) icons.push('🔊');
  return icons.join(' ') || '—';
}

function cheapestTable(models, t) {
  const rows = leaderboard(models, {
    by: (m) => blendedCost(m),
    limit: 12,
    dir: 'asc',
    filter: (m) => isLiveChatModel(m) && (m.context.input || 0) >= 32000 && blendedCost(m) > 0,
  });
  if (!rows.length) return '_No data yet._';

  const out = [
    `| # | ${t.model} | ${t.blended} | ${t.input} | ${t.output} | ${t.ctx} |`,
    '| ---: | --- | ---: | ---: | ---: | ---: |',
  ];
  rows.forEach((r, i) => {
    out.push(`| ${i + 1} | \`${r.m.id}\` | **${fmtUSD(r.v)}** | ${fmtUSD(r.m.pricing.input)} | ${fmtUSD(r.m.pricing.output)} | ${fmtTokens(r.m.context.input)} |`);
  });
  return out.join('\n');
}

function contextTable(models, t) {
  const rows = leaderboard(models, {
    by: (m) => m.context.input,
    limit: 12,
    dir: 'desc',
  });
  if (!rows.length) return '_No data yet._';

  const out = [
    `| # | ${t.model} | ${t.ctx} | ${t.input} | ${t.output} |`,
    '| ---: | --- | ---: | ---: | ---: |',
  ];
  rows.forEach((r, i) => {
    out.push(`| ${i + 1} | \`${r.m.id}\` | **${fmtTokens(r.v)}** | ${fmtUSD(r.m.pricing.input)} | ${fmtUSD(r.m.pricing.output)} |`);
  });
  return out.join('\n');
}

function recentTable(events, t) {
  const changes = events
    .filter((e) => e.type === 'price_change')
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 12);
  if (!changes.length) return t.noChanges;

  const out = [
    `| ${t.when} | ${t.model} | ${t.field} | ${t.change} |`,
    '| --- | --- | --- | ---: |',
  ];
  for (const e of changes) {
    const arrow = e.direction === 'down' ? '▼' : '▲';
    const sign = e.pct > 0 ? '+' : '';
    out.push(`| ${e.date} | \`${e.id}\` | ${e.field} | ${arrow} ${fmtUSD(e.from)} → **${fmtUSD(e.to)}** (${sign}${e.pct}%) |`);
  }
  return out.join('\n');
}

function providersTable(dataset, t, lang) {
  const tiers = lang === 'tr'
    ? { frontier: 'Model üreticisi', cloud: 'Bulut', inference: 'Inference', gateway: 'Gateway', specialist: 'Özel amaçlı', local: 'Yerel', other: 'Diğer' }
    : { frontier: 'Model lab', cloud: 'Cloud', inference: 'Inference host', gateway: 'Gateway', specialist: 'Specialist', local: 'Local', other: 'Other' };

  const byTier = new Map();
  for (const [slug, stat] of Object.entries(dataset.meta.counts.by_provider)) {
    const meta = providerMeta(slug);
    const tier = meta.tier || 'other';
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push({ slug, meta, ...stat });
  }

  const order = ['frontier', 'cloud', 'inference', 'gateway', 'specialist', 'local', 'other'];
  const out = [`| ${t.tier} | ${t.provider} | ${t.models} |`, '| --- | --- | ---: |'];
  for (const tier of order) {
    const rows = (byTier.get(tier) || []).sort((a, b) => b.total - a.total);
    rows.forEach((r, i) => {
      const label = i === 0 ? `**${tiers[tier]}**` : '';
      const name = r.meta.pricing_url ? `[${r.meta.name}](${r.meta.pricing_url})` : r.meta.name;
      out.push(`| ${label} | ${name} <sup>\`${r.slug}\`</sup> | ${r.total} |`);
    });
  }
  return out.join('\n');
}

function replaceBlock(md, name, content) {
  const start = `<!-- AUTOGEN:${name}:START -->`;
  const end = `<!-- AUTOGEN:${name}:END -->`;
  const si = md.indexOf(start);
  const ei = md.indexOf(end);
  if (si === -1 || ei === -1) return md;
  return md.slice(0, si + start.length) + '\n' + content + '\n' + md.slice(ei);
}
