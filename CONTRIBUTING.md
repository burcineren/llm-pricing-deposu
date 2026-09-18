# Contributing

Three kinds of contribution, in descending order of how much they help.

## 1. Correcting a wrong price

The most valuable thing you can do. Two routes:

- [Open a price correction issue](https://github.com/apideposu/llm-pricing-deposu/issues/new?template=price-correction.yml) — a link to the provider's pricing page is enough.
- Or send the PR yourself, by editing `overrides/manual.json`:

```jsonc
{
  "models": {
    "openai/gpt-4o": {
      "pricing": { "input": 2.5, "output": 10 },
      "_source": "https://openai.com/api/pricing/",
      "_verified": "2026-09-03",
      "_note": "Upstream still had the pre-August price."
    }
  }
}
```

Overrides beat every automated source and clear that model's recorded conflicts, so
`_source` and `_verified` are not optional decoration — `npm run validate` warns once an
entry passes 90 days unverified. An override nobody re-checks becomes exactly the stale
number this repo exists to replace.

Only list the fields you're correcting. Everything else keeps coming from the sources.

To drop a model entirely — a dead endpoint, a duplicate, a test entry — add its id to
`hide.ids`. `provider/*` globs work.

## 2. Adding a data source

The highest-leverage code contribution: every source added tightens the cross-check on
every model the others already cover.

Create `scripts/sources/<name>.js` exporting `meta` and `fetch()`:

```js
export const meta = {
  id: 'yoursource',
  name: 'Human-readable name',
  url: 'https://…',
  license: 'MIT',
  precedence: 2,   // higher wins a tie; see below
};

export async function fetch({ offline = false } = {}) {
  const raw = await fetchJSON(URL);
  if (!raw) return [];          // never throw — a dead source must not fail the run
  return raw.map(toRecord);
}
```

Then add it to `SOURCES` in `scripts/update.js`.

Each record must carry `id` (`<provider>/<model>`), `provider`, `model`, `mode`,
`pricing`, `context` and `_source`. Prices are **USD per 1M tokens** — use `perMillion()`
from `scripts/lib/util.js` if your source publishes per-token. Run every provider slug
through `canonicalProvider()` so `google` and `gemini` don't become two providers.
[`scripts/sources/modelsdev.js`](scripts/sources/modelsdev.js) is the shortest example to
copy from.

**Precedence** decides who wins when sources disagree on a field, and it is about
reliability, not recency: LiteLLM sits at 3 because it has the widest coverage and the
most billing dimensions; OpenRouter at 2 because it is live but narrow; models.dev at 1
because its catalogue is small — though it still *owns* release dates, knowledge cutoffs
and open-weights flags through `FIELD_OWNERS` in `scripts/lib/merge.js`, since it curates
those better than anyone. If your source is authoritative for one particular field, add
it there rather than raising its precedence across the board.

Disagreements are never averaged. The winner goes in `pricing`, and every candidate is
published in `conflicts` so a reader can audit it.

## 3. Improving the presentation

`overrides/featured.json` controls which models reach the README's flagship table and the
site's default view — provider order, name prefixes, and the regexes that suppress
variant spellings. Editing it changes no underlying data, so it's the safe place to
experiment.

## Running it

```bash
npm test                # unit tests for merge/diff/select — fast, no network
npm run update          # fetch, merge, diff, write everything
npm run update:offline  # reuse .cache/*.json — no network
npm run validate        # schema + sanity checks
npm run site            # stage docs/data/
npm run serve           # build and serve on :8080
node scripts/update.js --dry-run   # compute and report, write nothing
```

Node 20+. No dependencies to install.

To iterate offline, save a source's raw response into `.cache/<source-id>.json` first;
`--offline` reads from there.

## House rules

- **Zero runtime dependencies.** This is a data repo people vendor into their own builds; a
  supply chain is a liability here. Node's standard library has been enough so far.
- **Never fail loudly on one bad source.** Log a warning, return `[]`, let the run continue.
  Only *all* sources failing aborts.
- **Don't invent numbers.** If no source publishes a field, it stays `null`. A null is
  information; a guess is a liability.
- **Generated files are generated.** `data/`, `CHANGELOG.md`, `docs/data/` and everything
  between the `AUTOGEN` markers in the READMEs are written by the pipeline. Edit the
  script or the overrides, then re-run — a hand edit will be silently overwritten
  tomorrow morning.
- **Pure logic gets a unit test.** Changes to `scripts/lib/*.js` (merge precedence, the
  diff/noise floor, family grouping, selection heuristics) should come with a matching
  case in `test/`. `npm test` runs on every PR and needs no network.
