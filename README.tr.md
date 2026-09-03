<div align="center">

# 💸 LLM Pricing Deposu

**Her LLM'in fiyatı, bağlam penceresi ve rate limit'i — tek JSON dosyasında, günlük güncellenen, her değişimin kaydıyla.**

<!-- AUTOGEN:stats:START -->
![model](https://img.shields.io/badge/model-3263-2f81f7) ![sağlayıcı](https://img.shields.io/badge/sa%C4%9Flay%C4%B1c%C4%B1-80-8957e5) ![güncelleme](https://img.shields.io/badge/g%C3%BCncelleme-2026--09--03-3fb950) ![kaynak](https://img.shields.io/badge/kaynak-1-db6d28) [![daily update](https://github.com/apideposu/llm-pricing-deposu/actions/workflows/update.yml/badge.svg)](https://github.com/apideposu/llm-pricing-deposu/actions/workflows/update.yml)
<!-- AUTOGEN:stats:END -->

[**🔎 Karşılaştır**](https://apideposu.github.io/llm-pricing-deposu/) · [**📦 JSON'u al**](#-veriyi-kullan) · [**📈 Fiyat değişim kaydı**](CHANGELOG.md) · [**🇬🇧 English**](README.md)

</div>

---

Model fiyatları sürekli değişiyor, on ayrı pazarlama sayfasında duruyor ve on ayrı biçimde yayınlanıyor — token başına, milyon başına, karakter başına, görsel başına. Hiçbir elle tutulan tablo bu tempoya dayanmıyor.

Bu repo o dağınıklığı, bir GitHub Action'ın her gün yenilediği tek ve normalize edilmiş bir veri setine çeviriyor.

|  | |
| --- | --- |
| **Normalize** | Tek şema, tek birim. Her fiyat **1M token başına USD**. Böylece `$2.50` ile `0.0000025` bir daha aynı kolonda karşılaşmıyor. Önbellek okuma/yazma, batch kademeleri ve uzun bağlam ek ücretleri ayrı alanlarda. |
| **Çapraz doğrulanmış** | Üç bağımsız kaynak birleştiriliyor. Kaynaklar çeliştiğinde çelişki ortalama alınarak gizlenmiyor, `conflicts` dizisinde **yayınlanıyor** — hangi sayıya güvenmeyeceğini görebiliyorsun. |
| **Tarihli** | Her fiyat hareketi bir [olay kaydına](data/history/prices.jsonl) ekleniyor. Kimsede olmayan kısım bu: *"bu model ne zaman ucuzladı, ne kadar?"* sorusunun cevabı burada. |
| **Bağımlılıksız** | Düz Node, sıfır npm bağımlılığı, MIT. İstersen `models.json`'ı kendi reponun içine kopyalayıp ağa hiç çıkmazsın. |

---

## ⚡ Veriyi kullan

```bash
# Her şey (tüm modlar, tüm sağlayıcılar)
curl -s https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/models.json

# Sadece sohbet modelleri — daha küçük, muhtemelen istediğin bu
curl -s https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/chat.json

# Son değişiklikler
curl -s https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/history/prices.jsonl | tail -20
```

| Dosya | İçeriği |
| --- | --- |
| [`data/models.json`](data/models.json) | Tam veri seti — her model, her mod, ayrıca sayımlar ve kaynak sağlığı için `meta`. |
| [`data/models.min.json`](data/models.min.json) | Aynısının sıkıştırılmışı. |
| [`data/chat.json`](data/chat.json) | Yalnızca sohbet/tamamlama modelleri. |
| [`data/providers.json`](data/providers.json) | Fiyat sayfası linkleri ve sağlayıcı başına sayımlarla kayıt defteri. |
| [`data/history/prices.jsonl`](data/history/prices.jsonl) | Yalnızca ekleme yapılan olay kaydı. Satır başına bir JSON. |
| [`schema/model.schema.json`](schema/model.schema.json) | Model kaydının JSON Schema'sı. Tüm alanlar orada belgeli. |

<details>
<summary><b>Tek bir kayıt neye benziyor</b></summary>

```jsonc
{
  "id": "anthropic/claude-sonnet-4-20250514",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "family": "claude-sonnet-4",
  "mode": "chat",
  "context": { "input": 1000000, "output": 64000 },
  "pricing": {                        // 1M token başına USD
    "input": 3,
    "output": 15,
    "cache_read": 0.3,
    "cache_write": 3.75,
    "tiers": [                        // uzun bağlam ek ücreti
      { "above_tokens": 200000, "input": 6, "output": 22.5 }
    ]
  },
  "rate_limits": { "rpm": null, "tpm": null },
  "capabilities": { "vision": true, "function_calling": true, "reasoning": true },
  "sources": ["litellm", "modelsdev"],
  "conflicts": []                     // kaynaklar çelişseydi burada listelenirdi
}
```

</details>

<details>
<summary><b>Bir isteğin maliyetini hesaplamak</b></summary>

```js
const { models } = await fetch(
  'https://cdn.jsdelivr.net/gh/apideposu/llm-pricing-deposu@main/data/chat.json'
).then(r => r.json());

const byId = Object.fromEntries(models.map(m => [m.id, m]));

function estimate(id, { input = 0, output = 0, cached = 0 }) {
  const m = byId[id];
  if (!m) throw new Error(`bilinmeyen model: ${id}`);

  // Sağlayıcının uzun bağlam ek ücreti varsa ve eşiği geçtiysek.
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

`pricing.per_image`, `pricing.per_second` ve `pricing.per_request` mutlak USD değerleridir, **milyon başına değil** — hangisinin ne olduğunu alan adları ve [şema](schema/model.schema.json) söylüyor.

</details>

---

## 🏆 Amiral gemisi modeller

<!-- AUTOGEN:featured:START -->
| Sağlayıcı | Model | Girdi | Çıktı | Önbellek | Bağlam | Maks. çıktı | Notlar |
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

<sub>🧠 akıl yürütme · 👁 görsel · 🔧 araç kullanımı · 💾 prompt önbelleği · 🔊 ses. Fiyatlar 1M token başına USD. Model ailesi başına tek satır — tarihli sürümler birleştirildi.</sub>

### En ucuz yetenekli modeller

<sub>3:1 girdi:çıktı oranında harmanlanmış $/1M, ≥32K bağlamlı modellerle sınırlı. Harman bir basitleştirmedir — karar vermeden önce iki kolona da bak.</sub>

<!-- AUTOGEN:cheapest:START -->
| # | Model | Harman | Girdi | Çıktı | Bağlam |
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

### En uzun bağlam pencereleri

<!-- AUTOGEN:context:START -->
| # | Model | Bağlam | Girdi | Çıktı |
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

## 📈 Son fiyat hareketleri

<!-- AUTOGEN:recent:START -->
_Son 30 günde fiyat hareketi kaydedilmedi._
<!-- AUTOGEN:recent:END -->

Tam geçmiş [CHANGELOG.md](CHANGELOG.md) içinde · ham olaylar [`data/history/prices.jsonl`](data/history/prices.jsonl) dosyasında.

Tek bir modeli zaman içinde izlemek:

```bash
grep '"anthropic/claude-sonnet-4-20250514"' data/history/prices.jsonl | jq -c '{date, field, from, to, pct}'
```

---

## 🌐 Kapsam

<!-- AUTOGEN:providers:START -->
| Kategori | Sağlayıcı | Model |
| --- | --- | ---: |
| **Model üreticisi** | [OpenAI](https://openai.com/api/pricing/) <sup>`openai`</sup> | 215 |
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
| **Bulut** | [AWS Bedrock](https://aws.amazon.com/bedrock/pricing/) <sup>`bedrock`</sup> | 446 |
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
| **Inference** | [Fireworks AI](https://fireworks.ai/pricing) <sup>`fireworks_ai`</sup> | 323 |
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
| **Özel amaçlı** | [fal.ai](https://fal.ai/pricing) <sup>`fal_ai`</sup> | 71 |
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
| **Yerel** | Ollama (local) <sup>`ollama`</sup> | 29 |
<!-- AUTOGEN:providers:END -->

---

## 🔧 Nasıl çalışıyor

```
kaynaklar          birleştirme                fark                  çıktılar
─────────          ───────────                ────                  ────────
litellm    ─┐   tek şemaya normalize      dünkü anlık          data/models.json
openrouter ─┼─▶ öncelik + alan sahipliği ─▶ görüntüyle    ──▶   data/chat.json
models.dev ─┘   çelişkileri kaydet          karşılaştır         data/history/*.jsonl
                overrides/manual.json uygula                    CHANGELOG.md
                                                                README tabloları
```

Kendin çalıştır:

```bash
git clone https://github.com/apideposu/llm-pricing-deposu
cd llm-pricing-deposu
npm run update      # çek, birleştir, yaz
npm run validate    # şema + tutarlılık kontrolleri
npm run serve       # siteyi derle ve :8080'de sun
```

Kurulacak bağımlılık yok — düz Node 20+.

**Bilinmeye değer tasarım kararları:**

- **Kaynaklar yumuşak düşer.** Erişilemeyen bir kaynak uyarı basar, çalışma diğerleriyle devam eder. Yalnızca *tüm* kaynaklar düşerse çalışma iptal olur.
- **Ani daralma çalışmayı durdurur.** Normalde binlerce model dönen bir kaynak birden bir avuç dönüyorsa bu gerçek bir katalog değişimi değil, yukarıda şema değişmiştir. Pipeline veri setini silip changelog'u sahte kayıplarla doldurmaktansa yayınlamayı reddeder.
- **"Değişti" için %0.5 eşiği.** Yukarıdaki kaynakların yuvarlaması çalışmalar arasında oynuyor; eşik olmasa changelog gürültüyle dolardı.
- **İnsan robotu yener.** [`overrides/manual.json`](overrides/manual.json) içindeki her şey tüm otomatik kaynakları ezer ve o modelin çelişkilerini temizler. Kayıtlar `_verified` tarihi taşır ve `npm run validate` 90 günü geçen kayıtlar için uyarır — böylece düzeltme dosyası sessizce, tam da bu reponun çözmek için var olduğu soruna dönüşemez.

---

## ✅ Doğruluk

Bu veri toplama, en iyi çaba ilkesiyle üretiliyor ve **zaman zaman yanlış olacak**. Sağlayıcılar fiyatları haber vermeden değiştiriyor, bölgeye ve seviyeye özel tarifeler uyguluyor ve hiçbir toplayıcının tam modelleyemediği kalemler faturalandırıyor. Kurumsal anlaşmalar, taahhütlü harcama indirimleri ve ücretsiz kotalar tamamen kapsam dışı.

**Satın alma kararı vermeden önce sağlayıcının kendi fiyat sayfasından doğrula.** Her kayıt tam bu iş için bir `pricing_url` taşıyor.

Yanlış bir sayı mı buldun? En değerli katkı bu:

1. [Fiyat düzeltme issue'su aç](https://github.com/apideposu/llm-pricing-deposu/issues/new?template=price-correction.yml) — bir dakika sürüyor, sağlayıcının sayfasına bir link yeterli.
2. Ya da [`overrides/manual.json`](overrides/manual.json) dosyasına `_source` ve `_verified` doldurulmuş bir PR gönder.

Kaynakların çeliştiği modellere bakmakta fayda var:

```bash
jq '[.models[] | select(.conflicts | length > 0)] | .[0:5]' data/models.json
```

---

## 🤝 Katkı

En yüksek getirili katkı yeni bir kaynak eklemek. `scripts/sources/` altında `meta` ve `fetch()` dışa aktaran bir modül yaz, kayıtları ortak biçimde döndür, sonra `scripts/update.js` içindeki listeye ekle. [`scripts/sources/modelsdev.js`](scripts/sources/modelsdev.js) en kısası, oradan başla. Ayrıntılar [CONTRIBUTING.md](CONTRIBUTING.md) içinde.

## 🙏 Kaynaklar

Bu veriyi açıkta tutan insanların emeği üzerine kuruldu:

- [**LiteLLM**](https://github.com/BerriAI/litellm) — `model_prices_and_context_window.json`, mevcut en geniş kapsam (MIT)
- [**models.dev**](https://models.dev) — özenle derlenmiş çıkış tarihleri, bilgi kesim tarihleri ve açık ağırlık bilgisi (MIT)
- [**OpenRouter**](https://openrouter.ai/docs/api-reference/list-available-models) — canlı gateway kataloğu

Bu veri işine yaradıysa yukarıdaki projelere de yıldız ver.

## 📄 Lisans

Kod ve veri: [MIT](LICENSE). Hiçbir model sağlayıcısıyla bağlantılı, onlar tarafından onaylanmış veya desteklenmiş değildir.

<div align="center">
<sub><a href="https://github.com/apideposu/public-api-deposu">API Deposu</a> ailesinin bir parçası — <a href="https://github.com/apideposu/public-api-deposu">public API kataloğu</a></sub>
</div>
