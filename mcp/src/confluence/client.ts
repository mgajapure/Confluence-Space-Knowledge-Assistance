import http from 'node:http';
import https from 'node:https';
import type { RequestOptions } from 'node:https';
import type { AppConfig } from '../config.js';
import { ConfluenceHttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { buildDescendantsCql, buildExactTitleCql, buildRecentCql, buildSearchCql, type SearchContentType } from './cql.js';
import { storageToText, truncateText } from './text.js';
import type { ConfluenceContent, ConfluencePaged, ConfluenceSpace, PageView } from './types.js';

const PAGE_META_EXPAND = 'version,space,ancestors,metadata.labels';
const PAGE_FULL_EXPAND = `body.storage,${PAGE_META_EXPAND}`;

export class ConfluenceClient {
  constructor(private readonly config: AppConfig) {}

  async getSpace(): Promise<ConfluenceSpace> {
    return this.getJson<ConfluenceSpace>(`/rest/api/space/${encodeURIComponent(this.config.confluence.spaceKey)}`, {
      expand: 'description.plain,homepage'
    });
  }

  async getPage(pageId: string, includeStorage = false): Promise<PageView> {
    const page = await this.getContent(pageId);
    this.assertSpace(page);
    return this.toPageView(page, includeStorage);
  }

  async getPageByTitle(title: string, includeStorage = false): Promise<PageView | null> {
    const result = await this.searchRaw(buildExactTitleCql(this.config.confluence.spaceKey, title), 5, 0, true);
    const exact = result.results.find((item) => item.title === title) ?? result.results[0];
    if (!exact) return null;
    this.assertSpace(exact);
    return this.toPageView(exact, includeStorage);
  }

  async search(input: {
    query?: string;
    title?: string;
    label?: string;
    contentType?: SearchContentType;
    limit: number;
    start: number;
    includeContent: boolean;
  }): Promise<{ items: PageView[]; start: number; limit: number; size: number; hasMore: boolean }> {
    const cql = buildSearchCql({
      spaceKey: this.config.confluence.spaceKey,
      ...(input.query ? { query: input.query } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.contentType ? { contentType: input.contentType } : {})
    });
    const response = await this.searchRaw(cql, input.limit, input.start, input.includeContent);
    return {
      items: response.results.map((item) => {
        this.assertSpace(item);
        return this.toPageView(item, false);
      }),
      start: response.start ?? input.start,
      limit: response.limit ?? input.limit,
      size: response.size ?? response.results.length,
      hasMore: Boolean(response._links?.next)
    };
  }

  async recentUpdates(days: number, limit: number, start: number): Promise<{ items: PageView[]; hasMore: boolean }> {
    const response = await this.searchRaw(buildRecentCql(this.config.confluence.spaceKey, days), limit, start);
    return {
      items: response.results.map((item) => {
        this.assertSpace(item);
        return this.toPageView(item, false);
      }),
      hasMore: Boolean(response._links?.next)
    };
  }

  async listChildren(pageId: string, limit: number, start: number): Promise<{ items: PageView[]; hasMore: boolean }> {
    await this.assertPageIdInSpace(pageId);
    const response = await this.getJson<ConfluencePaged<ConfluenceContent>>(
      `/rest/api/content/${encodeURIComponent(pageId)}/child/page`,
      { expand: PAGE_META_EXPAND, limit, start }
    );
    return {
      items: response.results.map((item) => {
        this.assertSpace(item);
        return this.toPageView(item, false);
      }),
      hasMore: Boolean(response._links?.next)
    };
  }

  async listAttachments(pageId: string, limit: number, start: number): Promise<{ items: unknown[]; hasMore: boolean }> {
    await this.assertPageIdInSpace(pageId);
    const response = await this.getJson<ConfluencePaged<ConfluenceContent>>(
      `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`,
      { expand: 'version,metadata.labels', limit, start }
    );
    return {
      items: response.results.map((item) => ({
        id: item.id,
        title: item.title ?? '',
        mediaType: item.extensions?.mediaType ?? item.metadata?.mediaType ?? '',
        fileSize: item.extensions?.fileSize,
        version: item.version?.number,
        updatedAt: item.version?.when,
        updatedBy: item.version?.by?.displayName,
        labels: item.metadata?.labels?.results?.map((label) => label.name).filter((name): name is string => Boolean(name)) ?? [],
        downloadUrl: this.absoluteUrl(item._links?.download),
        sourcePageId: pageId
      })),
      hasMore: Boolean(response._links?.next)
    };
  }

  async listComments(pageId: string, limit: number, start: number): Promise<{ items: unknown[]; hasMore: boolean }> {
    await this.assertPageIdInSpace(pageId);
    const response = await this.getJson<ConfluencePaged<ConfluenceContent>>(
      `/rest/api/content/${encodeURIComponent(pageId)}/child/comment`,
      { expand: 'body.storage,version,ancestors', limit, start }
    );
    return {
      items: response.results.map((item) => {
        const text = truncateText(storageToText(item.body?.storage?.value ?? ''), Math.min(this.config.mcp.maxContentChars, 20_000));
        return {
          id: item.id,
          type: item.type ?? 'comment',
          sourceUrl: this.absoluteUrl(item._links?.webui),
          version: item.version?.number,
          updatedAt: item.version?.when,
          updatedBy: item.version?.by?.displayName,
          text: text.text,
          truncated: text.truncated,
          ancestorIds: item.ancestors?.map((ancestor) => ancestor.id) ?? []
        };
      }),
      hasMore: Boolean(response._links?.next)
    };
  }

  async listDescendants(pageId: string, limit: number, start: number): Promise<{ items: PageView[]; hasMore: boolean }> {
    await this.assertPageIdInSpace(pageId);
    const response = await this.searchRaw(buildDescendantsCql(this.config.confluence.spaceKey, pageId), limit, start);
    return {
      items: response.results.map((item) => {
        this.assertSpace(item);
        return this.toPageView(item, false);
      }),
      hasMore: Boolean(response._links?.next)
    };
  }

  async getAttachmentExtractedText(pageId: string, attachmentId: string): Promise<{ pageId: string; attachmentId: string; extractedText: string; truncated: boolean }> {
    await this.assertPageIdInSpace(pageId);
    const response = await this.getJson<{ extractedText?: string }>(
      `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment/${encodeURIComponent(attachmentId)}/extractedtext`
    );
    const text = truncateText(response.extractedText ?? '', this.config.mcp.maxContentChars);
    return { pageId, attachmentId, extractedText: text.text, truncated: text.truncated };
  }

  private async getContent(pageId: string): Promise<ConfluenceContent> {
    return this.getJson<ConfluenceContent>(`/rest/api/content/${encodeURIComponent(pageId)}`, { expand: PAGE_FULL_EXPAND });
  }

  private async assertPageIdInSpace(pageId: string): Promise<void> {
    const page = await this.getContent(pageId);
    this.assertSpace(page);
  }

  private async searchRaw(cql: string, limit: number, start: number, includeBody = false): Promise<ConfluencePaged<ConfluenceContent>> {
    return this.getJson<ConfluencePaged<ConfluenceContent>>('/rest/api/content/search', {
      cql,
      limit,
      start,
      expand: includeBody ? PAGE_FULL_EXPAND : PAGE_META_EXPAND
    });
  }

  private assertSpace(content: ConfluenceContent): void {
    const actual = content.space?.key;
    if (actual !== this.config.confluence.spaceKey) {
      throw new Error(`Content ${content.id} belongs to space ${actual ?? 'unknown'}, not configured space ${this.config.confluence.spaceKey}`);
    }
  }

  private toPageView(content: ConfluenceContent, includeStorage: boolean): PageView {
    const raw = content.body?.storage?.value ?? '';
    const text = truncateText(storageToText(raw), this.config.mcp.maxContentChars);
    const storage = includeStorage ? truncateText(raw, this.config.mcp.maxContentChars) : undefined;
    const view: PageView = {
      id: content.id,
      type: content.type ?? 'page',
      title: content.title ?? '',
      spaceKey: content.space?.key ?? '',
      sourceUrl: this.absoluteUrl(content._links?.webui),
      labels: content.metadata?.labels?.results?.map((label) => label.name).filter((name): name is string => Boolean(name)) ?? [],
      ancestors: content.ancestors?.map((ancestor) => ({ id: ancestor.id, title: ancestor.title ?? '' })) ?? [],
      contentText: text.text,
      truncated: text.truncated || Boolean(storage?.truncated)
    };
    if (content.version?.number !== undefined) view.version = content.version.number;
    if (content.version?.when) view.updatedAt = content.version.when;
    if (content.version?.by?.displayName) view.updatedBy = content.version.by.displayName;
    if (includeStorage) view.storageFormat = storage?.text ?? '';
    return view;
  }

  private absoluteUrl(relative?: string): string {
    if (!relative) return '';
    if (/^https?:\/\//i.test(relative)) return relative;
    const base = this.config.confluence.siteUrl;
    if (relative.startsWith('/')) {
      const parsed = new URL(base);
      const contextPath = parsed.pathname.replace(/\/$/, '');
      if (contextPath && !relative.startsWith(`${contextPath}/`) && relative !== contextPath) {
        return `${parsed.origin}${contextPath}${relative}`;
      }
      return `${parsed.origin}${relative}`;
    }
    return `${base}/${relative}`;
  }

  private async getJson<T>(path: string, query?: Record<string, string | number | boolean>): Promise<T> {
    const url = new URL(`${this.config.confluence.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
    const body = await this.request(url);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ConfluenceHttpError('Confluence returned a non-JSON response. This often means SSO redirected the API request to a login page.', undefined, body.slice(0, 500));
    }
  }

  private request(url: URL): Promise<string> {
    const isHttps = url.protocol === 'https:';
    if (!isHttps && url.protocol !== 'http:') throw new Error(`Unsupported protocol: ${url.protocol}`);
    const transport = isHttps ? https : http;
    const headers = this.buildHeaders();

    const options: RequestOptions = {
      method: 'GET',
      protocol: url.protocol,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers,
      ...(url.port ? { port: url.port } : {})
    };
    if (isHttps) {
      Object.assign(options, {
        cert: this.config.confluence.tls.cert,
        key: this.config.confluence.tls.key,
        passphrase: this.config.confluence.tls.passphrase,
        ca: this.config.confluence.tls.ca,
        rejectUnauthorized: this.config.confluence.tls.rejectUnauthorized
      });
    }

    return new Promise<string>((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buffer.length;
          if (total > this.config.confluence.maxResponseBytes) {
            req.destroy(new Error(`Confluence response exceeded ${this.config.confluence.maxResponseBytes} bytes`));
            return;
          }
          chunks.push(buffer);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve(body);
            return;
          }
          if (status >= 300 && status < 400) {
            reject(new ConfluenceHttpError(`Confluence API redirected to ${res.headers.location ?? 'another URL'}; API authentication/SSO is likely incomplete`, status, body.slice(0, 500)));
            return;
          }
          reject(new ConfluenceHttpError(`Confluence API request failed`, status, body.slice(0, 500)));
        });
      });
      req.setTimeout(this.config.confluence.requestTimeoutMs, () => {
        req.destroy(new Error(`Confluence request timed out after ${this.config.confluence.requestTimeoutMs} ms`));
      });
      req.on('error', (error) => {
        logger.warn('Confluence request failed', { host: url.hostname, path: url.pathname, error: error.message });
        reject(error);
      });
      req.end();
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'ifa-confluence-mcp/1.0.0',
      ...this.config.confluence.auth.extraHeaders
    };
    const auth = this.config.confluence.auth;
    if (auth.mode === 'pat' || auth.mode === 'bearer') headers.Authorization = `Bearer ${auth.token ?? ''}`;
    if (auth.mode === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`).toString('base64')}`;
    }
    if (auth.mode === 'cookie') headers.Cookie = auth.cookie ?? '';
    return headers;
  }
}
