import "dotenv/config";
import path from "node:path";
import { boolFromEnv, intFromEnv } from "./utils.js";

function trimTrailingSlash(value) {
  return value?.replace(/\/+$/, "");
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig() {
  const apiBaseUrl = trimTrailingSlash(required("CONFLUENCE_API_BASE_URL"));
  const siteUrl = trimTrailingSlash(process.env.CONFLUENCE_SITE_URL?.trim() || apiBaseUrl);

  return {
    apiBaseUrl,
    siteUrl,
    email: required("CONFLUENCE_EMAIL"),
    apiToken: required("CONFLUENCE_API_TOKEN"),
    spaceKey: required("CONFLUENCE_SPACE_KEY"),
    outputDir: path.resolve(process.env.OUTPUT_DIR?.trim() || "confluence-export"),
    cleanOutput: boolFromEnv(process.env.CLEAN_OUTPUT, true),
    downloadAttachments: boolFromEnv(process.env.DOWNLOAD_ATTACHMENTS, true),
    extractAttachmentText: boolFromEnv(process.env.EXTRACT_ATTACHMENT_TEXT, true),
    includeComments: boolFromEnv(process.env.INCLUDE_COMMENTS, true),
    includeBlogPosts: boolFromEnv(process.env.INCLUDE_BLOG_POSTS, true),
    chunkSizeTokens: intFromEnv(process.env.CHUNK_SIZE_TOKENS, 900, { min: 100, max: 8000 }),
    chunkOverlapTokens: intFromEnv(process.env.CHUNK_OVERLAP_TOKENS, 120, { min: 0, max: 2000 }),
  };
}
