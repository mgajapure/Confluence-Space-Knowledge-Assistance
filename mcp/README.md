# IFA Confluence MCP Server

A read-only **Model Context Protocol (MCP)** server for the Volkswagen IFA Confluence space.

The server connects to the Confluence REST API at the configured internal URL and exposes live, source-linked documentation to MCP-compatible AI clients. It is deliberately scoped to one Confluence space (`IFA` by default) and never provides create/update/delete tools.

Default IFA configuration:

```text
Confluence: https://devstack.vwgroup.com/confluence
Space key: IFA
Home/root page: 94450529
```

> This repository contains no VW credentials or Confluence data. Keep `.env`, PATs, cookies, client certificates and exported content out of Git.

## What this MCP server provides

| MCP tool | Purpose |
| --- | --- |
| `ifa_status` | Verify API connectivity and read access to the configured space |
| `search_ifa` | Search page/blog content by text, title and/or label |
| `get_ifa_page` | Read a page by numeric Confluence page ID |
| `get_ifa_page_by_title` | Find and read a page by exact title |
| `list_ifa_children` | Navigate direct page children |
| `list_ifa_descendants` | Traverse deeper under a documentation page |
| `list_ifa_attachments` | Return attachment metadata and download URLs |
| `get_ifa_attachment_text` | Read Confluence server-side extracted text for an indexed attachment |
| `list_ifa_comments` | Read page comments with provenance |
| `recent_ifa_updates` | Find recently modified IFA pages |

All page-ID operations verify that the returned page belongs to the configured Confluence space before returning data.

## Runtime architecture

```text
MCP client / AI agent
        |
        | MCP (stdio or Streamable HTTP)
        v
IFA Confluence MCP (this project)
        |
        | HTTPS REST API
        | PAT / Basic / Cookie / mTLS as configured
        v
https://devstack.vwgroup.com/confluence
        |
        v
Space: IFA
```

For an internal enterprise deployment, run the MCP server on a machine/container that can resolve and reach `devstack.vwgroup.com` through the required VW network/VPN path.

## Requirements

- Node.js **20.18+** (Node 22 LTS is recommended)
- Network access to the Confluence instance
- An authenticated Confluence identity with read permission for the IFA space
- One REST-compatible authentication method accepted by the VW Confluence installation

The project uses the MCP TypeScript SDK v2 and ESM.

## Installation

```bash
cd mcp
npm install
cp .env.example .env
```

Set environment variables in your shell or load `.env` using your normal secret-management/runtime mechanism. Do **not** commit `.env`.

Minimum IFA values:

```env
CONFLUENCE_BASE_URL=https://devstack.vwgroup.com/confluence
CONFLUENCE_SITE_URL=https://devstack.vwgroup.com/confluence
CONFLUENCE_SPACE_KEY=IFA
CONFLUENCE_ROOT_PAGE_ID=94450529
CONFLUENCE_AUTH_MODE=pat
CONFLUENCE_TOKEN=YOUR_TOKEN
```

### Important: `.env` loading

The application reads normal process environment variables; it intentionally does not bundle a dotenv loader. Examples:

```bash
# Node 20+ can load the file itself after a build
npm run build
node --env-file=.env dist/src/index.js

# Or export variables using your shell / IDE / container / secret manager
set -a; source .env; set +a
npm run dev
```

## Confluence authentication

The server supports several outbound authentication modes because enterprise Confluence installations differ.

### Personal Access Token / bearer token

```env
CONFLUENCE_AUTH_MODE=pat
CONFLUENCE_TOKEN=...
```

`pat` and `bearer` both send:

```http
Authorization: Bearer <token>
```

This is usually the preferred mode for Confluence Data Center when PATs are enabled.

### Basic authentication

```env
CONFLUENCE_AUTH_MODE=basic
CONFLUENCE_USERNAME=...
CONFLUENCE_PASSWORD=...
```

Use only if the VW installation explicitly supports it. The password value may be an API token if the server expects that pattern.

### Existing session cookie

```env
CONFLUENCE_AUTH_MODE=cookie
CONFLUENCE_COOKIE=JSESSIONID=...; other=value
```

This can be useful for diagnosis but is usually less suitable for a long-running shared service because sessions expire. Prefer a supported service identity/PAT for production.

### Extra gateway headers

If an internal reverse proxy requires nonstandard headers:

```env
CONFLUENCE_EXTRA_HEADERS_JSON={"X-Internal-Header":"value"}
```

Do not commit sensitive header values.

## Outbound mTLS / internal CA

If access to the Confluence/API gateway requires a client certificate:

```env
CONFLUENCE_CLIENT_CERT_PATH=/run/secrets/client.crt
CONFLUENCE_CLIENT_KEY_PATH=/run/secrets/client.key
CONFLUENCE_CLIENT_KEY_PASSPHRASE=
CONFLUENCE_CA_CERT_PATH=/run/secrets/vw-internal-ca.pem
```

Certificate files are read at startup. The `.gitignore` excludes common certificate/key files and the `certs/` directory.

TLS verification is enabled by default. `CONFLUENCE_TLS_INSECURE_SKIP_VERIFY=true` exists only for controlled diagnostics and should not be used as a production fix for a missing corporate CA.

## Run over stdio

Stdio is best when an MCP client launches this process locally.

```bash
npm run build
CONFLUENCE_BASE_URL=https://devstack.vwgroup.com/confluence \
CONFLUENCE_SPACE_KEY=IFA \
CONFLUENCE_AUTH_MODE=pat \
CONFLUENCE_TOKEN='...' \
node dist/src/index.js
```

Example MCP client configuration after building:

```json
{
  "mcpServers": {
    "ifa-confluence": {
      "command": "node",
      "args": ["/absolute/path/Confluence-Space-Knowledge-Assistance/mcp/dist/src/index.js"],
      "env": {
        "CONFLUENCE_BASE_URL": "https://devstack.vwgroup.com/confluence",
        "CONFLUENCE_SITE_URL": "https://devstack.vwgroup.com/confluence",
        "CONFLUENCE_SPACE_KEY": "IFA",
        "CONFLUENCE_ROOT_PAGE_ID": "94450529",
        "CONFLUENCE_AUTH_MODE": "pat",
        "CONFLUENCE_TOKEN": "<provide securely>"
      }
    }
  }
}
```

Avoid placing real tokens in a configuration file that is checked into source control.

## Run as an internal Streamable HTTP MCP server

Set:

```env
MCP_TRANSPORT=http
MCP_HTTP_HOST=0.0.0.0
MCP_HTTP_PORT=3000
MCP_HTTP_PATH=/mcp
MCP_HTTP_AUTH_TOKEN=GENERATE_A_LONG_RANDOM_SECRET
MCP_HTTP_ALLOWED_HOSTS=ifa-mcp.internal.example
```

Then:

```bash
npm run build
node --env-file=.env dist/src/index.js
```

Endpoints:

```text
GET  /health   process health (does not test Confluence credentials)
MCP  /mcp      Streamable HTTP MCP endpoint
```

When binding beyond loopback, startup fails unless an MCP bearer token is configured (or `MCP_ALLOW_INSECURE_HTTP=true` is explicitly chosen). A non-loopback bind also requires `MCP_HTTP_ALLOWED_HOSTS` to reduce DNS-rebinding risk.

Clients call `/mcp` with:

```http
Authorization: Bearer <MCP_HTTP_AUTH_TOKEN>
```

This token protects the MCP endpoint. It is separate from the credential the MCP server uses to call Confluence.

## Docker

Build:

```bash
docker build -t ifa-confluence-mcp .
```

Example internal run:

```bash
docker run --rm -p 3000:3000 \
  --env-file .env \
  ifa-confluence-mcp
```

For mTLS/internal CA, mount the certificate files read-only and point the corresponding environment variables to the mounted paths.

## Validate the project

```bash
npm run check
npm test
npm run build
```

To inspect the stdio MCP server with the MCP Inspector after building, you can use the official inspector package against:

```text
node dist/src/index.js
```

## Suggested first connectivity test

Before debugging MCP itself, verify that the chosen identity can call the Confluence API from the same host/network. For example, the MCP `ifa_status` tool calls the space endpoint equivalent to:

```text
GET https://devstack.vwgroup.com/confluence/rest/api/space/IFA
```

If the REST call redirects to an HTML SSO login page, the server reports that explicitly. In that situation, MCP is working but the Confluence API authentication method still needs to be resolved with the platform/Confluence administrators.

## Security model

1. **Read-only implementation.** This code only sends HTTP `GET` requests to Confluence; it exposes no write/delete/admin tool.
2. **Space scoping.** Search CQL always injects `space = "IFA"` (or the configured key), and page-ID operations verify the returned content's `space.key`.
3. **Confluence permissions remain authoritative.** The MCP server can only read what its configured Confluence identity can read. For a shared service, choose the service identity permissions carefully.
4. **Do not make a privileged account the universal reader.** If users have different ACLs, a shared service account can unintentionally flatten those authorization boundaries. For a larger deployment, use per-user delegated authentication or separate service boundaries.
5. **Output limits.** Result counts, page text length, request timeout and maximum Confluence response size are bounded by configuration.
6. **stdio-safe logging.** Logs go to stderr so JSON-RPC on stdout is not corrupted.
7. **Secrets stay external.** Tokens, passwords, cookies, client keys and internal CA files are environment/mount inputs, never source constants.

## Configuration reference

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONFLUENCE_BASE_URL` | required | Base including `/confluence` context path |
| `CONFLUENCE_SITE_URL` | base URL | Browser-facing base used for source links |
| `CONFLUENCE_SPACE_KEY` | `IFA` | Only space exposed through MCP |
| `CONFLUENCE_ROOT_PAGE_ID` | optional | Known space home/root page, `94450529` for IFA |
| `CONFLUENCE_AUTH_MODE` | `pat` | `pat`, `basic`, `bearer`, `cookie`, `none` |
| `CONFLUENCE_TOKEN` | — | PAT/bearer credential |
| `CONFLUENCE_REQUEST_TIMEOUT_MS` | `30000` | REST request timeout |
| `CONFLUENCE_MAX_RESPONSE_BYTES` | `20971520` | Maximum accepted REST response size |
| `MCP_MAX_CONTENT_CHARS` | `120000` | Maximum page/storage text returned per page |
| `MCP_MAX_RESULTS` | `50` | Maximum list/search page size |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP bind host |
| `MCP_HTTP_PORT` | `3000` | HTTP port |
| `MCP_HTTP_PATH` | `/mcp` | MCP route |
| `MCP_HTTP_AUTH_TOKEN` | — | Shared bearer token for the HTTP MCP endpoint |
| `MCP_HTTP_ALLOWED_HOSTS` | — | Comma-separated allowed hostnames for non-loopback hosting |
| `MCP_HTTP_ALLOWED_ORIGINS` | — | Optional comma-separated browser origins/hostnames accepted by MCP Express validation |

See `.env.example` for TLS and gateway options.

## What this MCP server intentionally does not do

- It does not write to Confluence.
- It does not bypass Confluence permissions or VW SSO/network controls.
- It does not persist Confluence pages in a vector database.
- It does not send page content to an external LLM by itself; the connected MCP client decides how tool results are used.
- It does not download/parse arbitrary binaries inside the MCP process. When Confluence exposes server-side extracted attachment text, `get_ifa_attachment_text` returns it; for large-scale extraction/embedding, use the repository's ingestion/RAG pipeline as a separate controlled process.

## Example AI questions after connection

- "Search IFA for WLTP-V and explain it using the Confluence sources."
- "Find the IFA documentation for REST API mTLS."
- "Show the children of the IFA Home page 94450529."
- "What changed in IFA documentation during the last seven days?"
- "Find pages mentioning RVS file and give me their source URLs."

The tool results include provenance URLs so an answer can link back to the authoritative Confluence page.
