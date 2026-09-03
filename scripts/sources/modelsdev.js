import { fetchJSON, round, posInt, log, readJSON, p } from '../lib/util.js';
import { canonicalProvider, isExcludedProvider } from '../lib/providers.js';

export const meta = {
  id: 'modelsdev',
  name: 'models.dev',
  url: 'https://models.dev',
  license: 'MIT',
  // Smaller catalogue, but the only source with curated release dates, knowledge
  // cutoffs and open-weights flags — so it owns those fields regardless of precedence.
  precedence: 1,
};

const URL = 'https://models.dev/api.json';

const PROVIDER_MAP = {
  google: 'gemini',
  'google-vertex': 'vertex_ai',
  'google-vertex-anthropic': 'vertex_ai',
  'amazon-bedrock': 'bedrock',
  'azure': 'azure',
  'github-copilot': 'github_copilot',
  'llama': 'meta_llama',
  'togetherai': 'together_ai',
  'fireworks-ai': 'fireworks_ai',
  'alibaba': 'qwen_ai_platform',
  'zhipuai': 'zai',
  'zai-coding-plan': 'zai',
  'morph': 'morph',
  'upstage': 'upstage',
  'inference': 'inference',
  'venice': 'venice',
  'requesty': 'requesty',
  'vercel': 'vercel_ai_gateway',
};

export async function fetch_({ offline = false } = {}) {
  let raw;
  if (offline) {
    raw = readJSON(p('.cache', 'modelsdev.json'), null);
    if (!raw) { log.warn('modelsdev: offline mode but no cached copy'); return []; }
  } else {
    raw = await fetchJSON(URL);
    if (!raw) { log.warn('modelsdev: source unreachable, skipping'); return []; }
  }

  const out = [];
  for (const [providerId, pv] of Object.entries(raw)) {
    if (!pv || typeof pv !== 'object' || !pv.models) continue;
    const provider = PROVIDER_MAP[providerId] || canonicalProvider(providerId);
    if (!provider || isExcludedProvider(provider)) continue;

    for (const [modelId, m] of Object.entries(pv.models)) {
      if (!m || typeof m !== 'object') continue;
      const cost = m.cost || {};
      const limit = m.limit || {};

      const capabilities = {};
      if (m.attachment) capabilities.vision = true;
      if (m.reasoning) capabilities.reasoning = true;
      if (m.tool_call) capabilities.function_calling = true;
      if (cost.cache_read != null) capabilities.prompt_caching = true;

      out.push({
        id: `${provider}/${modelId}`,
        provider,
        model: modelId,
        display_name: m.name,
        mode: modeOf(m),
        context: { input: posInt(limit.context), output: posInt(limit.output), total: null },
        pricing: {
          // models.dev already publishes USD per 1M tokens.
          input: round(cost.input),
          output: round(cost.output),
          cache_read: round(cost.cache_read),
          cache_write: round(cost.cache_write),
          input_batch: null,
          output_batch: null,
          input_audio: round(cost.input_audio),
          output_audio: round(cost.output_audio),
          reasoning: round(cost.reasoning),
          per_image: null,
          per_second: null,
          per_request: null,
          tiers: [],
        },
        rate_limits: { rpm: null, tpm: null, rpd: null },
        capabilities,
        modalities: {
          input: (m.modalities?.input || []).map(String),
          output: (m.modalities?.output || []).map(String),
        },
        knowledge_cutoff: m.knowledge || null,
        released_at: m.release_date || null,
        deprecated_at: null,
        open_weights: typeof m.open_weights === 'boolean' ? m.open_weights : null,
        docs_url: pv.doc || null,
        _source: meta.id,
      });
    }
  }

  log.info(`modelsdev: ${out.length} models`);
  return out;
}

function modeOf(m) {
  const out = m.modalities?.output || [];
  if (out.includes('image') && !out.includes('text')) return 'image_generation';
  if (out.includes('audio') && !out.includes('text')) return 'audio_speech';
  if (out.includes('video')) return 'video_generation';
  return 'chat';
}

export { fetch_ as fetch };
