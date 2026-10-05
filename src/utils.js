import fs from "node:fs";
import path from "node:path";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeFilename(value = "") {
  const cleaned = String(value)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || "untitled").slice(0, 180);
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function emptyDir(dir) {
  const resolved = path.resolve(dir);
  const root = path.parse(resolved).root;
  const cwd = path.resolve(process.cwd());

  if (resolved === root || resolved === cwd) {
    throw new Error(`Refusing to clean unsafe output directory: ${resolved}`);
  }

  fs.rmSync(resolved, { recursive: true, force: true });
  ensureDir(resolved);
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeJsonl(filePath, records) {
  ensureDir(path.dirname(filePath));
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  fs.writeFileSync(filePath, body ? `${body}\n` : "", "utf8");
}

export function boolFromEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function intFromEnv(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function extensionOf(filename = "") {
  return path.extname(filename).toLowerCase();
}

export function normalizeWhitespace(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeXmlEntities(value = "") {
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function getNextLinkFromHeader(linkHeader) {
  if (!linkHeader) return null;

  for (const part of String(linkHeader).split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match) return match[1];
  }

  return null;
}
