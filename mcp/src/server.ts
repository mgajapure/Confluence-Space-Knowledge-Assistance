import { McpServer } from '@modelcontextprotocol/server';
import type { AppConfig } from './config.js';
import type { ConfluenceClient } from './confluence/client.js';
import { registerTools } from './tools/register-tools.js';

export function createIfaMcpServer(client: ConfluenceClient, config: AppConfig): McpServer {
  const server = new McpServer({
    name: 'ifa-confluence-knowledge',
    version: '1.0.0'
  });
  registerTools(server, client, config);
  return server;
}
