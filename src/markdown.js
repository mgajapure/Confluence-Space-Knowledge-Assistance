import TurndownService from "turndown";
import { gfm } from "@truto/turndown-plugin-gfm";
import { normalizeWhitespace } from "./utils.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

turndown.use(gfm);

turndown.addRule("confluenceStructuredMacro", {
  filter: (node) => node.nodeName === "AC:STRUCTURED-MACRO",
  replacement: (_content, node) => {
    const name = node.getAttribute?.("ac:name") || "macro";
    return `\n\n> [Confluence macro: ${name}]\n\n`;
  },
});

export function htmlToMarkdown(html = "") {
  if (!html) return "";
  return normalizeWhitespace(turndown.turndown(html));
}

export function storageValue(item) {
  return item?.body?.storage?.value ?? "";
}
