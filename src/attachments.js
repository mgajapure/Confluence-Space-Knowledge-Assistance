import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { decodeXmlEntities, ensureDir, extensionOf, normalizeWhitespace, safeFilename } from "./utils.js";
import { htmlToMarkdown } from "./markdown.js";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".log", ".sql", ".properties"]);

export async function saveAttachmentStream(response, outputDir, contentId, attachment) {
  const attachmentDir = path.join(outputDir, "attachments", String(contentId));
  ensureDir(attachmentDir);

  const filename = safeFilename(attachment.title || `attachment-${attachment.id}`);
  const targetPath = path.join(attachmentDir, filename);

  await pipeline(response.data, fs.createWriteStream(targetPath));
  return targetPath;
}

export async function extractAttachmentText(filePath, mediaType = "") {
  const ext = extensionOf(filePath);

  try {
    if (TEXT_EXTENSIONS.has(ext)) {
      return { supported: true, text: normalizeWhitespace(fs.readFileSync(filePath, "utf8")), parser: "text" };
    }

    if (ext === ".html" || ext === ".htm" || mediaType.includes("text/html")) {
      return { supported: true, text: htmlToMarkdown(fs.readFileSync(filePath, "utf8")), parser: "turndown" };
    }

    if (ext === ".pdf" || mediaType.includes("application/pdf")) {
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: buffer, CanvasFactory });
      try {
        const result = await parser.getText();
        return { supported: true, text: normalizeWhitespace(result.text || ""), parser: "pdf-parse" };
      } finally {
        await parser.destroy();
      }
    }

    if (ext === ".docx" || mediaType.includes("wordprocessingml")) {
      const result = await mammoth.extractRawText({ path: filePath });
      return { supported: true, text: normalizeWhitespace(result.value || ""), parser: "mammoth" };
    }

    if (ext === ".xlsx" || mediaType.includes("spreadsheetml")) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const sections = [];
      workbook.eachSheet((worksheet) => {
        const rows = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          const values = row.values
            .slice(1)
            .map((value, index) => row.getCell(index + 1).text || String(value ?? ""));
          rows.push(values.join("\t"));
        });
        sections.push(`# Sheet: ${worksheet.name}\n\n${rows.join("\n")}`);
      });

      return { supported: true, text: normalizeWhitespace(sections.join("\n\n")), parser: "exceljs" };
    }

    if (ext === ".pptx" || mediaType.includes("presentationml")) {
      const buffer = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(buffer);
      const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)/i)?.[1] ?? 0));

      const slides = [];
      for (const [index, slideName] of slideNames.entries()) {
        const xml = await zip.file(slideName).async("string");
        const pieces = [];
        const regex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi;
        let match;
        while ((match = regex.exec(xml)) !== null) {
          pieces.push(decodeXmlEntities(match[1]));
        }
        slides.push(`# Slide ${index + 1}\n\n${pieces.join("\n")}`);
      }

      return { supported: true, text: normalizeWhitespace(slides.join("\n\n")), parser: "jszip-pptx" };
    }

    return { supported: false, text: "", parser: null };
  } catch (error) {
    return { supported: false, text: "", parser: null, error: error.message };
  }
}
