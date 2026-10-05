import { timingSafeEqual } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from './config.js';
import type { ConfluenceClient } from './confluence/client.js';
import { logger } from './lib/logger.js';
import { createIfaMcpServer } from './server.js';

export async function startHttp(client: ConfluenceClient, config: AppConfig): Promise<void> {
  const { host, port, path, allowedHosts, allowedOrigins } = config.mcp.http;
  const app = createMcpExpressApp({
    host,
    ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
    ...(allowedOrigins.length > 0 ? { allowedOrigins } : {})
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', server: 'ifa-confluence-knowledge', spaceKey: config.confluence.spaceKey });
  });

  if (config.mcp.http.authToken) {
    app.use(path, sharedBearerAuth(config.mcp.http.authToken));
  }

  const handler = createMcpHandler(() => createIfaMcpServer(client, config));
  const nodeHandler = toNodeHandler(handler);
  app.all(path, (req, res) => void nodeHandler(req, res, req.body));

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(port, host, () => {
      logger.info('MCP HTTP server listening', { host, port, path, spaceKey: config.confluence.spaceKey });
      resolve();
    });
    httpServer.on('error', reject);
  });
}

function sharedBearerAuth(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authorization = req.header('authorization') ?? '';
    const prefix = 'Bearer ';
    if (!authorization.startsWith(prefix) || !secureEqual(authorization.slice(prefix.length), expectedToken)) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

function secureEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
