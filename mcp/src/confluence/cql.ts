export type SearchContentType = 'page' | 'blogpost' | 'all';

export interface SearchCqlInput {
  spaceKey: string;
  query?: string;
  title?: string;
  label?: string;
  contentType?: SearchContentType;
}

export function buildSearchCql(input: SearchCqlInput): string {
  const clauses = [`space = "${escapeCqlLiteral(input.spaceKey)}"`];
  const type = input.contentType ?? 'page';
  if (type === 'all') clauses.push('(type = page OR type = blogpost)');
  else clauses.push(`type = ${type}`);

  if (input.query?.trim()) clauses.push(`text ~ "${escapeCqlLiteral(input.query.trim())}"`);
  if (input.title?.trim()) clauses.push(`title ~ "${escapeCqlLiteral(input.title.trim())}"`);
  if (input.label?.trim()) clauses.push(`label = "${escapeCqlLiteral(input.label.trim())}"`);
  return clauses.join(' AND ');
}

export function buildExactTitleCql(spaceKey: string, title: string): string {
  return `space = "${escapeCqlLiteral(spaceKey)}" AND type = page AND title = "${escapeCqlLiteral(title)}"`;
}

export function buildRecentCql(spaceKey: string, days: number): string {
  return `space = "${escapeCqlLiteral(spaceKey)}" AND type = page AND lastmodified >= now("-${days}d") ORDER BY lastmodified DESC`;
}

export function buildDescendantsCql(spaceKey: string, ancestorPageId: string): string {
  if (!/^\d+$/.test(ancestorPageId)) throw new Error('ancestorPageId must be numeric');
  return `space = "${escapeCqlLiteral(spaceKey)}" AND type = page AND ancestor = ${ancestorPageId}`;
}

export function escapeCqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
