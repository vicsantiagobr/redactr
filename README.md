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

## 🎭 Three ways to redact — including one nobody else has

Most tools only blank things out. Redactr gives you a choice, and the third one
is the differentiator:

| Strategy | `ada@acme.com` becomes | Reversible | Good for |
| --- | --- | --- | --- |
| `placeholder` *(default)* | `[[EMAIL_1]]` | ✅ | letting an LLM reason about structure |
| **`fake`** ✨ | `mara.silva@example.net` | ✅ | **natural-looking prompts, safe test data** |
| `mask` | `a••@a••.com` | ❌ | quick one-way display |

**Realistic fakes** are the unique part. Each value is replaced by a believable,
**deterministic, checksum-valid** stand-in:

- a **CPF/CNPJ** that is *different* but passes the real check-digit algorithm,
- a credit card that keeps the **brand digit + separators** and passes **Luhn**,
- an API key that keeps its **recognizable prefix** (`sk-proj-…`, `ghp_…`),
- an email that actually looks like an email, a valid IP, a JWT-shaped token…

Same input always maps to the same fake, so the text stays internally consistent
— and it's fully reversible:

```js
import { redact, restore } from "redactr";

const { text, map } = redact(
  "charge ada@acme.com, card 4111 1111 1111 1111",
  { strategy: "fake", seed: 42 },
);
// text -> "charge ivanalves@example.com, card 4399 3665 5344 7398"
//          (valid email)                (passes Luhn, still a Visa)
restore(modelReply, map); // real values back

```

```bash
echo "cpf 529.982.247-25" | npx redactr --fake     # -> a different, valid CPF
```

This makes Redactr two tools in one: a privacy shield for AI prompts **and** a
generator of safe, realistic test/sample data from production data.

## ✨ Highlights

- 🎭 **Realistic fakes (unique).** Optionally replace data with deterministic,
  **checksum-valid** look-alikes (valid CPF/CNPJ, Luhn-valid cards, prefix-kept
  keys) — natural prompts for AI and safe test data, still reversible.
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
- 🛡️ **Project scanner.** `npx redactr scan .` catches hardcoded secrets before
  you commit or publish them — works as a pre-commit / CI guard.
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

## 🛡️ Scan your project for leaks

Redactr's other half: point it at a folder and it flags **hardcoded secrets
before you commit or publish them** — so a leaked key never ends up on GitHub,
in a screen share, or in a stolen repo.

```bash
npx redactr scan .
```

```text
redactr scan — .

  src/config.js
    12:15  OPENAI_KEY      OpenAI API key      sk-…np (51 chars)
    18:1   AWS_ACCESS_KEY  AWS access key id   AKI…LE (20 chars)

  ✖ 1 .env file(s) with 4 secret(s) are NOT in .gitignore — risk of being committed.

✖ 2 potential leak(s) in 1 file(s).
```

- **Values are masked** in the report — it tells you *which* key leaked without
  printing it.
- It checks that your **`.env` is in `.gitignore`** (the #1 way keys get pushed
  by accident), and leaves real `.env` contents alone.
- It **exits non-zero** when it finds something, so it doubles as a guard:

  ```bash
  # .git/hooks/pre-commit  — block commits that contain secrets
  npx redactr scan . || { echo "Secret detected — commit aborted."; exit 1; }
  ```

  ```yaml
  # GitHub Actions — fail the build on a leak
  - run: npx redactr scan .
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
must pass their **check digits**. The same engine powers both `redact()` and
`scan` via the shared `findMatches()` primitive.

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
  strategy?: "placeholder" | "fake" | "mask"; // default "placeholder"
  seed?: number | string; // deterministic output for "fake"
  enable?: string[];   // only run these detector types
  disable?: string[];  // run all except these
  format?: (type: string, n: number) => string; // custom placeholders
}): {
  text: string;                       // redacted text
  map: Record<string, string>;        // replacement -> original value
  items: { type, label, placeholder, value, count }[];
  stats: Record<string, number>;      // type -> count
  total: number;
}

restore(text: string, map: Record<string, string>): string
listDetectors(options?): { type: string, label: string }[]

// lower-level / scanning
findMatches(text, options?): { type, label, value, start, end }[]
scanText(text, options?): { type, label, line, column, preview, length }[]
maskValue(value: string): string
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
