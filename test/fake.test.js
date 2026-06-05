// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, restore } from "../src/redactor.js";
import { isValidCPF, isValidCNPJ, luhn } from "../src/detectors.js";

test("fake strategy is deterministic for the same seed", () => {
  const input = "mail ada@example.com cpf 529.982.247-25 card 4111 1111 1111 1111";
  const a = redact(input, { strategy: "fake", seed: 7 }).text;
  const b = redact(input, { strategy: "fake", seed: 7 }).text;
  assert.equal(a, b);
});

test("different seeds produce different fakes", () => {
  const input = "mail ada@example.com";
  const a = redact(input, { strategy: "fake", seed: 1 }).text;
  const b = redact(input, { strategy: "fake", seed: 2 }).text;
  assert.notEqual(a, b);
});

test("fake CPF and CNPJ pass their real check digits", () => {
  const { items } = redact("cpf 529.982.247-25 cnpj 11.222.333/0001-81", {
    strategy: "fake",
    seed: 3,
  });
  const cpf = items.find((i) => i.type === "CPF");
  const cnpj = items.find((i) => i.type === "CNPJ");
  assert.ok(cpf && isValidCPF(cpf.placeholder), "fake CPF must be valid");
  assert.ok(cnpj && isValidCNPJ(cnpj.placeholder), "fake CNPJ must be valid");
  // and it must NOT be the original
  assert.notEqual(cpf.placeholder, "529.982.247-25");
});

test("fake credit card passes Luhn and preserves separator layout", () => {
  const { items, text } = redact("card 4111 1111 1111 1111", {
    strategy: "fake",
    seed: 9,
  });
  const card = items.find((i) => i.type === "CREDIT_CARD");
  assert.ok(card);
  assert.ok(luhn(card.placeholder), "fake card must pass Luhn");
  assert.notEqual(card.placeholder, "4111 1111 1111 1111");
  // same grouping (three spaces) and same brand digit
  assert.equal((card.placeholder.match(/ /g) || []).length, 3);
  assert.equal(card.placeholder[0], "4");
  assert.ok(text.includes(card.placeholder));
});

test("fake email looks like an email", () => {
  const { items } = redact("write to ada.lovelace@acme.com", {
    strategy: "fake",
    seed: 5,
  });
  const email = items.find((i) => i.type === "EMAIL");
  assert.ok(email);
  assert.match(email.placeholder, /^[^\s@]+@[^\s@]+\.[a-z]+$/);
  assert.notEqual(email.placeholder, "ada.lovelace@acme.com");
});

test("fake API key keeps its recognizable prefix", () => {
  const { items } = redact("key sk-proj-ABCdef1234567890ghijklmnop", {
    strategy: "fake",
    seed: 2,
  });
  const k = items.find((i) => i.type === "OPENAI_KEY");
  assert.ok(k);
  assert.ok(k.placeholder.startsWith("sk-proj-"));
  assert.equal(k.placeholder.length, "sk-proj-ABCdef1234567890ghijklmnop".length);
  assert.notEqual(k.placeholder, "sk-proj-ABCdef1234567890ghijklmnop");
});

test("fake strategy stays consistent: same value -> same fake", () => {
  const { text } = redact("a@x.com then a@x.com again", {
    strategy: "fake",
    seed: 1,
  });
  const fakes = text.match(/[^\s]+@[^\s]+/g) || [];
  assert.equal(fakes.length, 2);
  assert.equal(fakes[0], fakes[1]);
});

test("fake strategy round-trips with restore", () => {
  const original = "ada@example.com paid with 4111 1111 1111 1111, cpf 529.982.247-25";
  const { text, map } = redact(original, { strategy: "fake", seed: 4 });
  assert.notEqual(text, original);
  assert.equal(restore(text, map), original);
});

test("mask strategy hides values and is not added to the restore map", () => {
  const { text, map } = redact("email ada@example.com", { strategy: "mask" });
  assert.ok(text.includes("•"));
  assert.ok(!text.includes("ada@example.com"));
  assert.deepEqual(map, {});
});

test("default strategy is still placeholder (backward compatible)", () => {
  assert.equal(redact("ada@example.com").text, "[[EMAIL_1]]");
});
