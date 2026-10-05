export class ConfluenceHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseSnippet?: string
  ) {
    super(message);
    this.name = 'ConfluenceHttpError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ConfluenceHttpError) {
    const status = error.statusCode ? ` (HTTP ${error.statusCode})` : '';
    return `${error.message}${status}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
