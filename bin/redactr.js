#!/usr/bin/env node
// @ts-check
/**
 * @file Redactr command line interface.
 *
 * Two things:
 *   1. Redact text you're about to share.
 *   2. Scan a project for secrets that are about to be committed/published.
 *
 *   cat app.log | npx redactr                 # redact stdin
 *   npx redactr secrets.txt                    # redact a file
 *   cat app.log | npx redactr --map m.json     # save a restore map
 *   npx redactr --restore m.json < clean.log   # restore
 *   npx redactr scan .                         # scan a project for leaks
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import {
  mkdirSync, chmodSync, existsSync, rmSync,
} from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { redact, restore, listDetectors } from "../src/redactor.js";
import { scanText } from "../src/scanner.js";
import { VERSION } from "../src/version.js";

const HELP = `redactr v${VERSION} — scrub secrets & PII, and scan projects for leaks

Usage:
  redactr [file]                 Redact a file (or stdin if omitted)
  redactr --map <file>           Also write the placeholder->value map to <file>
  redactr --restore <file>       Restore text using a previously saved map
  redactr --enable <a,b,...>     Only run these detector types
  redactr --disable <a,b,...>    Run every detector except these
  redactr --fake                 Replace with realistic, valid, reversible fakes
  redactr --mask                 Replace with bullets (a••@e••.com; not reversible)
  redactr --seed <n>             Seed for --fake (deterministic output)
  redactr --json                 Print the full result as JSON
  redactr --list                 List available detectors

  redactr scan [path]            Scan a file or directory for leaked secrets
    --staged                     Scan only files staged in git (for hooks)
    --json                       Machine-readable findings
    --no-git-check               Skip the .env / .gitignore check

  redactr protect [path]         Install a git pre-commit hook that auto-scans
                                 every commit and blocks leaks (--uninstall to remove)

  redactr --version | --help

Examples:
  cat app.log | redactr --map map.json > clean.log
  redactr scan .                 # great as a pre-commit / CI guard
  redactr protect                # make this repo leak-proof on every commit

Everything runs locally. No network access, ever.`;

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
/** @param {number} code @param {string} s */
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s) => c(31, s);
const green = (s) => c(32, s);
const yellow = (s) => c(33, s);
const dim = (s) => c(90, s);
const bold = (s) => c(1, s);

/** Read all of stdin as a string. @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

/* -------------------------------------------------------------------------- */
/*  Scan command                                                              */
/* -------------------------------------------------------------------------- */

const DEFAULT_IGNORES = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  ".cache", "coverage", "vendor", ".venv", "venv", "__pycache__",
  ".idea", ".vscode", ".turbo", "target",
]);
const MAX_FILE_BYTES = 2_000_000;

/** @param {string} name */
const isEnvExample = (name) =>
  /\.env\.(example|sample|template|dist|local\.example)$/i.test(name) ||
  /\.(example|sample|template)$/i.test(name);
/** @param {string} name */
const isEnvFile = (name) =>
  !isEnvExample(name) && (name === ".env" || /^\.env(\.|$)/.test(name));

/**
 * Yield every regular file under `dir`, skipping ignored directories.
 * @param {string} dir
 * @returns {Generator<string>}
 */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** @param {Buffer} buf */
function looksBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Does the project's .gitignore cover `.env` files?
 * @param {string} root
 */
function envIsGitignored(root) {
  let content = "";
  try {
    content = readFileSync(join(root, ".gitignore"), "utf8");
  } catch {
    return false;
  }
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .some((l) => /^\/?\.env(\*|\.\*)?$/.test(l) || l === "*.env" || l === ".env*");
}

/**
 * Read the staged version of every added/modified file (for the pre-commit
 * hook). Uses `git show :path` so partial staging is handled correctly.
 * @param {string} root
 * @returns {{file:string, buf:Buffer}[]}
 */
function stagedEntries(root) {
  let listed;
  try {
    listed = execFileSync(
      "git",
      ["-C", root, "diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    throw new Error("not a git repository, or git is not available");
  }
  const names = listed.toString("utf8").split("\0").filter(Boolean);
  /** @type {{file:string, buf:Buffer}[]} */
  const entries = [];
  for (const name of names) {
    try {
      const buf = execFileSync("git", ["-C", root, "show", `:${name}`], {
        maxBuffer: 64 * 1024 * 1024,
      });
      entries.push({ file: name, buf });
    } catch {
      /* deleted, binary, or unreadable — skip */
    }
  }
  return entries;
}

/**
 * @param {string[]} args
 * @returns {Promise<number>} process exit code
 */
async function runScan(args) {
  let path = ".";
  let json = false;
  let gitCheck = true;
  let staged = false;
  /** @type {string[]|undefined} */ let enable;
  /** @type {string[]|undefined} */ let disable;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") json = true;
    else if (a === "--no-git-check") gitCheck = false;
    else if (a === "--staged") staged = true;
    else if (a === "--enable") enable = (args[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--disable") disable = (args[++i] ?? "").split(",").filter(Boolean);
    else if (!a.startsWith("-")) path = a;
  }

  const opts = { enable, disable };
  const root = path;

  /** @type {{file:string, buf:Buffer}[]} */
  let entries = [];
  if (staged) {
    entries = stagedEntries(root);
  } else {
    const isDir = (() => {
      try { return statSync(path).isDirectory(); } catch { return false; }
    })();
    const files = isDir ? [...walk(path)] : [path];
    for (const file of files) {
      let size;
      try { size = statSync(file).size; } catch { continue; }
      if (size > MAX_FILE_BYTES) continue;
      let buf;
      try { buf = readFileSync(file); } catch { continue; }
      entries.push({ file, buf });
    }
  }

  /** @type {{file:string, findings:import("../src/scanner.js").Finding[]}[]} */
  const leaks = [];
  /** @type {{file:string, count:number}[]} */
  const exampleWarnings = [];
  let envSecretCount = 0;
  let envFilesFound = 0;
  let scanned = 0;

  for (const { file, buf } of entries) {
    if (looksBinary(buf)) continue;
    scanned++;

    const findings = scanText(buf.toString("utf8"), opts);
    if (!findings.length) continue;

    const name = basename(file);
    if (isEnvFile(name)) {
      envFilesFound++;
      envSecretCount += findings.length;
    } else if (isEnvExample(name)) {
      exampleWarnings.push({ file, count: findings.length });
    } else {
      leaks.push({ file, findings });
    }
  }

  const envAtRisk = gitCheck && envFilesFound > 0 && !envIsGitignored(root);

  if (json) {
    process.stdout.write(
      JSON.stringify(
        { scanned, leaks, exampleWarnings, envFilesFound, envSecretCount, envAtRisk },
        null,
        2,
      ) + "\n",
    );
    return leaks.length || envAtRisk ? 1 : 0;
  }

  // Human report ------------------------------------------------------------
  process.stdout.write(`\n${bold("redactr scan")} ${dim("— " + root)}\n\n`);

  for (const { file, findings } of leaks) {
    process.stdout.write(`  ${bold(file)}\n`);
    for (const f of findings) {
      const loc = dim(`${f.line}:${f.column}`.padEnd(8));
      process.stdout.write(
        `    ${loc} ${red(f.type.padEnd(18))} ${f.label.padEnd(24)} ${dim(f.preview)}\n`,
      );
    }
    process.stdout.write("\n");
  }

  for (const { file, count } of exampleWarnings) {
    process.stdout.write(
      `  ${yellow("⚠")} ${bold(file)} ${dim(`looks like it contains ${count} real secret(s) — example files should use placeholders.`)}\n`,
    );
  }

  if (envFilesFound > 0) {
    if (envAtRisk) {
      process.stdout.write(
        `  ${red("✖")} ${envFilesFound} .env file(s) with ${envSecretCount} secret(s) ${red("are NOT in .gitignore")} — risk of being committed.\n`,
      );
    } else if (gitCheck) {
      process.stdout.write(
        `  ${green("✓")} ${dim(`.env file(s) present and covered by .gitignore (${envSecretCount} secrets kept local).`)}\n`,
      );
    }
  }

  const leakCount = leaks.reduce((n, l) => n + l.findings.length, 0);
  process.stdout.write("\n");

  if (leakCount === 0 && !envAtRisk) {
    process.stdout.write(
      `${green("✓")} No hardcoded secrets found in ${scanned} file(s).\n`,
    );
    return 0;
  }

  if (leakCount > 0) {
    process.stdout.write(
      `${red("✖")} ${bold(String(leakCount))} potential leak(s) in ${leaks.length} file(s).\n`,
    );
  }
  process.stdout.write(
    dim(
      "\nNext steps:\n" +
        "  • Move hardcoded secrets into environment variables or a .env file.\n" +
        "  • Add .env to .gitignore so it is never committed.\n" +
        "  • Rotate any key that may already have been exposed.\n",
    ),
  );
  return 1;
}

/* -------------------------------------------------------------------------- */
/*  Protect command (git pre-commit hook)                                     */
/* -------------------------------------------------------------------------- */

const HOOK_MARKER = "# redactr-pre-commit";

/**
 * Build the pre-commit hook script. It tries, in order: a global `redactr`,
 * a locally installed one, then this exact CLI by absolute path — so it works
 * offline regardless of how redactr is installed.
 * @param {string} fallbackCmd
 */
const hookScript = (fallbackCmd) => `#!/bin/sh
${HOOK_MARKER} — auto-installed by 'redactr protect'.
# Blocks a commit if a secret is staged. Remove with: redactr protect --uninstall
if command -v redactr >/dev/null 2>&1; then
  redactr scan --staged
elif [ -x "node_modules/.bin/redactr" ]; then
  node_modules/.bin/redactr scan --staged
else
  ${fallbackCmd} scan --staged
fi
`;

/**
 * Resolve a repo's hooks directory, handling both a normal `.git` directory
 * and a `.git` file (worktrees / submodules).
 * @param {string} root
 * @returns {string|null}
 */
function findGitDir(root) {
  const dotGit = join(root, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
  } catch {
    return null;
  }
  try {
    const m = readFileSync(dotGit, "utf8").match(/gitdir:\s*(.+)\s*$/m);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Install (or remove) the pre-commit hook.
 * @param {string[]} args
 * @returns {number} exit code
 */
function runProtect(args) {
  const uninstall = args.includes("--uninstall");
  const force = args.includes("--force");
  const root = args.find((a) => !a.startsWith("-")) ?? ".";

  const gitDir = findGitDir(root);
  if (!gitDir) {
    process.stderr.write(`${red("✖")} ${root} is not a git repository.\n`);
    return 1;
  }
  const hookPath = join(gitDir, "hooks", "pre-commit");

  if (uninstall) {
    try {
      const current = readFileSync(hookPath, "utf8");
      if (current.includes(HOOK_MARKER)) {
        rmSync(hookPath);
        process.stdout.write(`${green("✓")} Removed redactr pre-commit hook.\n`);
      } else {
        process.stdout.write(
          `${yellow("•")} The pre-commit hook is not managed by redactr — left untouched.\n`,
        );
      }
    } catch {
      process.stdout.write("No pre-commit hook to remove.\n");
    }
    return 0;
  }

  if (existsSync(hookPath) && !force) {
    const current = (() => {
      try { return readFileSync(hookPath, "utf8"); } catch { return ""; }
    })();
    if (!current.includes(HOOK_MARKER)) {
      process.stderr.write(
        `${yellow("⚠")} A pre-commit hook already exists. Re-run with --force to replace it,\n` +
          `  or add this line to it manually:\n    redactr scan --staged\n`,
      );
      return 1;
    }
  }

  mkdirSync(join(gitDir, "hooks"), { recursive: true });
  const selfPath = fileURLToPath(import.meta.url).replace(/\\/g, "/");
  writeFileSync(hookPath, hookScript(`node "${selfPath}"`), { mode: 0o755 });
  try { chmodSync(hookPath, 0o755); } catch { /* windows */ }

  process.stdout.write(
    `${green("✓")} Installed pre-commit hook at ${dim(hookPath)}\n` +
      `  Every commit now runs ${bold("redactr scan --staged")} and is blocked if a secret is found.\n` +
      `  Remove it any time with ${dim("redactr protect --uninstall")}.\n`,
  );
  return 0;
}

/* -------------------------------------------------------------------------- */
/*  Redact / restore command                                                  */
/* -------------------------------------------------------------------------- */

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ file?: string, map?: string, restore?: string, enable?: string[], disable?: string[], strategy?: "placeholder"|"fake"|"mask", seed?: number, json: boolean, list: boolean, help: boolean, version: boolean }} */
  const opts = { json: false, list: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h": case "--help": opts.help = true; break;
      case "-v": case "--version": opts.version = true; break;
      case "--json": opts.json = true; break;
      case "--list": opts.list = true; break;
      case "--fake": opts.strategy = "fake"; break;
      case "--mask": opts.strategy = "mask"; break;
      case "--strategy": opts.strategy = /** @type {any} */ (argv[++i]); break;
      case "--seed": opts.seed = Number(argv[++i]); break;
      case "--map": opts.map = argv[++i]; break;
      case "--restore": opts.restore = argv[++i]; break;
      case "--enable": opts.enable = (argv[++i] ?? "").split(",").filter(Boolean); break;
      case "--disable": opts.disable = (argv[++i] ?? "").split(",").filter(Boolean); break;
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

async function runRedact(argv) {
  const opts = parseArgs(argv);

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
    strategy: opts.strategy,
    seed: opts.seed,
  });
  if (opts.map) writeFileSync(opts.map, JSON.stringify(result.map, null, 2));

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(result.text);
    if (result.total > 0) {
      const summary = Object.entries(result.stats)
        .map(([t, n]) => `${t}:${n}`)
        .join(" ");
      process.stderr.write(`\nredactr: ${result.total} redacted (${summary})\n`);
    }
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "scan") {
    process.exitCode = await runScan(argv.slice(1));
    return;
  }
  if (argv[0] === "protect") {
    process.exitCode = runProtect(argv.slice(1));
    return;
  }
  await runRedact(argv);
}

main().catch((err) => {
  process.stderr.write(`redactr: ${err.message}\n`);
  process.exit(1);
});
