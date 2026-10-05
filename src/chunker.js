import { normalizeWhitespace } from "./utils.js";

function splitSections(markdown) {
  const lines = String(markdown || "").split("\n");
  const sections = [];
  let heading = "Document";
  let body = [];

  const flush = () => {
    const text = normalizeWhitespace(body.join("\n"));
    if (text) sections.push({ heading, text });
    body = [];
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      heading = match[2].trim();
    } else {
      body.push(line);
    }
  }

  flush();
  return sections;
}

function chunkText(text, maxChars, overlapChars) {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n\n+/).filter(Boolean);
  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    const value = current.trim();
    if (!value) return;
    chunks.push(value);
    current = overlapChars > 0 ? value.slice(-overlapChars) : "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current.trim()) pushCurrent();
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(paragraph.length, start + maxChars);
        chunks.push(paragraph.slice(start, end).trim());
        if (end === paragraph.length) break;
        start = Math.max(start + 1, end - overlapChars);
      }
      current = "";
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current.trim()) {
      pushCurrent();
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function chunkDocument(markdown, metadata, options = {}) {
  const maxChars = Math.max(400, (options.chunkSizeTokens ?? 900) * 4);
  const overlapChars = Math.min(maxChars - 1, Math.max(0, (options.chunkOverlapTokens ?? 120) * 4));
  const chunks = [];
  let sequence = 1;

  for (const section of splitSections(markdown)) {
    const pieces = chunkText(section.text, maxChars, overlapChars);
    for (const text of pieces) {
      chunks.push({
        ...metadata,
        chunkId: `${metadata.documentId}:${String(sequence).padStart(4, "0")}`,
        sequence,
        section: section.heading,
        text,
      });
      sequence += 1;
    }
  }

  return chunks;
}
