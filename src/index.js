import path from "node:path";
import { loadConfig } from "./config.js";
import { createHttpClient } from "./http.js";
import { ConfluenceClient } from "./confluence.js";
import { exportSpace } from "./exporter.js";
import { emptyDir, ensureDir } from "./utils.js";

async function main() {
  const config = loadConfig();

  if (config.cleanOutput) emptyDir(config.outputDir);
  else ensureDir(config.outputDir);

  const { request } = createHttpClient(config);
  const confluence = new ConfluenceClient(config, request);

  console.log("==================================================");
  console.log(" Confluence Space -> AI Knowledge Base Export");
  console.log("==================================================");
  console.log(`Space key: ${config.spaceKey}`);
  console.log(`API base: ${config.apiBaseUrl}`);
  console.log(`Output: ${config.outputDir}`);
  console.log("");

  const result = await exportSpace({ config, confluence });

  console.log("\n==================================================");
  console.log(" EXPORT COMPLETED");
  console.log("==================================================");
  console.log(`Space: ${result.space.name} (${result.space.key})`);
  console.log(`Pages: ${result.pages.length}`);
  console.log(`Blog posts: ${result.blogPosts.length}`);
  console.log(`Records: ${result.records.length}`);
  console.log(`AI chunks: ${result.chunks.length}`);
  console.log(`Knowledge JSONL: ${path.join(config.outputDir, "knowledge_base.jsonl")}`);
  console.log(`Chunks JSONL: ${path.join(config.outputDir, "chunks.jsonl")}`);
}

main().catch((error) => {
  console.error("\nExport failed.");
  if (error.response) {
    console.error(`HTTP status: ${error.response.status}`);
    const responseBody = error.response.data;
    if (typeof responseBody === "string") console.error(responseBody);
    else if (responseBody && typeof responseBody.pipe !== "function") console.error(JSON.stringify(responseBody, null, 2));
  } else {
    console.error(error.stack || error.message || error);
  }
  process.exitCode = 1;
});
