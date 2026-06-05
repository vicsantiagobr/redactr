# Security Policy

## Redactr's threat model

Redactr is designed so that **your data never leaves your device**:

- The library makes **no network requests**.
- The web demo is a fully static page; it works offline and uploads nothing.
- Mappings between placeholders and original values live only in memory (and on
  disk only when you explicitly pass `--map` on the CLI).

Redactr is a **best-effort** redaction aid. It is not a substitute for a
data-loss-prevention program, and it cannot guarantee that every secret is
caught. Always review output before sharing.

## Reporting a vulnerability

If you find a security issue — for example a way the demo could exfiltrate data,
or a detector pattern that causes catastrophic backtracking (ReDoS) — please
report it privately:

- Use **GitHub Security Advisories** ("Report a vulnerability" on the Security
  tab), or
- Open an issue that describes the problem **without** including real secrets.

Please do not include real credentials or personal data in any report.

## Supported versions

The latest released version on the `main` branch is supported.
