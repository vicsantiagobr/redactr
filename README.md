<div align="center">

# ▢ Redactr

### Scrub secrets &amp; personal data out of text — *before* you paste it into AI.

Paste a log, a stack trace, or a config into ChatGPT/Claude, a GitHub issue, or a
pastebin **without leaking** API keys, tokens, emails, credit cards, or CPFs.
Redactr does it locally, in your browser or terminal — **nothing is ever uploaded.**

[**▶ Live demo**](https://vicsantiagobr.github.io/redactr/) · [Quick start](#-quick-start) · [How it works](#-how-it-works) · [Detectors](#-what-it-detects)

[![CI](https://github.com/vicsantiagobr/redactr/actions/workflows/ci.yml/badge.svg)](https://github.com/vicsantiagobr/redactr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
![Zero runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-5eead4.svg)
![Works in browser & Node](https://img.shields.io/badge/runs-browser%20%2B%20node-38bdf8.svg)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-fbbf24.svg)](CONTRIBUTING.md)

</div>

---

## Why

We all paste logs, configs, and snippets into AI assistants and issue trackers
dozens of times a day. It's the fastest way to accidentally leak a production
API key, a customer's email, or your own credentials — and once it's pasted,
it's out of your hands.

**Redactr** sits in front of that paste. It finds sensitive data and swaps each
value for a stable placeholder like `[[EMAIL_1]]`, so the text stays perfectly
readable (and useful to an LLM) while the real values never leave your machine.

Because the placeholders are **consistent and reversible**, you can round-trip:

```
redact → ask the model → restore the answer
```

The model reasons about `[[EMAIL_1]]`; you get the real address back in its reply.

## Before / after

```diff
- DATABASE_URL=postgres://app:S3cr3tP%40ss@db.internal:5432/shop
- OPENAI_API_KEY=sk-proj-abcDEF1234567890ghIJKLmnop
- Customer ada.lovelace@example.com (CPF 529.982.247-25) paid with 4111 1111 1111 1111.
+ DATABASE_URL=[[URL_CREDENTIALS_1]]
+ OPENAI_API_KEY=[[OPENAI_KEY_1]]
+ Customer [[EMAIL_1]] (CPF [[CPF_1]]) paid with [[CREDIT_CARD_1]].
```

## ✨ Highlights

- 🔒 **100% local.** No servers, no telemetry, no network calls. The web demo is
  static; the library makes zero requests.
- ♻️ **Reversible.** Stable placeholders + a mapping let you restore the original
  values (or an AI's reply) exactly.
- 🧠 **Context-preserving.** The same value always maps to the same placeholder,
  so structure and meaning survive.
- 📦 **Zero runtime dependencies.** Pure standard ESM. Runs identically in the
  browser and in Node 18+.
- 🧩 **20+ detectors** out of the box — API keys, tokens, PII, credit cards
  (Luhn-checked), Brazilian CPF/CNPJ (digit-checked), and more.
- 🛠️ **Library + CLI + web UI**, all from one tiny codebase.

## 🚀 Quick start

### In the terminal (no install)

```bash
# Redact a log and save the mapping so you can restore later
cat app.log | npx redactr --map map.json > clean.log

# Paste clean.log into ChatGPT... then restore the model's reply:
npx redactr --restore map.json < model-reply.txt
```

### As a library

```bash
npm install redactr
```

```js
import { redact, restore } from "redactr";

const { text, map } = redact("ping ada@example.com, key sk-abc...123");
// text -> "ping [[EMAIL_1]], key [[OPENAI_KEY_1]]"

// ...send `text` to an LLM, then:
restore(aiReply, map); // puts the real values back
```

### In the browser

Open the [**live demo**](https://vicsantiagobr.github.io/redactr/), or drop the
module straight into a page — no build step:

```html
<script type="module">
  import { redact } from "https://vicsantiagobr.github.io/redactr/src/index.js";
  console.log(redact("my ip is 10.0.0.1").text); // "my ip is [[IPV4_1]]"
</script>
```

## 🧠 How it works

1. Every detector runs over the text and reports candidate spans (using the
   regex `d`/`hasIndices` flag for exact, group-scoped matches).
2. Overlapping matches are resolved by **priority** — a `postgres://user:pass@…`
   URL beats the bare email inside it.
3. Each unique value gets a numbered placeholder; repeats reuse the same one.
4. `restore()` replaces placeholders back (longest-first, so `_1` never clobbers
   `_11`).

Validators cut false positives: credit cards must pass **Luhn**, and CPF/CNPJ
must pass their **check digits**.

## 🔎 What it detects

| Category | Examples |
| --- | --- |
| **Cloud / API keys** | OpenAI, Anthropic, AWS access key id, GitHub tokens, Google API key, Slack, Stripe, SendGrid |
| **Auth** | JWTs, `Bearer` tokens, `key=value` secrets, private key blocks, URLs with credentials |
| **Financial** | Credit card numbers (Luhn-validated), IBAN |
| **Personal (PII)** | Emails, phone numbers, US SSN, Brazilian **CPF** & **CNPJ** (digit-validated) |
| **Network** | IPv4, IPv6, MAC addresses |

Run `npx redactr --list` to see them all. Each is a tiny, self-contained entry in
[`src/detectors.js`](src/detectors.js) — adding one is a few lines + a test.

## 📚 API

```ts
redact(text: string, options?: {
  enable?: string[];   // only run these detector types
  disable?: string[];  // run all except these
  format?: (type: string, n: number) => string; // custom placeholders
}): {
  text: string;                       // redacted text
  map: Record<string, string>;        // placeholder -> original value
  items: { type, label, placeholder, value, count }[];
  stats: Record<string, number>;      // type -> count
  total: number;
}

restore(text: string, map: Record<string, string>): string
listDetectors(options?): { type: string, label: string }[]
```

## ⚠️ Disclaimer

Redactr is a **best-effort** helper, not a guarantee. Pattern matching can miss
things or over-match. **Always review the output before sharing.** Don't rely on
it as your only control for highly sensitive data.

## 🤝 Contributing

Issues and PRs are very welcome — especially new detectors. See
[CONTRIBUTING.md](CONTRIBUTING.md). The whole test suite runs with
`npm test` (no install needed beyond dev tooling).

## 📄 License

[MIT](LICENSE) © vicsantiagobr
