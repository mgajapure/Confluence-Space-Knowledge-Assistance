import axios from "axios";
import { getNextLinkFromHeader, sleep } from "./utils.js";

export function createHttpClient(config) {
  const basicAuth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");

  const client = axios.create({
    baseURL: config.apiBaseUrl,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    maxRedirects: 10,
    timeout: 90_000,
  });

  async function request(requestConfig, attempts = 5) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await client.request(requestConfig);
      } catch (error) {
        const status = error.response?.status;
        const retryable = [429, 500, 502, 503, 504].includes(status);

        if (!retryable || attempt === attempts) {
          throw error;
        }

        const retryAfterSeconds = Number(error.response?.headers?.["retry-after"] ?? 0);
        const waitMs = retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : Math.min(1000 * 2 ** attempt, 15_000);

        console.warn(`HTTP ${status}; retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${attempts})...`);
        await sleep(waitMs);
      }
    }

    throw new Error("Request failed after retries");
  }

  return { client, request };
}

export async function getAll(request, initialUrl, params = {}) {
  const results = [];
  let url = initialUrl;
  let currentParams = params;

  while (url) {
    const response = await request({ method: "GET", url, params: currentParams });
    const data = response.data ?? {};

    if (Array.isArray(data.results)) {
      results.push(...data.results);
    }

    const nextFromBody = data?._links?.next ?? null;
    const nextFromHeader = getNextLinkFromHeader(response.headers?.link);
    const next = nextFromBody || nextFromHeader;

    if (!next) break;
    url = next;
    currentParams = undefined;
  }

  return results;
}
