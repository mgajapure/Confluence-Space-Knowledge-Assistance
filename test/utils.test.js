import test from "node:test";
import assert from "node:assert/strict";
import { boolFromEnv, decodeXmlEntities, getNextLinkFromHeader, safeFilename } from "../src/utils.js";

test("safeFilename removes characters invalid on common file systems", () => {
  assert.equal(safeFilename('A/B:C*D?E"F<G>H|I'), "A_B_C_D_E_F_G_H_I");
});

test("boolFromEnv parses common true and false values", () => {
  assert.equal(boolFromEnv("true", false), true);
  assert.equal(boolFromEnv("0", true), false);
});

test("getNextLinkFromHeader extracts rel=next URL", () => {
  const header = '<https://example.test/api?cursor=abc>; rel="next", <https://example.test/api?cursor=xyz>; rel="prev"';
  assert.equal(getNextLinkFromHeader(header), "https://example.test/api?cursor=abc");
});

test("decodeXmlEntities decodes basic and numeric entities", () => {
  assert.equal(decodeXmlEntities("A &amp; B &#x26; C &#38; D"), "A & B & C & D");
});
