// @ts-check
/**
 * @file The reversible redaction engine.
 *
 * `redact()` replaces sensitive substrings with stable placeholders and
 * returns a mapping so the original values can be restored later with
 * `restore()`. The same value always maps to the same placeholder, which
 * keeps the redacted text readable and lets an LLM reason about it.
 */

import { DETECTORS, detectorsByType } from "./detectors.js";

/**
 * @typedef {import("./detectors.js").Detector} Detector
 */

/**
 * @typedef {Object} RedactItem
 * @property {string} type        Detector type, e.g. "EMAIL".
 * @property {string} label       Human friendly detector name.
 * @property {string} placeholder Token inserted into the redacted text.
 * @property {string} value       The original (sensitive) value.
 * @property {number} count       How many times the value occurred.
 */

/**
 * @typedef {Object} RedactResult
 * @property {string} text                     The redacted text.
 * @property {Record<string,string>} map       placeholder -> original value.
 * @property {RedactItem[]} items              One entry per unique value.
 * @property {Record<string,number>} stats     type -> number of redactions.
 * @property {number} total                    Total number of redactions.
 */

/**
 * @typedef {Object} RedactOptions
 * @property {string[]} [enable]   Only run these detector types.
 * @property {string[]} [disable]  Run every detector except these.
 * @property {(type: string, n: number) => string} [format] Custom placeholder format.
 * @property {Detector[]} [detectors] Override the detector list entirely.
 */

/** @type {(type: string, n: number) => string} */
const defaultFormat = (type, n) => `[[${type}_${n}]]`;

/**
 * Decide which detectors to run for the given options.
 * @param {RedactOptions} options
 * @returns {Detector[]}
 */
function selectDetectors(options) {
  let list = options.detectors ?? DETECTORS;
  if (options.enable && options.enable.length) {
    const set = new Set(options.enable);
    list = list.filter((d) => set.has(d.type));
  }
  if (options.disable && options.disable.length) {
    const set = new Set(options.disable);
    list = list.filter((d) => !set.has(d.type));
  }
  return list.filter((d) => !d.defaultOff || options.enable);
}

/**
 * @typedef {Object} RawMatch
 * @property {number} start
 * @property {number} end
 * @property {string} value
 * @property {Detector} detector
 */

/**
 * Find every candidate match in `text` for the selected detectors.
 * Uses the `d` (hasIndices) flag so group-scoped detectors redact exactly
 * the captured value and nothing else.
 * @param {string} text
 * @param {Detector[]} detectors
 * @returns {RawMatch[]}
 */
function collectMatches(text, detectors) {
  /** @type {RawMatch[]} */
  const matches = [];
  for (const detector of detectors) {
    const flags = "gd" + (detector.regex.flags.includes("i") ? "i" : "");
    const re = new RegExp(detector.regex.source, flags);
    for (const m of text.matchAll(re)) {
      const groupIndex = detector.group ?? 0;
      const indices = /** @type {any} */ (m).indices;
      const span = indices && indices[groupIndex];
      if (!span) continue;
      const [start, end] = span;
      const value = text.slice(start, end);
      if (detector.validate && !detector.validate(value)) continue;
      matches.push({ start, end, value, detector });
    }
  }
  return matches;
}

/**
 * Keep the highest-priority, non-overlapping set of matches.
 * Ties are broken by the longer match, then by earlier position.
 * @param {RawMatch[]} matches
 * @returns {RawMatch[]}
 */
function resolveOverlaps(matches) {
  const ranked = [...matches].sort((a, b) => {
    if (b.detector.priority !== a.detector.priority)
      return b.detector.priority - a.detector.priority;
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  });

  /** @type {RawMatch[]} */
  const kept = [];
  for (const m of ranked) {
    const overlaps = kept.some((k) => m.start < k.end && m.end > k.start);
    if (!overlaps) kept.push(m);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

/**
 * @typedef {Object} Match
 * @property {string} type   Detector type, e.g. "EMAIL".
 * @property {string} label  Human friendly detector name.
 * @property {string} value  The matched (sensitive) substring.
 * @property {number} start  Start offset in the input text.
 * @property {number} end    End offset in the input text.
 */

/**
 * Find every sensitive match in `text`, resolved (no overlaps) and sorted by
 * position. This is the shared primitive used by both `redact()` and the
 * project scanner.
 * @param {string} text
 * @param {RedactOptions} [options]
 * @returns {Match[]}
 */
export function findMatches(text, options = {}) {
  if (typeof text !== "string") {
    throw new TypeError("findMatches() expects a string");
  }
  const detectors = selectDetectors(options);
  const kept = resolveOverlaps(collectMatches(text, detectors));
  return kept.map((m) => ({
    type: m.detector.type,
    label: m.detector.label,
    value: m.value,
    start: m.start,
    end: m.end,
  }));
}

/**
 * Redact sensitive data from `text`.
 * @param {string} text
 * @param {RedactOptions} [options]
 * @returns {RedactResult}
 */
export function redact(text, options = {}) {
  if (typeof text !== "string") {
    throw new TypeError("redact() expects a string");
  }
  const format = options.format ?? defaultFormat;
  const detectors = selectDetectors(options);
  const kept = resolveOverlaps(collectMatches(text, detectors));

  /** @type {Record<string,string>} */
  const map = {};
  /** @type {Record<string,number>} */
  const counters = {};
  /** @type {Record<string,number>} */
  const stats = {};
  /** @type {Map<string, RedactItem>} */
  const itemsByKey = new Map();
  /** @type {Map<string, string>} value+type -> placeholder */
  const placeholderByValue = new Map();

  let out = "";
  let cursor = 0;
  let total = 0;

  for (const m of kept) {
    const { type, label } = m.detector;
    const key = type + "\u0000" + m.value;
    let placeholder = placeholderByValue.get(key);
    if (!placeholder) {
      counters[type] = (counters[type] ?? 0) + 1;
      placeholder = format(type, counters[type]);
      placeholderByValue.set(key, placeholder);
      map[placeholder] = m.value;
      itemsByKey.set(key, {
        type,
        label,
        placeholder,
        value: m.value,
        count: 0,
      });
    }
    const item = /** @type {RedactItem} */ (itemsByKey.get(key));
    item.count += 1;
    stats[type] = (stats[type] ?? 0) + 1;
    total += 1;

    out += text.slice(cursor, m.start) + placeholder;
    cursor = m.end;
  }
  out += text.slice(cursor);

  return {
    text: out,
    map,
    items: [...itemsByKey.values()],
    stats,
    total,
  };
}

/**
 * Restore previously redacted text using a placeholder -> value map.
 * Works on any text that still contains the placeholders, including an LLM's
 * reply, so you can round-trip: redact -> ask the model -> restore.
 * @param {string} text
 * @param {Record<string,string>} map
 * @returns {string}
 */
export function restore(text, map) {
  if (typeof text !== "string") {
    throw new TypeError("restore() expects a string");
  }
  // Replace longer placeholders first so EMAIL_1 never clobbers EMAIL_11.
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = text;
  for (const ph of keys) {
    out = out.split(ph).join(map[ph]);
  }
  return out;
}

/**
 * List the detectors available with the given options (handy for UIs).
 * @param {RedactOptions} [options]
 * @returns {{ type: string, label: string }[]}
 */
export function listDetectors(options = {}) {
  return selectDetectors(options).map(({ type, label }) => ({ type, label }));
}

export { DETECTORS, detectorsByType };
