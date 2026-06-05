// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanText, maskValue } from "../src/scanner.js";

test("maskValue hides short values entirely and partially reveals long ones", () => {
  assert.equal(maskValue("secret"), "••••••");
  const masked = maskValue("sk-abcdefghijklmnop");
  assert.ok(masked.startsWith("sk-"));
  assert.ok(masked.endsWith("chars)"));
  assert.ok(!masked.includes("defghij"));
});

test("scanText reports the correct line and column", () => {
  const text = ["const a = 1;", "// nothing here", "const key = 'AKIAIOSFODNN7EXAMPLE';"].join(
    "\n",
  );
  const findings = scanText(text);
  const aws = findings.find((f) => f.type === "AWS_ACCESS_KEY");
  assert.ok(aws, "should detect the AWS key");
  assert.equal(aws.line, 3);
  // column points at the start of AKIA... inside the quotes
  assert.equal(text.split("\n")[2][aws.column - 1], "A");
});

test("scanText never returns the raw secret, only a masked preview", () => {
  const findings = scanText("token = ghp_" + "a".repeat(36));
  assert.ok(findings.length >= 1);
  for (const f of findings) {
    assert.ok(!f.preview.includes("aaaaaaaa"));
    assert.ok(typeof f.length === "number" && f.length > 0);
  }
});

test("scanText returns an empty array for clean text", () => {
  assert.deepEqual(scanText("just some ordinary words"), []);
});

test("scanText finds multiple secrets across lines", () => {
  const text = "email a@b.com\nip 10.0.0.1\nkey sk-abcdefghijklmnopqrstuvwx";
  const findings = scanText(text);
  const lines = findings.map((f) => f.line).sort((a, b) => a - b);
  assert.deepEqual([...new Set(lines)], [1, 2, 3]);
});
