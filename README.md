# Confluence Space Knowledge Assistance

A Node.js ingestion utility that exports a complete accessible **Confluence Cloud space** into an AI-friendly local knowledge base.

It collects:

- Confluence pages and blog posts
- Page hierarchy and parent relationships
- Storage-format content converted to Markdown
- Labels, version metadata and source URLs
- Footer comments, inline comments and comment replies
- Attachments
- Extracted text from common attachment formats
- `knowledge_base.json`, `knowledge_base.jsonl` and AI-ready `chunks.jsonl`

The project is intended as the ingestion layer for a RAG/knowledge-assistant solution. It does **not** upload your project data to an external AI provider.

## Requirements

- Node.js **20.16+** or Node.js 22+
- A Confluence Cloud account with access to the target space
- An Atlassian API token

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
CONFLUENCE_API_BASE_URL=https://your-company.atlassian.net
CONFLUENCE_SITE_URL=https://your-company.atlassian.net
CONFLUENCE_EMAIL=your.email@company.com
CONFLUENCE_API_TOKEN=your_token
CONFLUENCE_SPACE_KEY=IFA
```

Then run:

```bash
npm run export
```

## Atlassian token modes

### Classic / unscoped API token

Use your normal Atlassian site as the API base:

```env
CONFLUENCE_API_BASE_URL=https://your-company.atlassian.net
```

### Scoped API token

For a scoped token, use the Atlassian API gateway and your Cloud ID:

```env
CONFLUENCE_API_BASE_URL=https://api.atlassian.com/ex/confluence/YOUR_CLOUD_ID
CONFLUENCE_SITE_URL=https://your-company.atlassian.net
```

`CONFLUENCE_SITE_URL` remains the normal browser-facing site so source links in the exported knowledge base are readable.

## Output

A successful run creates:

```text
confluence-export/
├── export_summary.json
├── knowledge_base.json
├── knowledge_base.jsonl
├── chunks.jsonl
├── pages/
│   ├── 123456_Architecture.json
│   └── 123456_Architecture.md
├── blogposts/
│   └── ...
└── attachments/
    └── 123456/
        ├── architecture.pdf
        ├── interface.docx
        └── specification.xlsx
```

### `knowledge_base.jsonl`

One line per Confluence page/blog post, preserving metadata and original content.

### `chunks.jsonl`

One line per AI retrieval chunk. Every chunk contains source metadata such as page ID, title, section, URL, version and space key. Extracted attachment text is also chunked with attachment metadata.

## Attachment text extraction

Currently supported:

| Format | Parser |
| --- | --- |
| PDF | `pdf-parse` |
| DOCX | `mammoth` |
| XLSX | `exceljs` |
| PPTX | `jszip` + slide XML text extraction |
| TXT/MD/CSV/JSON/XML/YAML/SQL/log | Native text reader |
| HTML | Turndown |

Unsupported binary attachments are still downloaded and referenced in page metadata; they simply do not generate text chunks.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OUTPUT_DIR` | `confluence-export` | Export destination |
| `CLEAN_OUTPUT` | `true` | Remove previous export before running |
| `DOWNLOAD_ATTACHMENTS` | `true` | Download page/blog attachments |
| `EXTRACT_ATTACHMENT_TEXT` | `true` | Extract text from supported attachments |
| `INCLUDE_COMMENTS` | `true` | Export footer and inline comments |
| `INCLUDE_BLOG_POSTS` | `true` | Include space blog posts |
| `CHUNK_SIZE_TOKENS` | `900` | Approximate maximum chunk size |
| `CHUNK_OVERLAP_TOKENS` | `120` | Approximate overlap between large chunks |

Chunk sizes use an intentionally simple `~4 characters/token` approximation. The resulting JSONL can be re-chunked later with the exact tokenizer used by your embedding model if required.

## Security

- Never commit `.env` or API tokens.
- The exporter only retrieves content the authenticated Confluence user can access.
- If the resulting knowledge base is shared with multiple users, preserve Confluence authorization semantics at the retrieval layer. Exporting data does not automatically preserve Confluence ACL enforcement.
- `confluence-export/` is ignored by Git so confidential project content is not accidentally committed.

## Validation

Run syntax validation and unit tests:

```bash
npm run check
npm test
```

## Current scope

This project exports normal Confluence knowledge content: pages, blog posts, comments and attachments. Modern Confluence also supports resources such as whiteboards, databases, folders, Smart Links and custom content; those can be added as separate collectors if your target space uses them.

## AI/RAG integration

A typical downstream architecture is:

```text
Confluence
   ↓
This exporter
   ↓
chunks.jsonl
   ↓
Embedding model
   ↓
PostgreSQL + pgvector / vector database
   ↓
Spring AI / LangChain / custom RAG service
   ↓
Project knowledge assistant
```

Each generated chunk keeps provenance so answers can cite the originating Confluence page.
