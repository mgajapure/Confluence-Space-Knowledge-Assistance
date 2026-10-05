import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  CONFLUENCE_BASE_URL: 'https://devstack.vwgroup.com/confluence',
  CONFLUENCE_SPACE_KEY: 'IFA',
  CONFLUENCE_AUTH_MODE: 'none'
} satisfies NodeJS.ProcessEnv;

describe('configuration security', () => {
  it('defaults to stdio and the IFA space', () => {
    const config = loadConfig(baseEnv);
    expect(config.mcp.transport).toBe('stdio');
    expect(config.confluence.spaceKey).toBe('IFA');
    expect(config.mcp.http.host).toBe('127.0.0.1');
  });

  it('refuses unauthenticated HTTP on a non-loopback interface', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        MCP_TRANSPORT: 'http',
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_ALLOWED_HOSTS: 'ifa-mcp.internal.example'
      })
    ).toThrow(/Refusing unauthenticated MCP HTTP/);
  });

  it('requires an allowed-host list for non-loopback HTTP', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        MCP_TRANSPORT: 'http',
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_AUTH_TOKEN: 'test-only-secret'
      })
    ).toThrow(/MCP_HTTP_ALLOWED_HOSTS is required/);
  });

  it('accepts protected non-loopback HTTP configuration', () => {
    const config = loadConfig({
      ...baseEnv,
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '0.0.0.0',
      MCP_HTTP_AUTH_TOKEN: 'test-only-secret',
      MCP_HTTP_ALLOWED_HOSTS: 'ifa-mcp.internal.example'
    });
    expect(config.mcp.transport).toBe('http');
    expect(config.mcp.http.allowedHosts).toEqual(['ifa-mcp.internal.example']);
  });
});
