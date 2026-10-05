import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config.js';
import { ConfluenceClient } from './confluence/client.js';
import { startHttp } from './http.js';
import { logger } from './lib/logger.js';
import { createIfaMcpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new ConfluenceClient(config);

  logger.info('Starting IFA Confluence MCP', {
    transport: config.mcp.transport,
    confluenceBaseUrl: config.confluence.baseUrl,
    spaceKey: config.confluence.spaceKey,
    rootPageId: config.confluence.rootPageId ?? null,
    authMode: config.confluence.auth.mode,
    tlsClientCertificate: Boolean(config.confluence.tls.cert && config.confluence.tls.key)
  });

  if (config.mcp.transport === 'http') {
    await startHttp(client, config);
    return;
  }

  serveStdio(() => createIfaMcpServer(client, config));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  logger.error('Fatal startup error', { error: message });
  process.exitCode = 1;
});
