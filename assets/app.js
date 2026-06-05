// @ts-check
/**
 * @file Redactr web demo. Imports the same core library that ships on npm and
 * runs it entirely in the browser — no network requests are made.
 */

import { redact, restore, listDetectors } from "../src/index.js";

const $ = (/** @type {string} */ id) =>
  /** @type {HTMLElement} */ (document.getElementById(id));

const input = /** @type {HTMLTextAreaElement} */ ($("input"));
const output = /** @type {HTMLTextAreaElement} */ ($("output"));
const statsEl = $("stats");
const chipsEl = $("detector-chips");
const mapTableEl = $("map-table");
const restoreInput = /** @type {HTMLTextAreaElement} */ ($("restore-input"));
const restoreOutput = /** @type {HTMLTextAreaElement} */ ($("restore-output"));

/** Detector types the user has switched off. */
const disabled = new Set();
/** Last placeholder -> value map, used by the restore tab. */
let lastMap = {};

const SAMPLE = `Subject: prod incident — checkout 500s

Hey, the worker keeps crashing. Here's the relevant bit of the config and log:

DATABASE_URL=postgres://app:S3cr3tP%40ss@db.internal:5432/shop
OPENAI_API_KEY=sk-proj-abcDEF1234567890ghIJKLmnop
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1IjoxMjN9.Q9aXm2k1Tq7m0pQ3rL8

Customer ada.lovelace@example.com (CPF 529.982.247-25) was charged on card
4111 1111 1111 1111. Their server was 192.168.10.42.

Can you help me figure out why it's failing?`;

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                 */
/* -------------------------------------------------------------------------- */

function buildChips() {
  chipsEl.innerHTML = "";
  for (const { type, label } of listDetectors()) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip on";
    chip.dataset.type = type;
    chip.title = "Click to toggle this detector";
    chip.innerHTML = `<span>${label}</span><span class="badge" data-badge="${type}">0</span>`;
    chip.addEventListener("click", () => {
      if (disabled.has(type)) {
        disabled.delete(type);
        chip.classList.add("on");
      } else {
        disabled.add(type);
        chip.classList.remove("on");
      }
      run();
    });
    chipsEl.appendChild(chip);
  }
}

/** @param {Record<string, number>} stats */
function renderStats(stats, total) {
  if (!total) {
    statsEl.textContent = "Nothing detected yet.";
  } else {
    const parts = Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}×${n}`)
      .join("  ·  ");
    statsEl.textContent = `${total} redacted  —  ${parts}`;
  }
  // reset badges, then fill
  for (const el of chipsEl.querySelectorAll("[data-badge]")) {
    el.textContent = "0";
    el.parentElement?.classList.toggle("on", !disabled.has(/** @type {HTMLElement} */ (el).dataset.badge));
  }
  for (const [t, n] of Object.entries(stats)) {
    const badge = chipsEl.querySelector(`[data-badge="${t}"]`);
    if (badge) badge.textContent = String(n);
  }
}

/**
 * @param {import("../src/redactor.js").RedactItem[]} items
 * @param {"placeholder"|"fake"|"mask"} [strategy]
 */
function renderMap(items, strategy) {
  if (!items.length) {
    mapTableEl.innerHTML = `<p class="map-empty">Nothing to show. Replaced values will appear here.</p>`;
    return;
  }
  mapTableEl.innerHTML = "";
  if (strategy === "mask") {
    const note = document.createElement("p");
    note.className = "map-empty";
    note.textContent =
      "Mask is one-way — the Restore tab can't bring these back.";
    mapTableEl.appendChild(note);
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "map-row";
    const ph = document.createElement("span");
    ph.className = "ph";
    ph.textContent = item.placeholder;
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = item.value + (item.count > 1 ? `  (×${item.count})` : "");
    row.append(ph, val);
    mapTableEl.appendChild(row);
  }
}

/* -------------------------------------------------------------------------- */
/*  Core run loop                                                             */
/* -------------------------------------------------------------------------- */

function run() {
  const strategy = /** @type {"placeholder"|"fake"|"mask"} */ (
    /** @type {HTMLSelectElement} */ ($("strategy")).value
  );
  const result = redact(input.value, {
    disable: [...disabled],
    strategy,
    seed: 1,
  });
  output.value = result.text;
  lastMap = result.map;
  renderStats(result.stats, result.total);
  renderMap(result.items, strategy);
  // keep the restore tab in sync if the user already pasted a reply
  if (restoreInput.value) {
    restoreOutput.value = restore(restoreInput.value, lastMap);
  }
}

/* -------------------------------------------------------------------------- */
/*  UI wiring                                                                 */
/* -------------------------------------------------------------------------- */

function debounce(fn, ms = 120) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(/** @type {any} */ (toast)._t);
  /** @type {any} */ (toast)._t = setTimeout(() => (el.hidden = true), 1600);
}

async function copy(text, label) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(label + " copied ✓");
  } catch {
    toast("Press Ctrl/Cmd+C to copy");
  }
}

function setupTabs() {
  const tabRedact = $("tab-redact");
  const tabRestore = $("tab-restore");
  const panelRedact = $("panel-redact");
  const panelRestore = $("panel-restore");
  const select = (which) => {
    const redacting = which === "redact";
    tabRedact.classList.toggle("is-active", redacting);
    tabRestore.classList.toggle("is-active", !redacting);
    tabRedact.setAttribute("aria-selected", String(redacting));
    tabRestore.setAttribute("aria-selected", String(!redacting));
    panelRedact.hidden = !redacting;
    panelRestore.hidden = redacting;
  };
  tabRedact.addEventListener("click", () => select("redact"));
  tabRestore.addEventListener("click", () => select("restore"));
}

function setupDropzone() {
  input.addEventListener("dragover", (e) => {
    e.preventDefault();
    input.classList.add("dragover");
  });
  input.addEventListener("dragleave", () => input.classList.remove("dragover"));
  input.addEventListener("drop", async (e) => {
    e.preventDefault();
    input.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    input.value = await file.text();
    run();
  });
}

function init() {
  buildChips();
  setupTabs();
  setupDropzone();

  input.addEventListener("input", debounce(run));
  /** @type {HTMLSelectElement} */ ($("strategy")).addEventListener("change", run);
  restoreInput.addEventListener(
    "input",
    debounce(() => {
      restoreOutput.value = restore(restoreInput.value, lastMap);
    }),
  );

  $("sample-btn").addEventListener("click", () => {
    input.value = SAMPLE;
    run();
    input.focus();
  });
  $("copy-btn").addEventListener("click", () => copy(output.value, "Redacted text"));
  $("restore-copy-btn").addEventListener("click", () =>
    copy(restoreOutput.value, "Restored text"),
  );

  renderMap([]);
}

init();
