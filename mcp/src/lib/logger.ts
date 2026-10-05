export const logger = {
  info(message: string, meta?: unknown): void {
    write('INFO', message, meta);
  },
  warn(message: string, meta?: unknown): void {
    write('WARN', message, meta);
  },
  error(message: string, meta?: unknown): void {
    write('ERROR', message, meta);
  }
};

function write(level: string, message: string, meta?: unknown): void {
  const suffix = meta === undefined ? '' : ` ${safeStringify(meta)}`;
  // MCP stdio reserves stdout for JSON-RPC. Always log to stderr.
  process.stderr.write(`[${new Date().toISOString()}] ${level} ${message}${suffix}\n`);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
