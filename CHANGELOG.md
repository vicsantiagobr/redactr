# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and the project follows
[Semantic Versioning](https://semver.org/).

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
