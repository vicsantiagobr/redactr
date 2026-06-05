# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and the project follows
[Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-06-05

### Added

- **Realistic fake substitution** (`strategy: "fake"`) — the standout feature.
  Instead of `[[EMAIL_1]]`, swap each value for a believable, deterministic,
  **checksum-valid** fake: a different-but-valid CPF/CNPJ, a Luhn-valid card
  that keeps the brand digit and separators, an email that looks like an email,
  an API key that keeps its recognizable prefix. Same input → same fake, so the
  text stays consistent and the change is fully reversible via `restore()`.
- **Mask strategy** (`strategy: "mask"`) — bullets like `a••@e••.com` for quick,
  one-way display redaction.
- `seed` option for deterministic fakes.
- New exports: `generateFake`, `maskInline`, `seededRandom`,
  `formatPreservingScramble`.
- CLI flags `--fake`, `--mask`, `--strategy`, `--seed`.
- Web demo: a strategy selector (Placeholders / Realistic fakes / Mask).

## [0.2.0] - 2026-06-05

### Added

- **Project scanner** — `redactr scan [path]` walks a file or directory and
  reports hardcoded secrets with `file:line:column` and a **masked** preview
  (never the raw value). Exits non-zero on findings, so it works as a
  pre-commit / CI guard.
- Scanner checks that `.env` files are covered by `.gitignore` and warns when
  they are at risk of being committed; real `.env` contents are not listed.
- New library exports: `findMatches()` (the shared detection primitive),
  `scanText()`, and `maskValue()`.

## [0.1.0] - 2026-06-05

### Added

- Initial release.
- Core library: `redact()`, `restore()`, `listDetectors()` — reversible,
  consistent placeholders, priority-based overlap resolution. Zero runtime
  dependencies, runs in browser and Node.
- 20+ detectors: OpenAI/Anthropic/AWS/GitHub/Google/Slack/Stripe/SendGrid keys,
  JWTs, Bearer tokens, private key blocks, URLs with credentials, credit cards
  (Luhn), IBAN, emails, phones, US SSN, Brazilian CPF/CNPJ (digit-checked),
  IPv4/IPv6, MAC addresses, and generic `key=value` secrets.
- CLI (`npx redactr`) with stdin/file input, `--map`, `--restore`, `--enable`,
  `--disable`, `--json`, and `--list`.
- Static web demo with live redaction, detector toggles, drag & drop, copy, and
  a restore tab.
- Test suite (`node:test`) and CI (typecheck + tests on Node 20 & 22).
