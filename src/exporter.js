import fs from "node:fs";
import path from "node:path";
import { htmlToMarkdown, storageValue } from "./markdown.js";
import { chunkDocument } from "./chunker.js";
import { extractAttachmentText, saveAttachmentStream } from "./attachments.js";
import { ensureDir, safeFilename, writeJson, writeJsonl } from "./utils.js";

function buildSourceUrl(siteUrl, relativeUrl) {
  if (!relativeUrl) return null;
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  if (relativeUrl.startsWith("/wiki")) return `${siteUrl}${relativeUrl}`;
  return `${siteUrl}/wiki${relativeUrl.startsWith("/") ? "" : "/"}${relativeUrl}`;
}

function createPageMap(pages) {
  return new Map(pages.map((page) => [String(page.id), page]));
}

function buildHierarchy(item, pageMap) {
  const hierarchy = [];
  const visited = new Set();
  let current = item;

  while (current?.parentId && !visited.has(String(current.parentId))) {
    visited.add(String(current.parentId));
    const parent = pageMap.get(String(current.parentId));
    if (!parent) break;
    hierarchy.unshift({ id: String(parent.id), title: parent.title });
    current = parent;
  }

  return hierarchy;
}

async function convertComment(confluence, comment, commentType) {
  const childrenRaw = await confluence.getChildComments(comment.id, commentType);
  const children = [];

  for (const child of childrenRaw) {
    children.push(await convertComment(confluence, child, commentType));
  }

  return {
    id: String(comment.id),
    text: htmlToMarkdown(storageValue(comment)),
    status: comment.status ?? null,
    resolutionStatus: comment.resolutionStatus ?? null,
    originalSelection: comment.properties?.inlineOriginalSelection ?? null,
    authorId: comment.version?.authorId ?? null,
    version: comment.version?.number ?? null,
    createdAt: comment.version?.createdAt ?? null,
    children,
  };
}

async function getAllComments(confluence, type, contentId) {
  const footerRaw = await confluence.getRootComments(type, contentId, "footer");
  const inlineRaw = await confluence.getRootComments(type, contentId, "inline");

  const footer = [];
  for (const comment of footerRaw) footer.push(await convertComment(confluence, comment, "footer"));

  const inline = [];
  for (const comment of inlineRaw) inline.push(await convertComment(confluence, comment, "inline"));

  return { footer, inline };
}

function commentTextForMarkdown(comments) {
  const lines = [];

  function appendComment(comment, depth = 0) {
    const prefix = depth ? `${"  ".repeat(depth)}- ` : "- ";
    if (comment.originalSelection) lines.push(`${prefix}Referenced text: ${comment.originalSelection}`);
    if (comment.text) lines.push(`${prefix}${comment.text.replace(/\n/g, " ")}`);
    for (const child of comment.children ?? []) appendComment(child, depth + 1);
  }

  for (const comment of comments.footer ?? []) appendComment(comment);
  for (const comment of comments.inline ?? []) appendComment(comment);

  return lines.join("\n");
}

export async function exportSpace({ config, confluence }) {
  const pagesDir = path.join(config.outputDir, "pages");
  const blogsDir = path.join(config.outputDir, "blogposts");
  ensureDir(pagesDir);
  ensureDir(blogsDir);

  console.log(`Looking up Confluence space: ${config.spaceKey}`);
  const space = await confluence.getSpace();
  console.log(`Space found: ${space.name} (${space.key}), ID=${space.id}`);

  console.log("Retrieving pages...");
  const pages = await confluence.getPages(space.id);
  console.log(`Found ${pages.length} pages.`);
  const pageMap = createPageMap(pages);

  let blogPosts = [];
  if (config.includeBlogPosts) {
    console.log("Retrieving blog posts...");
    blogPosts = await confluence.getBlogPosts(space.id);
    console.log(`Found ${blogPosts.length} blog posts.`);
  }

  const records = [];
  const chunks = [];

  async function processItem(item, type, index, total) {
    console.log(`[${type} ${index}/${total}] ${item.title}`);
    const detail = await confluence.getContentDetails(type, item.id);
    const storageHtml = storageValue(detail);
    const markdown = htmlToMarkdown(storageHtml);
    const hierarchy = type === "page" ? buildHierarchy(item, pageMap) : [];
    const labels = detail.labels?.results?.map((label) => label.name).filter(Boolean) ?? [];
    const sourceUrl = buildSourceUrl(config.siteUrl, detail?._links?.webui || item?._links?.webui);

    let comments = { footer: [], inline: [] };
    if (config.includeComments) {
      try {
        comments = await getAllComments(confluence, type, item.id);
      } catch (error) {
        console.warn(`  Comments skipped: ${error.message}`);
      }
    }

    const attachmentRecords = [];
    let attachments = [];
    try {
      attachments = await confluence.getAttachments(type, item.id);
    } catch (error) {
      console.warn(`  Attachment listing skipped: ${error.message}`);
    }

    for (const attachment of attachments) {
      const attachmentRecord = {
        id: String(attachment.id),
        filename: attachment.title,
        mediaType: attachment.mediaType ?? null,
        fileSize: attachment.fileSize ?? null,
        version: attachment.version?.number ?? null,
        createdAt: attachment.createdAt ?? null,
        localPath: null,
        extraction: null,
      };

      if (config.downloadAttachments) {
        try {
          console.log(`  Downloading: ${attachment.title}`);
          const response = await confluence.downloadAttachment(item.id, attachment.id);
          attachmentRecord.localPath = await saveAttachmentStream(response, config.outputDir, item.id, attachment);

          if (config.extractAttachmentText && attachmentRecord.localPath) {
            const extracted = await extractAttachmentText(attachmentRecord.localPath, attachment.mediaType ?? "");
            attachmentRecord.extraction = {
              supported: extracted.supported,
              parser: extracted.parser ?? null,
              error: extracted.error ?? null,
              text: extracted.text ?? "",
            };

            if (extracted.text) {
              const attachmentChunks = chunkDocument(extracted.text, {
                source: "confluence-attachment",
                documentId: `attachment:${attachment.id}`,
                contentType: "attachment",
                pageId: String(item.id),
                attachmentId: String(attachment.id),
                title: attachment.title,
                parentTitle: detail.title,
                url: sourceUrl,
                spaceKey: space.key,
              }, config);
              chunks.push(...attachmentChunks);
            }
          }
        } catch (error) {
          attachmentRecord.error = error.message;
          console.warn(`  Attachment failed: ${attachment.title}: ${error.message}`);
        }
      }

      attachmentRecords.push(attachmentRecord);
    }

    const record = {
      source: "confluence",
      space: { id: String(space.id), key: space.key, name: space.name },
      contentType: type,
      id: String(item.id),
      title: detail.title,
      parentId: detail.parentId != null ? String(detail.parentId) : null,
      hierarchy,
      url: sourceUrl,
      labels,
      status: detail.status ?? null,
      authorId: detail.authorId ?? null,
      createdAt: detail.createdAt ?? null,
      version: {
        number: detail.version?.number ?? null,
        createdAt: detail.version?.createdAt ?? null,
        authorId: detail.version?.authorId ?? null,
        message: detail.version?.message ?? null,
      },
      content: { markdown, storage: storageHtml },
      comments,
      attachments: attachmentRecords,
    };

    const outputDir = type === "page" ? pagesDir : blogsDir;
    const baseName = `${item.id}_${safeFilename(item.title)}`;
    writeJson(path.join(outputDir, `${baseName}.json`), record);

    const header = [
      `# ${detail.title}`,
      "",
      `**Space:** ${space.name} (${space.key})`,
      `**Confluence ID:** ${item.id}`,
      sourceUrl ? `**Source:** ${sourceUrl}` : null,
      hierarchy.length ? `**Hierarchy:** ${[...hierarchy.map((h) => h.title), detail.title].join(" > ")}` : null,
      labels.length ? `**Labels:** ${labels.join(", ")}` : null,
      "",
      "---",
      "",
    ].filter((line) => line !== null);

    let markdownFile = `${header.join("\n")}${markdown}`;
    const commentsMarkdown = commentTextForMarkdown(comments);
    if (commentsMarkdown) markdownFile += `\n\n## Confluence Comments\n\n${commentsMarkdown}`;
    if (attachmentRecords.length) {
      markdownFile += `\n\n## Attachments\n\n${attachmentRecords.map((a) => `- ${a.filename}`).join("\n")}`;
    }
    fs.writeFileSync(path.join(outputDir, `${baseName}.md`), `${markdownFile.trim()}\n`, "utf8");

    chunks.push(...chunkDocument(markdown, {
      source: "confluence-page",
      documentId: `${type}:${item.id}`,
      contentType: type,
      pageId: String(item.id),
      title: detail.title,
      url: sourceUrl,
      spaceKey: space.key,
      hierarchy: hierarchy.map((h) => h.title),
      version: detail.version?.number ?? null,
    }, config));

    if (commentsMarkdown) {
      chunks.push(...chunkDocument(`# Comments\n\n${commentsMarkdown}`, {
        source: "confluence-comment",
        documentId: `comments:${item.id}`,
        contentType: "comment",
        pageId: String(item.id),
        title: `${detail.title} - Comments`,
        parentTitle: detail.title,
        url: sourceUrl,
        spaceKey: space.key,
      }, config));
    }

    records.push(record);
  }

  for (let i = 0; i < pages.length; i += 1) {
    try {
      await processItem(pages[i], "page", i + 1, pages.length);
    } catch (error) {
      console.error(`Page failed: ${pages[i].title}: ${error.message}`);
    }
  }

  for (let i = 0; i < blogPosts.length; i += 1) {
    try {
      await processItem(blogPosts[i], "blogpost", i + 1, blogPosts.length);
    } catch (error) {
      console.error(`Blog post failed: ${blogPosts[i].title}: ${error.message}`);
    }
  }

  writeJson(path.join(config.outputDir, "knowledge_base.json"), records);
  writeJsonl(path.join(config.outputDir, "knowledge_base.jsonl"), records);
  writeJsonl(path.join(config.outputDir, "chunks.jsonl"), chunks);
  writeJson(path.join(config.outputDir, "export_summary.json"), {
    exportedAt: new Date().toISOString(),
    space: { id: String(space.id), key: space.key, name: space.name },
    pageCount: pages.length,
    blogPostCount: blogPosts.length,
    recordCount: records.length,
    chunkCount: chunks.length,
  });

  return { space, pages, blogPosts, records, chunks };
}
