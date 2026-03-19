import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeJson, hashJson } from "../src/utils/hash.js";

test("canonicalizeJson sorts object keys deterministically", () => {
  const a = canonicalizeJson({ z: 1, a: { y: 2, x: 3 } });
  const b = canonicalizeJson({ a: { x: 3, y: 2 }, z: 1 });
  assert.equal(a, b);
});

test("hashJson is stable for semantically identical objects", () => {
  assert.equal(hashJson({ b: 2, a: 1 }), hashJson({ a: 1, b: 2 }));
});
