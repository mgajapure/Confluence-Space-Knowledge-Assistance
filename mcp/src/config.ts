import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as z from 'zod/v4';

const boolString = z
  .string()
  .optional()
  .transform((value) => value?.toLowerCase() === 'true');

const intString = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : fallback))
    .refine((value) => Number.isInteger(value) && value >= min && value <= max);

const envSchema = z.object({
  CONFLUENCE_BASE_URL: z.string().url(),
  CONFLUENCE_SITE_URL: z.string().url().optional(),
  CONFLUENCE_SPACE_KEY: z.string().min(1).default('IFA'),
  CONFLUENCE_ROOT_PAGE_ID: z.string().optional(),
  CONFLUENCE_AUTH_MODE: z.enum(['pat', 'basic', 'bearer', 'cookie', 'none']).default('pat'),
  CONFLUENCE_TOKEN: z.string().optional(),
  CONFLUENCE_USERNAME: z.string().optional(),
  CONFLUENCE_PASSWORD: z.string().optional(),
  CONFLUENCE_COOKIE: z.string().optional(),
  CONFLUENCE_EXTRA_HEADERS_JSON: z.string().default('{}'),
  CONFLUENCE_CLIENT_CERT_PATH: z.string().optional(),
  CONFLUENCE_CLIENT_KEY_PATH: z.string().optional(),
  CONFLUENCE_CLIENT_KEY_PASSPHRASE: z.string().optional(),
  CONFLUENCE_CA_CERT_PATH: z.string().optional(),
  CONFLUENCE_TLS_INSECURE_SKIP_VERIFY: boolString,
  CONFLUENCE_REQUEST_TIMEOUT_MS: intString(30_000, 1_000, 300_000),
  CONFLUENCE_MAX_RESPONSE_BYTES: intString(20 * 1024 * 1024, 1024, 200 * 1024 * 1024),
  MCP_MAX_CONTENT_CHARS: intString(120_000, 1_000, 1_000_000),
  MCP_MAX_RESULTS: intString(50, 1, 200),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  MCP_HTTP_HOST: z.string().default('127.0.0.1'),
  MCP_HTTP_PORT: intString(3000, 1, 65535),
  MCP_HTTP_PATH: z.string().default('/mcp'),
  MCP_HTTP_AUTH_TOKEN: z.string().optional(),
  MCP_ALLOW_INSECURE_HTTP: boolString,
  MCP_HTTP_ALLOWED_HOSTS: z.string().optional(),
  MCP_HTTP_ALLOWED_ORIGINS: z.string().optional()
});

export interface AppConfig {
  confluence: {
    baseUrl: string;
    siteUrl: string;
    spaceKey: string;
    rootPageId?: string;
    auth: {
      mode: 'pat' | 'basic' | 'bearer' | 'cookie' | 'none';
      token?: string;
      username?: string;
      password?: string;
      cookie?: string;
      extraHeaders: Record<string, string>;
    };
    tls: {
      cert?: Buffer;
      key?: Buffer;
      passphrase?: string;
      ca?: Buffer;
      rejectUnauthorized: boolean;
    };
    requestTimeoutMs: number;
    maxResponseBytes: number;
  };
  mcp: {
    transport: 'stdio' | 'http';
    maxContentChars: number;
    maxResults: number;
    http: {
      host: string;
      port: number;
      path: string;
      authToken?: string;
      allowInsecure: boolean;
      allowedHosts: string[];
      allowedOrigins: string[];
    };
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const extraHeaders = parseExtraHeaders(parsed.CONFLUENCE_EXTRA_HEADERS_JSON);
  validateAuth(parsed);

  const baseUrl = stripTrailingSlash(parsed.CONFLUENCE_BASE_URL);
  const siteUrl = stripTrailingSlash(parsed.CONFLUENCE_SITE_URL ?? baseUrl);
  const path = parsed.MCP_HTTP_PATH.startsWith('/') ? parsed.MCP_HTTP_PATH : `/${parsed.MCP_HTTP_PATH}`;
  const cert = loadOptionalFile(parsed.CONFLUENCE_CLIENT_CERT_PATH);
  const key = loadOptionalFile(parsed.CONFLUENCE_CLIENT_KEY_PATH);
  const ca = loadOptionalFile(parsed.CONFLUENCE_CA_CERT_PATH);

  const config: AppConfig = {
    confluence: {
      baseUrl,
      siteUrl,
      spaceKey: parsed.CONFLUENCE_SPACE_KEY,
      ...(parsed.CONFLUENCE_ROOT_PAGE_ID ? { rootPageId: parsed.CONFLUENCE_ROOT_PAGE_ID } : {}),
      auth: {
        mode: parsed.CONFLUENCE_AUTH_MODE,
        ...(parsed.CONFLUENCE_TOKEN ? { token: parsed.CONFLUENCE_TOKEN } : {}),
        ...(parsed.CONFLUENCE_USERNAME ? { username: parsed.CONFLUENCE_USERNAME } : {}),
        ...(parsed.CONFLUENCE_PASSWORD ? { password: parsed.CONFLUENCE_PASSWORD } : {}),
        ...(parsed.CONFLUENCE_COOKIE ? { cookie: parsed.CONFLUENCE_COOKIE } : {}),
        extraHeaders
      },
      tls: {
        ...(cert ? { cert } : {}),
        ...(key ? { key } : {}),
        ...(parsed.CONFLUENCE_CLIENT_KEY_PASSPHRASE ? { passphrase: parsed.CONFLUENCE_CLIENT_KEY_PASSPHRASE } : {}),
        ...(ca ? { ca } : {}),
        rejectUnauthorized: !parsed.CONFLUENCE_TLS_INSECURE_SKIP_VERIFY
      },
      requestTimeoutMs: parsed.CONFLUENCE_REQUEST_TIMEOUT_MS,
      maxResponseBytes: parsed.CONFLUENCE_MAX_RESPONSE_BYTES
    },
    mcp: {
      transport: parsed.MCP_TRANSPORT,
      maxContentChars: parsed.MCP_MAX_CONTENT_CHARS,
      maxResults: parsed.MCP_MAX_RESULTS,
      http: {
        host: parsed.MCP_HTTP_HOST,
        port: parsed.MCP_HTTP_PORT,
        path,
        ...(parsed.MCP_HTTP_AUTH_TOKEN ? { authToken: parsed.MCP_HTTP_AUTH_TOKEN } : {}),
        allowInsecure: parsed.MCP_ALLOW_INSECURE_HTTP,
        allowedHosts: splitCsv(parsed.MCP_HTTP_ALLOWED_HOSTS),
        allowedOrigins: splitCsv(parsed.MCP_HTTP_ALLOWED_ORIGINS)
      }
    }
  };

  validateHttpSecurity(config);
  return config;
}

function validateAuth(parsed: z.infer<typeof envSchema>): void {
  if ((parsed.CONFLUENCE_AUTH_MODE === 'pat' || parsed.CONFLUENCE_AUTH_MODE === 'bearer') && !parsed.CONFLUENCE_TOKEN) {
    throw new Error(`CONFLUENCE_TOKEN is required for auth mode ${parsed.CONFLUENCE_AUTH_MODE}`);
  }
  if (parsed.CONFLUENCE_AUTH_MODE === 'basic' && (!parsed.CONFLUENCE_USERNAME || !parsed.CONFLUENCE_PASSWORD)) {
    throw new Error('CONFLUENCE_USERNAME and CONFLUENCE_PASSWORD are required for basic auth');
  }
  if (parsed.CONFLUENCE_AUTH_MODE === 'cookie' && !parsed.CONFLUENCE_COOKIE) {
    throw new Error('CONFLUENCE_COOKIE is required for cookie auth');
  }
}

function validateHttpSecurity(config: AppConfig): void {
  if (config.mcp.transport !== 'http') return;
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(config.mcp.http.host);
  if (!loopback && !config.mcp.http.authToken && !config.mcp.http.allowInsecure) {
    throw new Error('Refusing unauthenticated MCP HTTP on a non-loopback host. Set MCP_HTTP_AUTH_TOKEN or explicitly set MCP_ALLOW_INSECURE_HTTP=true.');
  }
  if (!loopback && config.mcp.http.allowedHosts.length === 0) {
    throw new Error('MCP_HTTP_ALLOWED_HOSTS is required when MCP_HTTP_HOST is non-loopback.');
  }
}

function parseExtraHeaders(raw: string): Record<string, string> {
  const value: unknown = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('CONFLUENCE_EXTRA_HEADERS_JSON must be a JSON object');
  }
  const headers: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error(`Header ${key} must have a string value`);
    headers[key] = item;
  }
  return headers;
}

function loadOptionalFile(pathValue?: string): Buffer | undefined {
  if (!pathValue) return undefined;
  const fullPath = resolve(pathValue);
  if (!existsSync(fullPath)) throw new Error(`TLS file does not exist: ${fullPath}`);
  return readFileSync(fullPath);
}

function splitCsv(value?: string): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
