<div align="center">

# 💸 LLM Pricing Deposu

**Every LLM's price, context window and rate limit — in one JSON file, updated daily, with a full history of every change.**

<!-- AUTOGEN:stats:START -->
![models](https://img.shields.io/badge/models-3263-2f81f7) ![providers](https://img.shields.io/badge/providers-80-8957e5) ![updated](https://img.shields.io/badge/updated-2026--09--03-3fb950) ![sources](https://img.shields.io/badge/sources-1-db6d28) [![daily update](https://github.com/apideposu/llm-pricing-deposu/actions/workflows/update.yml/badge.svg)](https://github.com/apideposu/llm-pricing-deposu/actions/workflows/update.yml)
<!-- AUTOGEN:stats:END -->

[**🔎 Browse & compare**](https://apideposu.github.io/llm-pricing-deposu/) · [**📦 Get the JSON**](#-use-the-data) · [**📈 Price change log**](CHANGELOG.md) · [**🇹🇷 Türkçe**](README.tr.md)

</div>

---

Model pricing changes constantly, lives on a dozen different marketing pages, and is published in a dozen different shapes — per token, per million, per character, per image. Nobody's spreadsheet survives contact with it.

This repo turns that into one normalized, machine-readable dataset that a GitHub Action refreshes every day.

|  | |
| --- | --- |
| **Normalized** | One schema, one unit. Every price is **USD per 1M tokens**, so `$2.50` and `0.0000025` never sit in the same column again. Cache reads, cache writes, batch tiers and long-context surcharges each get their own field. |
| **Cross-verified** | Three independent sources are merged. Where they disagree, the disagreement is *published* in a `conflicts` array instead of being silently averaged away — so you can see exactly which number to distrust. |
| **Historical** | Every price move is appended to an [event log](data/history/prices.jsonl). This is the part nobody else has: you can answer *"when did this get cheaper, and by how much?"* |
| **Dependency-free** | Plain Node, zero npm dependencies, MIT. Vendor `models.json` into your own repo if you'd rather not hit the network. |

---

## ⚡ Use the data

```bash
# Everything (all modes, all providers)
curl -s https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/models.json

# Chat models only — smaller, and what you probably want
curl -s https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/chat.json

# What changed lately
curl -s https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/history/prices.jsonl | tail -20
```

| File | What's in it |
| --- | --- |
| [`data/models.json`](data/models.json) | Full dataset — every model, every mode, plus `meta` with counts and source health. |
| [`data/models.min.json`](data/models.min.json) | Same, minified. |
| [`data/chat.json`](data/chat.json) | Chat/completion models only. |
| [`data/providers.json`](data/providers.json) | Provider registry with pricing-page links and per-provider counts. |
| [`data/history/prices.jsonl`](data/history/prices.jsonl) | Append-only event log. One JSON object per line. |
| [`schema/model.schema.json`](schema/model.schema.json) | JSON Schema for a model record. Every field is documented there. |

<details>
<summary><b>What one record looks like</b></summary>

```jsonc
{
  "id": "anthropic/claude-sonnet-4-20250514",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "family": "claude-sonnet-4",
  "mode": "chat",
  "context": { "input": 1000000, "output": 64000 },
  "pricing": {                        // USD per 1M tokens
    "input": 3,
    "output": 15,
    "cache_read": 0.3,
    "cache_write": 3.75,
    "tiers": [                        // long-context surcharge
      { "above_tokens": 200000, "input": 6, "output": 22.5 }
    ]
  },
  "rate_limits": { "rpm": null, "tpm": null },
  "capabilities": { "vision": true, "function_calling": true, "reasoning": true },
  "sources": ["litellm", "modelsdev"],
  "conflicts": []                     // sources disagreed here → they'd be listed
}
```

</details>

<details>
<summary><b>Estimating a request's cost</b></summary>

```js
const { models } = await fetch(
  'https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/chat.json'
).then(r => r.json());

const byId = Object.fromEntries(models.map(m => [m.id, m]));

function estimate(id, { input = 0, output = 0, cached = 0 }) {
  const m = byId[id];
  if (!m) throw new Error(`unknown model: ${id}`);

  // Long-context surcharge, if the provider has one and we crossed the line.
  const tier = [...(m.pricing.tiers ?? [])]
    .sort((a, b) => b.above_tokens - a.above_tokens)
    .find(t => input + cached > t.above_tokens);

  const inRate    = tier?.input      ?? m.pricing.input;
  const outRate   = tier?.output     ?? m.pricing.output;
  const cacheRate = tier?.cache_read ?? m.pricing.cache_read ?? inRate;

  return (input * inRate + output * outRate + cached * cacheRate) / 1e6;
}

estimate('anthropic/claude-sonnet-4-20250514', { input: 12_000, output: 800 });
```

`pricing.per_image`, `pricing.per_second` and `pricing.per_request` are absolute USD, **not** per million — the field names say which is which, and so does the [schema](schema/model.schema.json).

</details>

---

## 🏆 Flagship models

<!-- AUTOGEN:featured:START -->
| Provider | Model | Input | Output | Cache read | Context | Max out | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| **OpenAI** | `gpt-5.4-pro` | $30 | $180 | $3 | 1.05M | 128K | 🧠 👁 🔧 💾 |
|  | `gpt-5.5-pro` | $30 | $180 | $3 | 1.05M | 128K | 🧠 👁 🔧 💾 |
|  | `gpt-5.5` | $5 | $30 | $0.5 | 1.05M | 128K | 🧠 👁 🔧 💾 |
|  | `gpt-5.4` | $2.5 | $15 | $0.25 | 1.05M | 128K | 🧠 👁 🔧 💾 |
|  | `gpt-4.1` | $2 | $8 | $0.5 | 1.05M | 33K | 👁 🔧 💾 |
| **Anthropic** | `claude-fable-5` | $10 | $50 | $1 | 1M | 128K | 🧠 👁 🔧 💾 |
|  | `claude-fable-5-1` | $10 | $50 | $0.25 | 1M | 128K | 🧠 👁 🔧 💾 |
|  | `claude-mythos-5` | $10 | $50 | $1 | 1M | 128K | 🧠 👁 🔧 💾 |
|  | `claude-opus-4-6` | $5 | $25 | $0.5 | 1M | 128K | 🧠 👁 🔧 💾 |
|  | `claude-opus-4-7` | $5 | $25 | $0.5 | 1M | 128K | 🧠 👁 🔧 💾 |
| **Google Gemini** | `gemini-2.5-pro` | $1.25 | $10 | $0.125 | 1.05M | 66K | 🧠 👁 🔧 💾 🔊 |
|  | `gemini-pro-latest` | $1.25 | $10 | $0.125 | 1.05M | 66K | 🧠 👁 🔧 💾 🔊 |
|  | `gemini-3.5-flash` | $1.5 | $9 | $0.15 | 1.05M | 66K | 🧠 👁 🔧 💾 🔊 |
|  | `gemini-3.6-flash` | $0.75 | $3.75 | $0.075 | 1.05M | 66K | 🧠 👁 🔧 💾 🔊 |
|  | `gemini-3.7-flash` | $0.75 | $3.75 | $0.075 | 1.05M | 66K | 🧠 👁 🔧 💾 🔊 |
| **xAI** | `grok-4.20` | $1.25 | $2.5 | $0.2 | 1M | 1M | 🧠 👁 🔧 💾 |
|  | `grok-4.20-multi-agent-latest` | $1.25 | $2.5 | $0.2 | 1M | 1M | 🧠 👁 💾 |
|  | `grok-4.3` | $1.25 | $2.5 | $0.2 | 1M | 1M | 🧠 👁 🔧 💾 |
|  | `grok-4.5` | $2 | $6 | $0.3 | 500K | 500K | 🧠 👁 🔧 💾 |
|  | `grok-4.6` | $2 | $6 | $0.5 | 500K | 500K | 🧠 👁 🔧 💾 |
| **DeepSeek** | `deepseek-v4-pro` | $1.32 | $3.96 | $0.044 | 1M | 393K | 🧠 🔧 💾 |
|  | `deepseek-v4-flash` | $0.44 | $1.32 | $0.014 | 1M | 393K | 🧠 🔧 💾 |
|  | `deepseek-v3.2` | $0.28 | $0.4 | $0.028 | 164K | 164K | 🧠 🔧 💾 |
|  | `deepseek-chat` | $0.28 | $0.42 | $0.028 | 131K | 8K | 🔧 💾 |
|  | `deepseek-reasoner` | $0.28 | $0.42 | $0.028 | 131K | 66K | 🧠 💾 |
| **Mistral AI** | `mistral-medium-latest` | $1.5 | $7.5 | $0.15 | 262K | 262K | 🧠 👁 🔧 |
|  | `mistral-medium-3` | $1.5 | $7.5 | — | 262K | 262K | 🧠 👁 🔧 |
|  | `mistral-medium-3-5` | $1.5 | $7.5 | $0.15 | 262K | 262K | 🧠 👁 🔧 |
|  | `mistral-medium-3.5` | $1.5 | $7.5 | $0.15 | 262K | 262K | 🧠 👁 🔧 |
|  | `mistral-vibe-cli-latest` | $1.5 | $7.5 | $0.15 | 262K | 262K | 🧠 👁 🔧 |
| **Qwen** | `qwen-coder` | $0.3 | $1.5 | — | 1M | 16K | 🧠 🔧 |
|  | `qwen-turbo-latest` | $0.05 | $0.2 | — | 1M | 16K | 🧠 🔧 |
|  | `qwen3.7-max` | $2.5 | $7.5 | $0.5 | 992K | 66K | 🧠 🔧 💾 |
|  | `qwen3.8-max` | $2 | $6 | $0.25 | 992K | 131K | 🧠 👁 🔧 💾 |
|  | `qwen3-next-80b-a3b-instruct` | $0.15 | $1.2 | — | 262K | 66K | 🔧 |
| **Moonshot AI (Kimi)** | `kimi-k3` | $3 | $15 | $0.3 | 1.05M | 1.05M | 🧠 👁 🔧 |
|  | `kimi-k2.6` | $0.95 | $4 | $0.16 | 262K | 262K | 🧠 👁 🔧 |
|  | `kimi-k2.7-code` | $0.95 | $4 | $0.19 | 262K | 262K | 🧠 👁 🔧 💾 |
|  | `kimi-k2.5` | $0.6 | $3 | $0.1 | 262K | 262K | 🧠 👁 🔧 |
|  | `moonshot-v1-128k` | $2 | $5 | — | 131K | 131K | 🔧 |
| **Z.ai (GLM)** | `glm-5.3-flash` | $0.15 | $0.5 | $0.03 | 1.05M | 128K | 🧠 👁 🔧 💾 |
|  | `glm-5.2` | $1.4 | $4.4 | $0.26 | 1M | 128K | 🧠 🔧 💾 |
|  | `glm-5.3` | $1.4 | $4.4 | $0.26 | 1M | 128K | 🧠 🔧 💾 |
|  | `glm-5-code` | $1.2 | $5 | $0.3 | 200K | 128K | 🧠 🔧 💾 |
|  | `glm-5.1` | $1.4 | $4.4 | $0.26 | 200K | 128K | 🧠 🔧 💾 |
| **Groq** | `qwen/qwen3.6-27b` | $0.6 | $3 | — | 131K | 16K | 🧠 👁 🔧 |
|  | `openai/gpt-oss-120b` | $0.15 | $0.6 | $0.075 | 131K | 66K | 🧠 🔧 |
|  | `openai/gpt-oss-20b` | $0.075 | $0.3 | $0.037 | 131K | 66K | 🧠 🔧 |
|  | `openai/gpt-oss-safeguard-20b` | $0.075 | $0.3 | $0.037 | 131K | 66K | 🧠 🔧 |
|  | `qwen/qwen3.8-27b` | $0.8 | $4 | — | 131K | 16K | 🧠 👁 🔧 |
<!-- AUTOGEN:featured:END -->

<sub>🧠 reasoning · 👁 vision · 🔧 tool use · 💾 prompt caching · 🔊 audio. Prices are USD per 1M tokens. One row per model family — dated snapshots are collapsed.</sub>

### Cheapest capable models

<sub>Blended $/1M at a 3:1 input:output ratio, limited to models with a ≥32K context. A blend is a simplification — check both columns before committing.</sub>

<!-- AUTOGEN:cheapest:START -->
| # | Model | Blended | Input | Output | Context |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | `nebius/Qwen/Qwen2.5-Coder-7B` | **$0.015** | $0.01 | $0.03 | 33K |
| 2 | `lambda_ai/llama3.2-11b-vision-instruct` | **$0.018** | $0.015 | $0.025 | 131K |
| 3 | `lambda_ai/llama3.2-3b-instruct` | **$0.018** | $0.015 | $0.025 | 131K |
| 4 | `deepinfra/meta-llama/Llama-3.2-3B-Instruct` | **$0.02** | $0.02 | $0.02 | 131K |
| 5 | `novita/meta-llama/llama-3.2-1b-instruct` | **$0.02** | $0.02 | $0.02 | 131K |
| 6 | `deepinfra/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` | **$0.025** | $0.02 | $0.04 | 131K |
| 7 | `darkbloom/gpt-oss-20b` | **$0.028** | $0.015 | $0.07 | 131K |
| 8 | `lambda_ai/hermes3-8b` | **$0.029** | $0.025 | $0.04 | 131K |
| 9 | `lambda_ai/lfm-7b` | **$0.029** | $0.025 | $0.04 | 131K |
| 10 | `lambda_ai/llama3.1-8b-instruct` | **$0.029** | $0.025 | $0.04 | 131K |
| 11 | `nebius/meta-llama/Llama-Guard-3-8B` | **$0.03** | $0.02 | $0.06 | 128K |
| 12 | `nebius/meta-llama/Meta-Llama-3.1-8B-Instruct` | **$0.03** | $0.02 | $0.06 | 128K |
<!-- AUTOGEN:cheapest:END -->

### Longest context windows

<!-- AUTOGEN:context:START -->
| # | Model | Context | Input | Output |
| ---: | --- | ---: | ---: | ---: |
| 1 | `oci/meta.llama-4-scout-17b-16e-instruct` | **10.49M** | $0.72 | $0.72 |
| 2 | `vertex_ai/meta/llama-4-scout-17b-128e-instruct-maas` | **10M** | $0.25 | $0.7 |
| 3 | `snowflake/openai-gpt-5-nano` | **5M** | $0.15 | $0.6 |
| 4 | `azure_ai/gpt-5.4` | **1.05M** | $2.5 | $15 |
| 5 | `azure_ai/gpt-5.4-pro` | **1.05M** | $30 | $180 |
| 6 | `azure_ai/gpt-5.5` | **1.05M** | $5 | $30 |
| 7 | `azure/gpt-5.5-pro` | **1.05M** | $30 | $180 |
| 8 | `bedrock/openai.gpt-5.6-luna` | **1.05M** | $0.22 | $1.32 |
| 9 | `bedrock/openai.gpt-5.6-sol` | **1.05M** | $5.5 | $33 |
| 10 | `bedrock/openai.gpt-5.6-terra` | **1.05M** | $2.2 | $13.2 |
| 11 | `openai/daybreak-blue-latest` | **1.05M** | $4 | $20 |
| 12 | `azure_ai/FW-GLM-5.2` | **1.05M** | $1.54 | $4.84 |
<!-- AUTOGEN:context:END -->

---

## 📈 Recent price moves

<!-- AUTOGEN:recent:START -->
_No price movements recorded in the last 30 days._
<!-- AUTOGEN:recent:END -->

Full history in [CHANGELOG.md](CHANGELOG.md) · raw events in [`data/history/prices.jsonl`](data/history/prices.jsonl).

Track one model over time:

```bash
grep '"anthropic/claude-sonnet-4-20250514"' data/history/prices.jsonl | jq -c '{date, field, from, to, pct}'
```

---

## 🌐 Coverage

<!-- AUTOGEN:providers:START -->
| Tier | Provider | Models |
| --- | --- | ---: |
| **Model lab** | [OpenAI](https://openai.com/api/pricing/) <sup>`openai`</sup> | 215 |
|  | [Google Gemini](https://ai.google.dev/gemini-api/docs/pricing) <sup>`gemini`</sup> | 82 |
|  | [Mistral AI](https://mistral.ai/pricing#api-pricing) <sup>`mistral`</sup> | 81 |
|  | [xAI](https://docs.x.ai/docs/models) <sup>`xai`</sup> | 51 |
|  | [Qwen](https://www.alibabacloud.com/help/en/model-studio/models) <sup>`qwen_ai_platform`</sup> | 41 |
|  | [Anthropic](https://www.anthropic.com/pricing#api) <sup>`anthropic`</sup> | 27 |
|  | [Moonshot AI (Kimi)](https://platform.moonshot.ai/docs/pricing/chat) <sup>`moonshot`</sup> | 24 |
|  | [Cohere](https://cohere.com/pricing) <sup>`cohere`</sup> | 22 |
|  | [Z.ai (GLM)](https://docs.z.ai/guides/overview/pricing) <sup>`zai`</sup> | 16 |
|  | [AI21 Labs](https://www.ai21.com/pricing/) <sup>`ai21`</sup> | 12 |
|  | Volcengine (Doubao) <sup>`volcengine`</sup> | 12 |
|  | [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing) <sup>`deepseek`</sup> | 9 |
|  | Public AI <sup>`publicai`</sup> | 9 |
|  | GigaChat <sup>`gigachat`</sup> | 7 |
|  | [Meta Llama API](https://llama.developer.meta.com/) <sup>`meta_llama`</sup> | 7 |
|  | [MiniMax](https://www.minimax.io/price) <sup>`minimax`</sup> | 6 |
|  | Cognition <sup>`cognition`</sup> | 3 |
|  | Tencent Hunyuan <sup>`tencent`</sup> | 3 |
|  | Inception Labs <sup>`inception`</sup> | 2 |
|  | Morph <sup>`morph`</sup> | 2 |
|  | Sarvam AI <sup>`sarvam`</sup> | 1 |
| **Cloud** | [AWS Bedrock](https://aws.amazon.com/bedrock/pricing/) <sup>`bedrock`</sup> | 446 |
|  | [Azure OpenAI](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/) <sup>`azure`</sup> | 198 |
|  | [Google Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/pricing) <sup>`vertex_ai`</sup> | 159 |
|  | [Azure AI Foundry](https://azure.microsoft.com/en-us/pricing/details/ai-foundry/) <sup>`azure_ai`</sup> | 109 |
|  | [Databricks](https://www.databricks.com/product/pricing/foundation-model-serving) <sup>`databricks`</sup> | 52 |
|  | [Oracle OCI GenAI](https://www.oracle.com/artificial-intelligence/generative-ai/pricing/) <sup>`oci`</sup> | 44 |
|  | [Snowflake Cortex](https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf) <sup>`snowflake`</sup> | 37 |
|  | W&B Inference <sup>`wandb`</sup> | 35 |
|  | [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) <sup>`cloudflare`</sup> | 30 |
|  | [Nebius AI Studio](https://nebius.com/prices-ai-studio) <sup>`nebius`</sup> | 30 |
|  | [IBM watsonx](https://www.ibm.com/products/watsonx-ai/pricing) <sup>`watsonx`</sup> | 29 |
|  | Lambda <sup>`lambda_ai`</sup> | 20 |
|  | GMI Cloud <sup>`gmi`</sup> | 17 |
|  | [Scaleway](https://www.scaleway.com/en/pricing/model-as-a-service/) <sup>`scaleway`</sup> | 17 |
|  | [OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/prices/) <sup>`ovhcloud`</sup> | 15 |
|  | Nscale <sup>`nscale`</sup> | 14 |
|  | DigitalOcean Gradient AI <sup>`gradient_ai`</sup> | 13 |
|  | LibertAI <sup>`libertai`</sup> | 12 |
|  | Baseten <sup>`baseten`</sup> | 11 |
|  | Crusoe <sup>`crusoe`</sup> | 7 |
|  | Heroku Managed Inference <sup>`heroku`</sup> | 4 |
|  | NVIDIA NIM <sup>`nvidia_nim`</sup> | 3 |
| **Inference host** | [Fireworks AI](https://fireworks.ai/pricing) <sup>`fireworks_ai`</sup> | 323 |
|  | [DeepInfra](https://deepinfra.com/pricing) <sup>`deepinfra`</sup> | 135 |
|  | [Novita AI](https://novita.ai/pricing) <sup>`novita`</sup> | 135 |
|  | [Together AI](https://www.together.ai/pricing) <sup>`together_ai`</sup> | 69 |
|  | [Perplexity](https://docs.perplexity.ai/getting-started/pricing) <sup>`perplexity`</sup> | 46 |
|  | [Replicate](https://replicate.com/pricing) <sup>`replicate`</sup> | 40 |
|  | [SambaNova](https://cloud.sambanova.ai/plans/pricing) <sup>`sambanova`</sup> | 19 |
|  | [Groq](https://groq.com/pricing/) <sup>`groq`</sup> | 17 |
|  | [Hyperbolic](https://hyperbolic.xyz/pricing) <sup>`hyperbolic`</sup> | 16 |
|  | LlamaGate <sup>`llamagate`</sup> | 16 |
|  | Anyscale <sup>`anyscale`</sup> | 12 |
|  | TensorMesh <sup>`tensormesh`</sup> | 10 |
|  | [Cerebras](https://www.cerebras.ai/pricing) <sup>`cerebras`</sup> | 8 |
|  | Lemonade <sup>`lemonade`</sup> | 5 |
|  | FriendliAI <sup>`friendliai`</sup> | 4 |
|  | Featherless AI <sup>`featherless_ai`</sup> | 2 |
|  | NLP Cloud <sup>`nlp_cloud`</sup> | 2 |
| **Gateway** | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/pricing) <sup>`vercel_ai_gateway`</sup> | 101 |
|  | [OpenRouter](https://openrouter.ai/models) <sup>`openrouter`</sup> | 100 |
|  | GitHub Copilot <sup>`github_copilot`</sup> | 29 |
|  | AI/ML API <sup>`aiml`</sup> | 13 |
|  | v0 <sup>`v0`</sup> | 3 |
| **Specialist** | [fal.ai](https://fal.ai/pricing) <sup>`fal_ai`</sup> | 71 |
|  | [Deepgram](https://deepgram.com/pricing) <sup>`deepgram`</sup> | 36 |
|  | [Voyage AI](https://docs.voyageai.com/docs/pricing) <sup>`voyage`</sup> | 25 |
|  | [Stability AI](https://platform.stability.ai/pricing) <sup>`stability`</sup> | 23 |
|  | Runway <sup>`runwayml`</sup> | 12 |
|  | Black Forest Labs (FLUX) <sup>`black_forest_labs`</sup> | 8 |
|  | Pinstripes <sup>`pinstripes`</sup> | 6 |
|  | [ElevenLabs](https://elevenlabs.io/pricing) <sup>`elevenlabs`</sup> | 3 |
|  | [AssemblyAI](https://www.assemblyai.com/pricing) <sup>`assemblyai`</sup> | 2 |
|  | Darkbloom <sup>`darkbloom`</sup> | 2 |
|  | Recraft <sup>`recraft`</sup> | 2 |
|  | SCX AI <sup>`scx-ai`</sup> | 2 |
|  | Soniox <sup>`soniox`</sup> | 2 |
|  | Jina AI <sup>`jina_ai`</sup> | 1 |
| **Local** | Ollama (local) <sup>`ollama`</sup> | 29 |
<!-- AUTOGEN:providers:END -->

---

## 🔧 How it works

```
sources/            merge                    diff                  outputs
─────────           ─────                    ────                  ───────
litellm    ─┐   normalize to one schema   compare against      data/models.json
openrouter ─┼─▶ precedence + field owners ─▶ yesterday's ──▶    data/chat.json
models.dev ─┘   record disagreements        snapshot            data/history/*.jsonl
                apply overrides/manual.json                     CHANGELOG.md
                                                                README tables
```

Run it yourself:

```bash
git clone https://github.com/apideposu/llm-pricing-deposu
cd llm-pricing-deposu
npm run update      # fetch, merge, write
npm run validate    # schema + sanity checks
npm run serve       # build the site and serve it on :8080
```

No dependencies to install — it's plain Node 20+.

**Design decisions worth knowing about:**

- **Sources fail soft.** One unreachable feed logs a warning; the run continues with the rest. Only *all* sources failing aborts the run.
- **Sudden shrink aborts the run.** If a source that normally returns thousands of models returns a handful, that's an upstream schema change, not a real catalogue change. The pipeline refuses to publish rather than wipe the dataset and emit a changelog full of false removals.
- **A 0.5% floor on "changed".** Upstream rounding drifts between runs; without a floor the changelog fills with noise.
- **Humans beat robots.** Anything in [`overrides/manual.json`](overrides/manual.json) wins over every automated source, and clears that model's conflicts. Entries carry a `_verified` date, and `npm run validate` warns when one goes stale past 90 days — so the corrections file can't quietly rot into the exact problem this repo exists to solve.

---

## ✅ Accuracy

This data is aggregated, best-effort, and **will sometimes be wrong**. Providers change prices without warning, run region- and tier-specific rates, and bill dimensions that no aggregator models perfectly. Enterprise agreements, committed-spend discounts and free tiers are out of scope entirely.

**Confirm against the provider's own pricing page before you make a purchasing decision.** Every record carries a `pricing_url` for exactly that.

Found a wrong number? That's the most useful contribution there is:

1. [Open a price correction issue](https://github.com/apideposu/llm-pricing-deposu/issues/new?template=price-correction.yml) — takes a minute, and a link to the provider's page is all that's needed.
2. Or send a PR against [`overrides/manual.json`](overrides/manual.json) with `_source` and `_verified` filled in.

Models where sources disagree are worth a look:

```bash
jq '[.models[] | select(.conflicts | length > 0)] | .[0:5]' data/models.json
```

---

## 🤝 Contributing

Adding a source is the highest-leverage contribution. Write a module in `scripts/sources/` that exports `meta` and `fetch()`, returning records in the shared shape, then add it to the list in `scripts/update.js`. Have a look at [`scripts/sources/modelsdev.js`](scripts/sources/modelsdev.js) — it's the shortest one. Full notes in [CONTRIBUTING.md](CONTRIBUTING.md).

## 🙏 Sources

Built on the work of people who maintain this data in the open:

- [**LiteLLM**](https://github.com/BerriAI/litellm) — `model_prices_and_context_window.json`, the widest coverage anywhere (MIT)
- [**models.dev**](https://models.dev) — curated release dates, knowledge cutoffs and open-weights flags (MIT)
- [**OpenRouter**](https://openrouter.ai/docs/api-reference/list-available-models) — live gateway catalogue

If this data is useful to you, star the upstream projects too.

## 📄 License

Code and data: [MIT](LICENSE). Not affiliated with, endorsed by, or sponsored by any model provider.

<div align="center">
<sub>Part of <a href="https://github.com/apideposu/public-api-deposu">API Deposu</a> — <a href="https://github.com/apideposu/public-api-deposu">public API catalogue</a></sub>
</div>
