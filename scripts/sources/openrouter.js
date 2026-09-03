import { fetchJSON, perMillion, posInt, num, log, readJSON, p } from '../lib/util.js';
import { canonicalProvider, isExcludedProvider } from '../lib/providers.js';

export const meta = {
  id: 'openrouter',
  name: 'OpenRouter model catalogue',
  url: 'https://openrouter.ai/docs/api-reference/list-available-models',
  license: 'public API',
  // Live from a running gateway, so it is the freshest source — but its catalogue is
  // limited to models OpenRouter actually routes.
  precedence: 2,
};

const URL = 'https://openrouter.ai/api/v1/models';

// OpenRouter namespaces models by the model *vendor*. Map those onto our canonical
// provider slugs so an OpenRouter row can cross-check the same model from LiteLLM.
const VENDOR_MAP = {
  google: 'gemini',
  'meta-llama': 'meta_llama',
  mistralai: 'mistral',
  'x-ai': 'xai',
  qwen: 'qwen_ai_platform',
  moonshotai: 'moonshot',
  'z-ai': 'zai',
  amazon: 'bedrock',
  microsoft: 'azure_ai',
  thudm: 'zai',
  ai21: 'ai21',
  minimax: 'minimax',
  perplexity: 'perplexity',
  cohere: 'cohere',
  deepseek: 'deepseek',
  anthropic: 'anthropic',
  openai: 'openai',
};

export async function fetch_({ offline = false } = {}) {
  let raw;
  if (offline) {
    raw = readJSON(p('.cache', 'openrouter.json'), null);
    if (!raw) { log.warn('openrouter: offline mode but no cached copy'); return []; }
  } else {
    raw = await fetchJSON(URL);
    if (!raw) { log.warn('openrouter: source unreachable, skipping'); return []; }
  }

  const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  if (!list.length) { log.warn('openrouter: empty catalogue'); return []; }

  const out = [];
  for (const m of list) {
    if (!m?.id) continue;
    const slash = m.id.indexOf('/');
    const vendor = slash === -1 ? 'openrouter' : m.id.slice(0, slash).toLowerCase();
    const model = slash === -1 ? m.id : m.id.slice(slash + 1);

    const provider = VENDOR_MAP[vendor] || canonicalProvider(vendor) || 'openrouter';
    if (isExcludedProvider(provider)) continue;

    const price = m.pricing || {};
    // OpenRouter fills every unpriced dimension with the string "0" rather than omitting
    // it, so a literal zero here means "not billed separately", not "free" — and left as
    // 0 it renders as "free" in the cache column and sets a phantom prompt_caching flag.
    // `prompt`/`completion` keep their zeros: a genuinely free model quotes 0 there, and
    // merge.js decides what a 0/0 pair means.
    const pricing = {
      input: perMillion(price.prompt),
      output: perMillion(price.completion),
      cache_read: nonZero(perMillion(price.input_cache_read)),
      cache_write: nonZero(perMillion(price.input_cache_write)),
      input_batch: null,
      output_batch: null,
      input_audio: nonZero(perMillion(price.input_audio)),
      output_audio: null,
      reasoning: nonZero(perMillion(price.internal_reasoning)),
      per_image: nonZero(num(price.image)),
      per_second: null,
      per_request: nonZero(num(price.request)),
      tiers: [],
    };

    const arch = m.architecture || {};
    const params = new Set(m.supported_parameters || []);
    const inputMods = arch.input_modalities || [];

    const capabilities = {};
    if (inputMods.includes('image')) capabilities.vision = true;
    if (inputMods.includes('audio')) capabilities.audio_input = true;
    if (inputMods.includes('file')) capabilities.pdf_input = true;
    if (params.has('tools') || params.has('tool_choice')) capabilities.function_calling = true;
    if (params.has('reasoning') || params.has('include_reasoning')) capabilities.reasoning = true;
    if (params.has('structured_outputs') || params.has('response_format')) capabilities.structured_output = true;
    if (pricing.cache_read !== null) capabilities.prompt_caching = true;

    out.push({
      id: `${provider}/${model}`,
      provider,
      model,
      display_name: stripVendorLabel(m.name),
      mode: modeOf(arch),
      context: {
        input: posInt(m.context_length ?? m.top_provider?.context_length),
        output: posInt(m.top_provider?.max_completion_tokens),
        total: null,
      },
      pricing,
      rate_limits: { rpm: null, tpm: null, rpd: null },
      capabilities,
      modalities: { input: inputMods.map(String), output: (arch.output_modalities || []).map(String) },
      released_at: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null,
      deprecated_at: null,
      docs_url: `https://openrouter.ai/${m.id}`,
      _source: meta.id,
    });
  }

  log.info(`openrouter: ${out.length} models`);
  return out;
}

function modeOf(arch) {
  const out = arch.output_modalities || [];
  if (out.includes('image')) return 'image_generation';
  if (out.includes('video')) return 'video_generation';
  if (out.includes('audio')) return 'audio_speech';
  return 'chat';
}

const nonZero = (v) => (v === null || v === 0 ? null : v);
const stripVendorLabel = (name) => (typeof name === 'string' ? name.replace(/^[^:]+:\s*/, '') : undefined);

export { fetch_ as fetch };
