// @ts-check
/**
 * @file Deterministic, format-preserving fake-value generator.
 *
 * This is what makes Redactr different: instead of replacing a secret with an
 * ugly token like `[[EMAIL_1]]`, it can swap it for a *realistic* value that
 *
 *   • keeps the original's shape (a key still looks like a key),
 *   • passes the same validations (fake CPF/CNPJ/cards are checksum-valid),
 *   • is deterministic — the same input always yields the same fake, so the
 *     text stays internally consistent and the change is reversible.
 *
 * No dependencies, no randomness from the environment: the only entropy is the
 * value itself plus an optional seed. Runs the same in the browser and Node.
 */

import { isValidCPF, isValidCNPJ } from "./detectors.js";

/* -------------------------------------------------------------------------- */
/*  Seeded RNG (xmur3 hash -> mulberry32)                                      */
/* -------------------------------------------------------------------------- */

/** @param {string} str @returns {number} */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Build a deterministic [0,1) random function seeded by a string.
 * @param {string} seedStr
 * @returns {() => number}
 */
export function seededRandom(seedStr) {
  let a = xmur3(seedStr);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";

/** @param {string | readonly string[]} set @param {() => number} rand @returns {string} */
const pick = (set, rand) => set[Math.floor(rand() * set.length)];

/** @param {string} set @param {number} n @param {() => number} rand */
const repeat = (set, n, rand) => {
  let s = "";
  for (let i = 0; i < n; i++) s += pick(set, rand);
  return s;
};

/**
 * Replace each character with a random one of the *same class*
 * (a→letter, A→letter, 0→digit), leaving punctuation/separators intact.
 * @param {string} value
 * @param {() => number} rand
 * @returns {string}
 */
export function formatPreservingScramble(value, rand) {
  let out = "";
  for (const ch of value) {
    if (ch >= "a" && ch <= "z") out += pick(LOWER, rand);
    else if (ch >= "A" && ch <= "Z") out += pick(UPPER, rand);
    else if (ch >= "0" && ch <= "9") out += pick(DIGITS, rand);
    else out += ch;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Smart generators                                                          */
/* -------------------------------------------------------------------------- */

const FIRST = [
  "ada", "alan", "grace", "linus", "ada", "noor", "mara", "ravi", "ines",
  "theo", "lena", "omar", "sara", "ivan", "nina", "paulo", "rita", "bruno",
  "carla", "diego",
];
const LAST = [
  "silva", "souza", "costa", "lima", "rocha", "alves", "pereira", "gomes",
  "turing", "lovelace", "torvalds", "nakamoto", "ferreira", "barbosa",
  "moreira", "ramos", "dias", "castro", "freitas", "pinto",
];
const DOMAINS = ["example.com", "example.net", "example.org", "test.dev", "sample.io"];

/** @param {() => number} rand */
function fakeEmail(rand) {
  const first = pick(FIRST, rand);
  const last = pick(LAST, rand);
  const sep = pick([".", "_", ""], rand);
  const num = rand() < 0.4 ? String(Math.floor(rand() * 99)) : "";
  return `${first}${sep}${last}${num}@${pick(DOMAINS, rand)}`;
}

/** Compute the digit that makes `digits` (a string) a valid Luhn number when appended. */
function luhnCheckDigit(/** @type {string} */ digits) {
  let sum = 0;
  let alt = true; // the appended check digit is position 0 from the right, so existing start alternating
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generate a fake card number that preserves the original brand digit and
 * separator layout, and passes the Luhn check.
 * @param {string} value
 * @param {() => number} rand
 */
function fakeCard(value, rand) {
  const digits = value.replace(/\D/g, "");
  const n = digits.length;
  if (n < 13) return formatPreservingScramble(value, rand);
  let body = digits[0]; // keep brand
  for (let i = 1; i < n - 1; i++) body += pick(DIGITS, rand);
  const full = body + luhnCheckDigit(body);
  // re-insert separators at the original positions
  let out = "";
  let di = 0;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") out += full[di++];
    else out += ch;
  }
  return out;
}

/** @param {() => number} rand */
function fakeCPF(rand) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const d = repeat(DIGITS, 9, rand);
    const cpf = appendCpfDigits(d);
    const formatted = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    if (isValidCPF(formatted)) return formatted;
  }
  return "000.000.001-91";
}

/** @param {string} nine */
function appendCpfDigits(nine) {
  const calc = (/** @type {string} */ base) => {
    const len = base.length;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(base[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calc(nine);
  const d2 = calc(nine + d1);
  return nine + d1 + d2;
}

/** @param {() => number} rand */
function fakeCNPJ(rand) {
  const base = repeat(DIGITS, 8, rand) + "0001";
  const calc = (/** @type {string} */ b) => {
    const weights =
      b.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += Number(b[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(base);
  const d2 = calc(base + d1);
  const full = base + d1 + d2;
  const formatted = `${full.slice(0, 2)}.${full.slice(2, 5)}.${full.slice(5, 8)}/${full.slice(8, 12)}-${full.slice(12)}`;
  return isValidCNPJ(formatted) ? formatted : "11.222.333/0001-81";
}

/** @param {() => number} rand */
function fakeIPv4(rand) {
  const oct = () => 1 + Math.floor(rand() * 253);
  return `${oct()}.${oct()}.${oct()}.${oct()}`;
}

/** @param {() => number} rand */
function fakeJWT(rand) {
  const b64url = (/** @type {number} */ len) =>
    repeat(LOWER + UPPER + DIGITS + "-_", len, rand);
  const header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
  return `${header}.${b64url(24)}.${b64url(43)}`;
}

/**
 * Build a generator that keeps a recognizable prefix and scrambles the rest.
 * @param {RegExp} prefixRe
 */
function prefixPreserving(prefixRe) {
  return (/** @type {string} */ value, /** @type {() => number} */ rand) => {
    const m = value.match(prefixRe);
    const prefix = m ? m[0] : "";
    return prefix + formatPreservingScramble(value.slice(prefix.length), rand);
  };
}

/** @type {Record<string, (value: string, rand: () => number) => string>} */
const FAKERS = {
  EMAIL: (_v, rand) => fakeEmail(rand),
  CPF: (_v, rand) => fakeCPF(rand),
  CNPJ: (_v, rand) => fakeCNPJ(rand),
  CREDIT_CARD: fakeCard,
  IPV4: (_v, rand) => fakeIPv4(rand),
  JWT: (_v, rand) => fakeJWT(rand),
  OPENAI_KEY: prefixPreserving(/^sk-(proj-)?/),
  ANTHROPIC_KEY: prefixPreserving(/^sk-ant-/),
  GITHUB_TOKEN: prefixPreserving(/^(gh[pousr]_|github_pat_)/),
  GOOGLE_API_KEY: prefixPreserving(/^AIza/),
  AWS_ACCESS_KEY: prefixPreserving(/^(AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|ABIA|ACCA)/),
  STRIPE_KEY: prefixPreserving(/^(sk|pk|rk)_(live|test)_/),
  SENDGRID_KEY: prefixPreserving(/^SG\./),
  PRIVATE_KEY: (value, rand) =>
    value.replace(
      /(-----BEGIN[^\n]*-----\n?)([\s\S]*?)(\n?-----END[^\n]*-----)/,
      (_m, b, body, e) => b + formatPreservingScramble(body, rand) + e,
    ),
};

/**
 * Generate a realistic, deterministic fake for a detected value.
 * @param {string} type   Detector type, e.g. "EMAIL".
 * @param {string} value  The original value.
 * @param {() => number} rand Seeded RNG.
 * @returns {string}
 */
export function generateFake(type, value, rand) {
  const faker = FAKERS[type];
  return faker ? faker(value, rand) : formatPreservingScramble(value, rand);
}

/**
 * Mask a value in place: keep separators (and the first/last alphanumerics),
 * replace the rest with bullets. Not reversible — for display only.
 * @param {string} value
 * @returns {string}
 */
export function maskInline(value) {
  const isAlnum = (/** @type {string} */ ch) => /[A-Za-z0-9]/.test(ch);
  const chars = [...value];
  const alnumPositions = chars
    .map((ch, i) => (isAlnum(ch) ? i : -1))
    .filter((i) => i >= 0);
  if (alnumPositions.length <= 2) {
    return chars.map((ch) => (isAlnum(ch) ? "•" : ch)).join("");
  }
  const first = alnumPositions[0];
  const last = alnumPositions[alnumPositions.length - 1];
  return chars
    .map((ch, i) => {
      if (!isAlnum(ch)) return ch;
      if (i === first || i === last) return ch;
      return "•";
    })
    .join("");
}
