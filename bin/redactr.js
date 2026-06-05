#!/usr/bin/env node
// @ts-check
/**
 * @file Redactr command line interface.
 *
 * Pipe text in, get redacted text out. Nothing is sent anywhere.
 *
 *   cat app.log | npx redactr            # redact stdin
 *   npx redactr secrets.txt              # redact a file
 *   cat app.log | npx redactr --map m.json > clean.log
 *   npx redactr --restore m.json < clean.log
 *   npx redactr --json < app.log         # full JSON result
 *   npx redactr --list                   # list detectors
 */

import { readFileSync, writeFileSync } from "node:fs";
import { redact, restore, listDetectors } from "../src/redactor.js";
import { VERSION } from "../src/version.js";

const HELP = `redactr v${VERSION} — scrub secrets & PII from text

Usage:
  redactr [file]                 Redact a file (or stdin if omitted)
  redactr --map <file>           Also write the placeholder->value map to <file>
  redactr --restore <file>       Restore text using a previously saved map
  redactr --enable <a,b,...>     Only run these detector types
  redactr --disable <a,b,...>    Run every detector except these
  redactr --json                 Print the full result as JSON
  redactr --list                 List available detectors
  redactr --version              Print version
  redactr --help                 Show this help

Examples:
  cat app.log | redactr --map map.json > clean.log
  redactr --restore map.json < clean.log

Everything runs locally. No network access, ever.`;

/**
 * Minimal flag parser (no dependencies).
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ file?: string, map?: string, restore?: string, enable?: string[], disable?: string[], json: boolean, list: boolean, help: boolean, version: boolean }} */
  const opts = { json: false, list: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--list":
        opts.list = true;
        break;
      case "--map":
        opts.map = argv[++i];
        break;
      case "--restore":
        opts.restore = argv[++i];
        break;
      case "--enable":
        opts.enable = (argv[++i] ?? "").split(",").filter(Boolean);
        break;
      case "--disable":
        opts.disable = (argv[++i] ?? "").split(",").filter(Boolean);
        break;
      default:
        if (arg.startsWith("-")) {
          process.stderr.write(`Unknown option: ${arg}\n`);
          process.exit(2);
        }
        opts.file = arg;
    }
  }
  return opts;
}

/**
 * Read all of stdin as a string.
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) return void process.stdout.write(HELP + "\n");
  if (opts.version) return void process.stdout.write(VERSION + "\n");
  if (opts.list) {
    for (const d of listDetectors()) {
      process.stdout.write(`${d.type.padEnd(20)} ${d.label}\n`);
    }
    return;
  }

  const input = opts.file ? readFileSync(opts.file, "utf8") : await readStdin();

  if (opts.restore) {
    const map = JSON.parse(readFileSync(opts.restore, "utf8"));
    process.stdout.write(restore(input, map));
    return;
  }

  const result = redact(input, {
    enable: opts.enable,
    disable: opts.disable,
  });

  if (opts.map) {
    writeFileSync(opts.map, JSON.stringify(result.map, null, 2));
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(result.text);
    // Summary goes to stderr so it never pollutes piped output.
    if (result.total > 0) {
      const summary = Object.entries(result.stats)
        .map(([t, n]) => `${t}:${n}`)
        .join(" ");
      process.stderr.write(`\nredactr: ${result.total} redacted (${summary})\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`redactr: ${err.message}\n`);
  process.exit(1);
});
