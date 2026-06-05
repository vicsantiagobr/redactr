// @ts-check
/**
 * @file Detection engine for Redactr.
 *
 * Each detector is a small, self-contained description of one kind of
 * sensitive data (an API key, an email, a credit card, ...). Detectors are
 * pure data + optional validators, which makes them trivial to test, extend
 * and reason about.
 *
 * Everything here runs identically in the browser and in Node — there are no
 * dependencies and no build step.
 */

/**
 * @typedef {Object} Detector
 * @property {string} type        Stable identifier, also used in placeholders (e.g. "EMAIL").
 * @property {string} label       Human friendly name shown in the UI.
 * @property {RegExp} regex       Global regex. The `g` and `d` flags are added automatically.
 * @property {number} priority    Higher wins when two matches overlap.
 * @property {number} [group]     Capture group to redact instead of the whole match.
 * @property {(value: string) => boolean} [validate] Extra check to drop false positives.
 * @property {boolean} [defaultOff] When true the detector is disabled unless explicitly enabled.
 */

/* -------------------------------------------------------------------------- */
/*  Validators                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Luhn checksum, used to validate credit-card-like numbers.
 * @param {string} value Digits, possibly separated by spaces or dashes.
 * @returns {boolean}
 */
export function luhn(value) {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Validate a Brazilian CPF (taxpayer id) using its two check digits.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidCPF(value) {
  const d = value.replace(/[^\d]/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  /** @param {number} len */
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/**
 * Validate a Brazilian CNPJ (company id) using its two check digits.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidCNPJ(value) {
  const d = value.replace(/[^\d]/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  /** @param {number} len */
  const calc = (len) => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/* -------------------------------------------------------------------------- */
/*  Detectors                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The built-in detectors, ordered roughly from most specific to most generic.
 * Priority (not array order) decides who wins an overlap.
 * @type {Detector[]}
 */
export const DETECTORS = [
  {
    type: "PRIVATE_KEY",
    label: "Private key block",
    priority: 100,
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/,
  },
  {
    type: "JWT",
    label: "JSON Web Token",
    priority: 90,
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    type: "ANTHROPIC_KEY",
    label: "Anthropic API key",
    priority: 86,
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  },
  {
    type: "OPENAI_KEY",
    label: "OpenAI API key",
    priority: 85,
    regex: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}/,
  },
  {
    type: "AWS_ACCESS_KEY",
    label: "AWS access key id",
    priority: 84,
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|ABIA|ACCA)[A-Z0-9]{16}\b/,
  },
  {
    type: "GITHUB_TOKEN",
    label: "GitHub token",
    priority: 84,
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/,
  },
  {
    type: "GOOGLE_API_KEY",
    label: "Google API key",
    priority: 83,
    regex: /\bAIza[A-Za-z0-9_-]{35}\b/,
  },
  {
    type: "SLACK_TOKEN",
    label: "Slack token",
    priority: 83,
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    type: "STRIPE_KEY",
    label: "Stripe key",
    priority: 83,
    regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  },
  {
    type: "SENDGRID_KEY",
    label: "SendGrid key",
    priority: 83,
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/,
  },
  {
    type: "URL_CREDENTIALS",
    label: "URL with credentials",
    priority: 75,
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/:@]+@[^\s]+/i,
  },
  {
    type: "BEARER_TOKEN",
    label: "Bearer token",
    priority: 70,
    group: 1,
    regex: /\bBearer\s+([A-Za-z0-9_.=-]{10,})/i,
  },
  {
    type: "CREDIT_CARD",
    label: "Credit card number",
    priority: 68,
    regex: /\b\d(?:[ -]?\d){11,18}\b/,
    validate: luhn,
  },
  {
    type: "CPF",
    label: "Brazilian CPF",
    priority: 66,
    regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
    validate: isValidCPF,
  },
  {
    type: "CNPJ",
    label: "Brazilian CNPJ",
    priority: 66,
    regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
    validate: isValidCNPJ,
  },
  {
    type: "SSN",
    label: "US Social Security Number",
    priority: 60,
    regex: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
  },
  {
    type: "IBAN",
    label: "IBAN",
    priority: 58,
    regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/,
  },
  {
    type: "EMAIL",
    label: "Email address",
    priority: 50,
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  },
  {
    type: "SECRET_ASSIGNMENT",
    label: "Secret in key=value",
    priority: 45,
    group: 1,
    regex:
      /(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']?([^\s"'`,;]{6,})/i,
  },
  {
    type: "IPV6",
    label: "IPv6 address",
    priority: 44,
    regex:
      /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}:?){0,6}\b/,
  },
  {
    type: "IPV4",
    label: "IPv4 address",
    priority: 40,
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/,
  },
  {
    type: "MAC",
    label: "MAC address",
    priority: 38,
    regex: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/,
  },
  {
    type: "PHONE",
    label: "Phone number",
    priority: 30,
    regex:
      /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,3}\)|\d{2,3})[\s.-]?\d{4,5}[\s.-]?\d{4}\b/,
    // Phones are noisy; require at least 10 digits to reduce false positives.
    validate: (v) => v.replace(/\D/g, "").length >= 10,
  },
];

/**
 * Build a lookup of detectors by type.
 * @returns {Record<string, Detector>}
 */
export function detectorsByType() {
  /** @type {Record<string, Detector>} */
  const out = {};
  for (const d of DETECTORS) out[d.type] = d;
  return out;
}
