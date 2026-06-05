// @ts-check
/**
 * @file Project secret scanner (pure, browser-safe).
 *
 * Given the text of a file, `scanText` reports every sensitive match with its
 * line/column and a *masked* preview — so a report can point you at a leak
 * without ever printing the secret in full.
 *
 * The filesystem walking (reading a whole project) lives in the CLI, keeping
 * this module dependency-free and usable in the browser too.
 */

import { findMatches } from "./redactor.js";

/**
 * @typedef {Object} Finding
 * @property {string} type    Detector type, e.g. "OPENAI_KEY".
 * @property {string} label   Human friendly detector name.
 * @property {number} line    1-based line number.
 * @property {number} column  1-based column number.
 * @property {string} preview Masked preview of the secret (safe to display).
 * @property {number} length  Length of the original value.
 */

/**
 * Mask a secret so it can be shown in a report without leaking it.
 * Keeps just enough to recognize which value it is.
 * @param {string} value
 * @returns {string}
 */
export function maskValue(value) {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 3)}…${value.slice(-2)} (${value.length} chars)`;
}

/**
 * Scan a single file's text for sensitive data.
 * @param {string} text
 * @param {import("./redactor.js").RedactOptions} [options]
 * @returns {Finding[]}
 */
export function scanText(text, options = {}) {
  const matches = findMatches(text, options);
  if (!matches.length) return [];

  // Pre-compute line start offsets once so line/column lookup is fast.
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  /** @param {number} offset */
  const lineIndexOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  return matches.map((m) => {
    const li = lineIndexOf(m.start);
    return {
      type: m.type,
      label: m.label,
      line: li + 1,
      column: m.start - lineStarts[li] + 1,
      preview: maskValue(m.value),
      length: m.value.length,
    };
  });
}
