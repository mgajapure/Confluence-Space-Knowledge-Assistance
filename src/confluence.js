import { getAll } from "./http.js";

export class ConfluenceClient {
  constructor(config, request) {
    this.config = config;
    this.request = request;
  }

  async getSpace() {
    const response = await this.request({
      method: "GET",
      url: "/wiki/api/v2/spaces",
      params: { keys: this.config.spaceKey, limit: 10 },
    });

    const space = response.data?.results?.find((item) => item.key === this.config.spaceKey);
    if (!space) {
      throw new Error(`Confluence space '${this.config.spaceKey}' was not found or is not accessible.`);
    }
    return space;
  }

  getPages(spaceId) {
    return getAll(this.request, `/wiki/api/v2/spaces/${spaceId}/pages`, {
      limit: 100,
      status: "current",
      depth: "all",
      "body-format": "storage",
    });
  }

  getBlogPosts(spaceId) {
    return getAll(this.request, `/wiki/api/v2/spaces/${spaceId}/blogposts`, {
      limit: 100,
      status: "current",
      "body-format": "storage",
    });
  }

  async getContentDetails(type, id) {
    const path = type === "page" ? "pages" : "blogposts";
    const response = await this.request({
      method: "GET",
      url: `/wiki/api/v2/${path}/${id}`,
      params: {
        "body-format": "storage",
        "include-labels": true,
        "include-version": true,
      },
    });
    return response.data;
  }

  getAttachments(type, contentId) {
    const path = type === "page" ? "pages" : "blogposts";
    return getAll(this.request, `/wiki/api/v2/${path}/${contentId}/attachments`, { limit: 100 });
  }

  getRootComments(type, contentId, commentType) {
    const path = type === "page" ? "pages" : "blogposts";
    return getAll(
      this.request,
      `/wiki/api/v2/${path}/${contentId}/${commentType}-comments`,
      { limit: 100, "body-format": "storage" },
    );
  }

  getChildComments(commentId, commentType) {
    return getAll(
      this.request,
      `/wiki/api/v2/${commentType}-comments/${commentId}/children`,
      { limit: 100, "body-format": "storage" },
    );
  }

  async downloadAttachment(contentId, attachmentId) {
    // Use the supported REST download endpoint instead of relying on the v2 downloadLink.
    return this.request({
      method: "GET",
      url: `/wiki/rest/api/content/${contentId}/child/attachment/${attachmentId}/download`,
      responseType: "stream",
      maxRedirects: 10,
      headers: { Accept: "*/*" },
    });
  }
}
