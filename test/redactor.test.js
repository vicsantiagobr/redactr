// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, restore, listDetectors } from "../src/redactor.js";

test("redact + restore is a perfect round-trip", () => {
  const original =
    "Hi, I'm ada@example.com, my key is sk-abcdefghijklmnopqrstuvwx and ip 10.0.0.1.";
  const { text, map } = redact(original);
  assert.notEqual(text, original);
  assert.equal(restore(text, map), original);
});

test("the same value always gets the same placeholder", () => {
  const { text, items } = redact("a@x.com talked to a@x.com and b@x.com");
  // a@x.com appears twice -> one item with count 2
  const a = items.find((i) => i.value === "a@x.com");
  assert.ok(a);
  assert.equal(a.count, 2);
  // and exactly one placeholder for it, used twice
  const ph = a.placeholder;
  assert.equal(text.split(ph).length - 1, 2);
});

test("distinct values get distinct numbered placeholders", () => {
  const { map } = redact("a@x.com and b@x.com");
  assert.ok(Object.keys(map).includes("[[EMAIL_1]]"));
  assert.ok(Object.keys(map).includes("[[EMAIL_2]]"));
});

test("restore replaces longer placeholders first (no _1 vs _11 clobber)", () => {
  const map = { "[[EMAIL_1]]": "one@x.com", "[[EMAIL_11]]": "eleven@x.com" };
  const out = restore("[[EMAIL_11]] and [[EMAIL_1]]", map);
  assert.equal(out, "eleven@x.com and one@x.com");
});

test("higher-priority detector wins an overlap", () => {
  // A URL with credentials contains an email-like host; URL_CREDENTIALS
  // (priority 75) should win over EMAIL (priority 50).
  const { items } = redact("redis://user:pass@cache.example.com:6379");
  const types = items.map((i) => i.type);
  assert.ok(types.includes("URL_CREDENTIALS"));
  assert.ok(!types.includes("EMAIL"));
});

test("enable option runs only the requested detectors", () => {
  const { items } = redact("ada@example.com 10.0.0.1", { enable: ["EMAIL"] });
  assert.deepEqual(
    [...new Set(items.map((i) => i.type))],
    ["EMAIL"],
  );
});

test("disable option skips a detector", () => {
  const { items } = redact("ada@example.com 10.0.0.1", { disable: ["IPV4"] });
  const types = new Set(items.map((i) => i.type));
  assert.ok(types.has("EMAIL"));
  assert.ok(!types.has("IPV4"));
});

test("custom placeholder format is honored", () => {
  const { text } = redact("ada@example.com", {
    format: (type, n) => `<${type}#${n}>`,
  });
  assert.equal(text, "<EMAIL#1>");
});

test("stats and total reflect the number of redactions", () => {
  const { stats, total } = redact("a@x.com b@x.com 10.0.0.1");
  assert.equal(stats.EMAIL, 2);
  assert.equal(stats.IPV4, 1);
  assert.equal(total, 3);
});

test("clean text is returned unchanged with an empty map", () => {
  const text = "nothing sensitive here, just words.";
  const r = redact(text);
  assert.equal(r.text, text);
  assert.equal(r.total, 0);
  assert.deepEqual(r.map, {});
});

test("redact rejects non-string input", () => {
  // @ts-expect-error testing runtime guard
  assert.throws(() => redact(42), TypeError);
});

test("listDetectors returns type/label pairs", () => {
  const list = listDetectors();
  assert.ok(list.length > 10);
  assert.ok(list.every((d) => d.type && d.label));
});
