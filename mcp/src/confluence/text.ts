const BLOCK_TAGS = /<\/?(?:p|div|section|article|h[1-6]|tr|table|ul|ol|pre|blockquote)[^>]*>/gi;
const BREAK_TAGS = /<(?:br|hr)\s*\/?\s*>/gi;
const LI_OPEN = /<li[^>]*>/gi;
const LI_CLOSE = /<\/li>/gi;
const TD_CLOSE = /<\/(?:td|th)>/gi;
const TAGS = /<[^>]+>/g;

export function storageToText(storage: string): string {
  if (!storage) return '';
  return decodeEntities(
    storage
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(BREAK_TAGS, '\n')
      .replace(LI_OPEN, '\n- ')
      .replace(LI_CLOSE, '\n')
      .replace(TD_CLOSE, '\t')
      .replace(BLOCK_TAGS, '\n')
      .replace(TAGS, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function truncateText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return {
    text: `${value.slice(0, maxChars)}\n\n[Content truncated by MCP_MAX_CONTENT_CHARS]`,
    truncated: true
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => safeCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => safeCodePoint(Number.parseInt(code, 16)));
}

function safeCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}
