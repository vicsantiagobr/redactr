// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../src/redactor.js";
import { luhn, isValidCPF, isValidCNPJ } from "../src/detectors.js";

test("luhn validates real card numbers and rejects bad ones", () => {
  assert.ok(luhn("4111 1111 1111 1111"));
  assert.ok(luhn("5500005555555559"));
  assert.ok(!luhn("4111 1111 1111 1112"));
  assert.ok(!luhn("1234"));
});

test("CPF validator", () => {
  assert.ok(isValidCPF("529.982.247-25"));
  assert.ok(!isValidCPF("111.111.111-11"));
  assert.ok(!isValidCPF("529.982.247-20"));
});

test("CNPJ validator", () => {
  assert.ok(isValidCNPJ("11.222.333/0001-81"));
  assert.ok(!isValidCNPJ("11.222.333/0001-80"));
});

/**
 * Helper: redact a string and return the set of detected types.
 * @param {string} text
 */
function typesOf(text) {
  return new Set(redact(text).items.map((i) => i.type));
}

test("detects an email", () => {
  assert.ok(typesOf("ping ada@example.com please").has("EMAIL"));
});

test("detects an OpenAI key but not an Anthropic one as OPENAI_KEY", () => {
  const a = typesOf("key=sk-abcdefghijklmnopqrstuvwxyz0123");
  assert.ok(a.has("OPENAI_KEY"));
  const b = typesOf("key=sk-ant-abcdefghijklmnopqrstuvwxyz0123");
  assert.ok(b.has("ANTHROPIC_KEY"));
  assert.ok(!b.has("OPENAI_KEY"));
});

test("detects AWS access key id and GitHub token", () => {
  const t = typesOf("AKIAIOSFODNN7EXAMPLE and ghp_" + "a".repeat(36));
  assert.ok(t.has("AWS_ACCESS_KEY"));
  assert.ok(t.has("GITHUB_TOKEN"));
});

test("detects a JWT", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  assert.ok(typesOf("token " + jwt).has("JWT"));
});

test("detects a private key block", () => {
  const pem =
    "-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqhkiG9w0\n-----END PRIVATE KEY-----";
  assert.ok(typesOf(pem).has("PRIVATE_KEY"));
});

test("detects credit cards only when Luhn-valid", () => {
  assert.ok(typesOf("card 4111 1111 1111 1111").has("CREDIT_CARD"));
  assert.ok(!typesOf("order 4111 1111 1111 1112").has("CREDIT_CARD"));
});

test("detects CPF/CNPJ only when check digits are valid", () => {
  assert.ok(typesOf("cpf 529.982.247-25").has("CPF"));
  assert.ok(!typesOf("cpf 529.982.247-20").has("CPF"));
  assert.ok(typesOf("cnpj 11.222.333/0001-81").has("CNPJ"));
});

test("detects IPv4 and a URL with credentials", () => {
  assert.ok(typesOf("server 192.168.1.10").has("IPV4"));
  assert.ok(
    typesOf("postgres://user:s3cr3t@db.example.com:5432/app").has(
      "URL_CREDENTIALS",
    ),
  );
});

test("secret assignment redacts only the value, not the key", () => {
  const { text } = redact('password = "hunter2pass"');
  assert.ok(text.includes("password"));
  assert.ok(!text.includes("hunter2pass"));
});

test("bearer token redacts only the token", () => {
  const { text } = redact("Authorization: Bearer abcdef0123456789xyz");
  assert.ok(text.includes("Bearer"));
  assert.ok(!text.includes("abcdef0123456789xyz"));
});
