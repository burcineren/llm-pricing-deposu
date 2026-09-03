import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const p = (...s) => path.join(ROOT, ...s);

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 20;
const stamp = () => new Date().toISOString().slice(11, 19);

export const log = {
  debug: (...a) => LEVEL <= 10 && console.log(`${stamp()} ·`, ...a),
  info: (...a) => LEVEL <= 20 && console.log(`${stamp()} ·`, ...a),
  warn: (...a) => LEVEL <= 30 && console.warn(`${stamp()} ! `, ...a),
  error: (...a) => LEVEL <= 40 && console.error(`${stamp()} ✗ `, ...a),
  step: (s) => LEVEL <= 20 && console.log(`\n${stamp()} ▸ ${s}`),
};

export function readJSON(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeJSON(file, data, { pretty = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
  return file;
}

/** Fetch JSON with retry + timeout. Returns null instead of throwing, so one dead
 *  source can never take the whole daily run down with it. */
export async function fetchJSON(url, { retries = 3, timeoutMs = 45000, headers = {} } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { 'user-agent': 'llm-pricing-deposu/1.0 (+https://github.com/apideposu/llm-pricing-deposu)', accept: 'application/json', ...headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      const last = attempt === retries;
      log[last ? 'warn' : 'debug'](`fetch ${url} attempt ${attempt}/${retries} failed: ${err.message}`);
      if (last) return null;
      await sleep(1000 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Per-token cost -> USD per 1M tokens, rounded to kill float noise (2.5e-06*1e6 = 2.4999999). */
export function perMillion(perToken) {
  if (perToken === undefined || perToken === null) return null;
  const n = Number(perToken);
  if (!Number.isFinite(n)) return null;
  return round(n * 1e6);
}

export function round(n, dp = 6) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  const v = Number(Number(n).toFixed(dp));
  return Object.is(v, -0) ? 0 : v;
}

export function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function int(v) {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

/** For context windows and rate limits, where upstream sometimes writes 0 to mean
 *  "not applicable". A zero-token context window is not a fact, it is a missing value. */
export function posInt(v) {
  const n = int(v);
  return n === null || n <= 0 ? null : n;
}

/** USD formatting for tables: keeps small prices readable without a wall of zeros. */
export function fmtUSD(v) {
  if (v === null || v === undefined) return '—';
  if (v === 0) return 'free';
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 1) return `$${trimZeros(v.toFixed(2))}`;
  if (v >= 0.01) return `$${trimZeros(v.toFixed(3))}`;
  return `$${trimZeros(v.toFixed(4))}`;
}

const trimZeros = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

export function fmtTokens(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${trimZeros((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export const today = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString();

/** Simple `provider/*` glob match used by the hide list. */
export function globMatch(pattern, value) {
  if (pattern === value) return true;
  if (!pattern.includes('*')) return false;
  const re = new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
  return re.test(value);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
