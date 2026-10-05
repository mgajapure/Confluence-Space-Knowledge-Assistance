import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { AppConfig } from '../config.js';
import type { ConfluenceClient } from '../confluence/client.js';
import { errorMessage } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
};

export function registerTools(server: McpServer, client: ConfluenceClient, config: AppConfig): void {
  const space = config.confluence.spaceKey;

  server.registerTool(
    'ifa_status',
    {
      title: 'IFA Confluence Status',
      description: `Verify connectivity and authenticated read access to Confluence space ${space}.`,
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations
    },
    async () => safeTool('ifa_status', async () => {
      const info = await client.getSpace();
      return {
        ok: true,
        space: { key: info.key, name: info.name ?? '', type: info.type ?? '', status: info.status ?? '' },
        homepage: info.homepage ?? null,
        configuredRootPageId: config.confluence.rootPageId ?? null,
        baseUrl: config.confluence.baseUrl
      };
    })
  );

  server.registerTool(
    'search_ifa',
    {
      title: 'Search IFA Confluence',
      description: `Search only within Confluence space ${space}. Returns source URLs and metadata; optionally includes page text.`,
      inputSchema: z.object({
        query: z.string().max(500).optional().describe('Free-text query.'),
        title: z.string().max(500).optional().describe('Optional title search.'),
        label: z.string().max(200).optional().describe('Optional exact Confluence label.'),
        contentType: z.enum(['page', 'blogpost', 'all']).default('page'),
        includeContent: z.boolean().default(false),
        limit: z.number().int().min(1).max(config.mcp.maxResults).default(Math.min(20, config.mcp.maxResults)),
        start: z.number().int().min(0).default(0)
      }).refine((value) => Boolean(value.query?.trim() || value.title?.trim() || value.label?.trim()), {
        message: 'At least one of query, title, or label is required.'
      }),
      annotations: readOnlyAnnotations
    },
    async (args) => safeTool('search_ifa', () => client.search(args))
  );

  server.registerTool(
    'get_ifa_page',
    {
      title: 'Get IFA Page',
      description: `Read a Confluence page by ID. The server rejects content outside space ${space}.`,
      inputSchema: z.object({
        pageId: z.string().regex(/^\d+$/, 'pageId must be numeric'),
        includeStorage: z.boolean().default(false).describe('Also return Confluence storage-format XHTML, truncated to the configured safety limit.')
      }),
      annotations: readOnlyAnnotations
    },
    async ({ pageId, includeStorage }) => safeTool('get_ifa_page', () => client.getPage(pageId, includeStorage))
  );

  server.registerTool(
    'get_ifa_page_by_title',
    {
      title: 'Get IFA Page By Title',
      description: `Find an IFA page by its exact Confluence title and return its content.`,
      inputSchema: z.object({
        title: z.string().min(1).max(500),
        includeStorage: z.boolean().default(false)
      }),
      annotations: readOnlyAnnotations
    },
    async ({ title, includeStorage }) => safeTool('get_ifa_page_by_title', async () => {
      const page = await client.getPageByTitle(title, includeStorage);
      return page ?? { found: false, title };
    })
  );

  server.registerTool(
    'list_ifa_children',
    {
      title: 'List IFA Page Children',
      description: `List direct child pages under an IFA page.`,
      inputSchema: paginationSchema(config),
      annotations: readOnlyAnnotations
    },
    async ({ pageId, limit, start }) => safeTool('list_ifa_children', () => client.listChildren(pageId, limit, start))
  );

  server.registerTool(
    'list_ifa_descendants',
    {
      title: 'List IFA Descendants',
      description: `List descendant pages under an IFA page, useful for traversing the documentation tree.`,
      inputSchema: paginationSchema(config),
      annotations: readOnlyAnnotations
    },
    async ({ pageId, limit, start }) => safeTool('list_ifa_descendants', () => client.listDescendants(pageId, limit, start))
  );

  server.registerTool(
    'list_ifa_attachments',
    {
      title: 'List IFA Attachments',
      description: `List attachment metadata for an IFA page, including download URL, media type, size and version. Binary attachment content is not returned by this tool.`,
      inputSchema: paginationSchema(config),
      annotations: readOnlyAnnotations
    },
    async ({ pageId, limit, start }) => safeTool('list_ifa_attachments', () => client.listAttachments(pageId, limit, start))
  );


  server.registerTool(
    'get_ifa_attachment_text',
    {
      title: 'Read IFA Attachment Text',
      description: `Read Confluence's server-side extracted text for an attachment belonging to an IFA page. This is useful for PDFs, Office documents and other indexed attachments when Confluence has extracted their text.`,
      inputSchema: z.object({
        pageId: z.string().regex(/^\d+$/, 'pageId must be numeric'),
        attachmentId: z.string().regex(/^\d+$/, 'attachmentId must be numeric')
      }),
      annotations: readOnlyAnnotations
    },
    async ({ pageId, attachmentId }) => safeTool('get_ifa_attachment_text', () => client.getAttachmentExtractedText(pageId, attachmentId))
  );

  server.registerTool(
    'list_ifa_comments',
    {
      title: 'List IFA Comments',
      description: `List comments attached to an IFA page and return readable comment text plus provenance.`,
      inputSchema: paginationSchema(config),
      annotations: readOnlyAnnotations
    },
    async ({ pageId, limit, start }) => safeTool('list_ifa_comments', () => client.listComments(pageId, limit, start))
  );

  server.registerTool(
    'recent_ifa_updates',
    {
      title: 'Recent IFA Updates',
      description: `Find pages modified recently in Confluence space ${space}.`,
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).default(7),
        limit: z.number().int().min(1).max(config.mcp.maxResults).default(Math.min(20, config.mcp.maxResults)),
        start: z.number().int().min(0).default(0)
      }),
      annotations: readOnlyAnnotations
    },
    async ({ days, limit, start }) => safeTool('recent_ifa_updates', () => client.recentUpdates(days, limit, start))
  );
}

function paginationSchema(config: AppConfig) {
  return z.object({
    pageId: z.string().regex(/^\d+$/, 'pageId must be numeric'),
    limit: z.number().int().min(1).max(config.mcp.maxResults).default(Math.min(25, config.mcp.maxResults)),
    start: z.number().int().min(0).default(0)
  });
}

async function safeTool(name: string, operation: () => Promise<unknown>) {
  try {
    const value = await operation();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
    };
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`Tool ${name} failed`, { error: message });
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Tool ${name} failed: ${message}` }]
    };
  }
}
