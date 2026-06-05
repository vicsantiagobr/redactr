// @ts-check
/**
 * @file Public entry point for the Redactr core library.
 *
 * Redactr scrubs secrets and personal data out of text before you share it —
 * with an AI assistant, in a bug report, on a pastebin, anywhere. The same
 * value always maps to the same placeholder and the mapping is reversible, so
 * you can redact -> ask the model -> restore.
 *
 * @example
 * import { redact, restore } from "redactr";
 *
 * const { text, map } = redact("email me at ada@example.com");
 * // text -> "email me at [[EMAIL_1]]"
 * restore(text, map); // -> "email me at ada@example.com"
 */

export { redact, restore, listDetectors, detectorsByType } from "./redactor.js";
export { DETECTORS, luhn, isValidCPF, isValidCNPJ } from "./detectors.js";
export { VERSION } from "./version.js";
