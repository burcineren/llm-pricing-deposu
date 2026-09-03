import { fetchJSON, perMillion, int, posInt, num, log, readJSON, p } from '../lib/util.js';
import { canonicalProvider, isExcludedProvider, stripProviderPrefix } from '../lib/providers.js';

export const meta = {
  id: 'litellm',
  name: 'LiteLLM model_prices_and_context_window',
  url: 'https://github.com/BerriAI/litellm',
  license: 'MIT',
  // Widest coverage by far and the only source that carries cache/batch/tiered pricing
  // for most providers, so it wins ties by default.
  precedence: 3,
};

const URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const MODE_MAP = {
  chat: 'chat',
  completion: 'completion',
  responses: 'chat',
  realtime: 'chat',
  embedding: 'embedding',
  rerank: 'rerank',
  moderation: 'moderation',
  image_generation: 'image_generation',
  image_edit: 'image_edit',
  video_generation: 'video_generation',
  audio_transcription: 'audio_transcription',
  audio_speech: 'audio_speech',
};

const CAP_MAP = {
  supports_vision: 'vision',
  supports_function_calling: 'function_calling',
  supports_parallel_function_calling: 'parallel_tools',
  supports_prompt_caching: 'prompt_caching',
  supports_reasoning: 'reasoning',
  supports_response_schema: 'structured_output',
  supports_pdf_input: 'pdf_input',
  supports_computer_use: 'computer_use',
  supports_web_search: 'web_search',
  supports_audio_input: 'audio_input',
  supports_audio_output: 'audio_output',
  supports_video_input: 'video_input',
  supports_assistant_prefill: 'assistant_prefill',
};

// `input_cost_per_token_above_200k_tokens` -> 200_000. Deliberately ignores the
// `_priority` / `_flex` service-tier variants: those are a different product, not a
// long-context surcharge, and folding them in would double-count.
const TIER_RE = /^(input_cost_per_token|output_cost_per_token|cache_read_input_token_cost|cache_creation_input_token_cost)_above_(\d+)k_tokens$/;

export async function fetch_({ offline = false } = {}) {
  let raw;
  if (offline) {
    raw = readJSON(p('.cache', 'litellm.json'), null);
    if (!raw) {
      log.warn('litellm: offline mode but no cached copy at .cache/litellm.json');
      return [];
    }
  } else {
    raw = await fetchJSON(URL);
    if (!raw) {
      log.warn('litellm: source unreachable, skipping');
      return [];
    }
  }

  const out = [];
  let skipped = 0;

  for (const [key, v] of Object.entries(raw)) {
    if (key === 'sample_spec' || !v || typeof v !== 'object') continue;

    const provider = canonicalProvider(v.litellm_provider);
    if (!provider || isExcludedProvider(provider)) { skipped++; continue; }

    const mode = MODE_MAP[v.mode] || (v.mode ? 'other' : 'chat');
    // Search/guardrail/vector-store entries are billing line items, not models.
    if (['search', 'guardrail', 'vector_store', 'ocr'].includes(v.mode)) { skipped++; continue; }

    const model = stripProviderPrefix(key, provider);

    const pricing = {
      input: perMillion(v.input_cost_per_token),
      output: perMillion(v.output_cost_per_token),
      cache_read: perMillion(v.cache_read_input_token_cost ?? v.input_cost_per_token_cache_hit),
      cache_write: perMillion(v.cache_creation_input_token_cost),
      input_batch: perMillion(v.input_cost_per_token_batches),
      output_batch: perMillion(v.output_cost_per_token_batches),
      input_audio: perMillion(v.input_cost_per_audio_token),
      output_audio: perMillion(v.output_cost_per_audio_token),
      reasoning: perMillion(v.output_cost_per_reasoning_token),
      per_image: num(v.output_cost_per_image ?? v.input_cost_per_image),
      per_second: num(v.output_cost_per_second ?? v.input_cost_per_second),
      per_request: num(v.input_cost_per_request ?? v.input_cost_per_query),
      tiers: extractTiers(v),
    };

    // Drop entries that carry no usable price signal at all.
    const hasPrice = Object.entries(pricing).some(([k, val]) => k !== 'tiers' && val !== null);
    if (!hasPrice && mode !== 'chat') { skipped++; continue; }

    const capabilities = {};
    for (const [src, dst] of Object.entries(CAP_MAP)) {
      if (v[src] === true) capabilities[dst] = true;
    }

    out.push({
      id: `${provider}/${model}`,
      provider,
      model,
      mode,
      context: {
        input: posInt(v.max_input_tokens),
        output: posInt(v.max_output_tokens),
        total: posInt(v.max_input_tokens && v.max_output_tokens ? null : v.max_tokens),
      },
      pricing,
      rate_limits: {
        rpm: posInt(v.rpm),
        tpm: posInt(v.tpm),
        rpd: null,
      },
      capabilities,
      modalities: {
        input: arr(v.supported_modalities),
        output: arr(v.supported_output_modalities),
      },
      deprecated_at: v.deprecation_date || null,
      pricing_url: typeof v.source === 'string' && v.source.startsWith('http') ? v.source : null,
      _source: meta.id,
    });
  }

  log.info(`litellm: ${out.length} models (${skipped} entries skipped as non-model/excluded)`);
  return out;
}

function extractTiers(v) {
  const byThreshold = new Map();
  for (const [field, value] of Object.entries(v)) {
    const m = TIER_RE.exec(field);
    if (!m) continue;
    const threshold = Number(m[2]) * 1000;
    const slot =
      m[1] === 'input_cost_per_token' ? 'input'
      : m[1] === 'output_cost_per_token' ? 'output'
      : m[1] === 'cache_read_input_token_cost' ? 'cache_read'
      : 'cache_write';
    if (!byThreshold.has(threshold)) byThreshold.set(threshold, { above_tokens: threshold });
    byThreshold.get(threshold)[slot] = perMillion(value);
  }
  return [...byThreshold.values()].sort((a, b) => a.above_tokens - b.above_tokens);
}

const arr = (v) => (Array.isArray(v) && v.length ? v.map(String) : []);

export { fetch_ as fetch };
