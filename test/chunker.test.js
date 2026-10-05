import test from "node:test";
import assert from "node:assert/strict";
import { chunkDocument } from "../src/chunker.js";

test("chunkDocument keeps heading metadata and sequential chunk IDs", () => {
  const markdown = `# Architecture\n\n${"A".repeat(900)}\n\n## API\n\n${"B".repeat(900)}`;
  const chunks = chunkDocument(markdown, {
    documentId: "page:123",
    title: "Architecture",
  }, {
    chunkSizeTokens: 100,
    chunkOverlapTokens: 10,
  });

  assert.ok(chunks.length >= 4);
  assert.equal(chunks[0].chunkId, "page:123:0001");
  assert.ok(chunks.some((chunk) => chunk.section === "API"));
});
