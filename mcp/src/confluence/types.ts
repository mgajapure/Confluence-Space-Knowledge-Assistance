export interface ConfluenceLinks {
  webui?: string;
  self?: string;
  base?: string;
  download?: string;
}

export interface ConfluenceSpace {
  id?: number;
  key: string;
  name?: string;
  type?: string;
  status?: string;
  homepage?: { id?: string; title?: string; _links?: ConfluenceLinks };
  description?: { plain?: { value?: string } };
  _links?: ConfluenceLinks;
}

export interface ConfluenceVersion {
  number?: number;
  when?: string;
  message?: string;
  minorEdit?: boolean;
  by?: { displayName?: string; username?: string; userKey?: string };
}

export interface ConfluenceContent {
  id: string;
  type?: string;
  status?: string;
  title?: string;
  space?: { id?: number; key?: string; name?: string };
  body?: {
    storage?: { value?: string; representation?: string };
    view?: { value?: string; representation?: string };
  };
  version?: ConfluenceVersion;
  ancestors?: Array<{ id: string; title?: string; _links?: ConfluenceLinks }>;
  metadata?: {
    labels?: { results?: Array<{ name?: string; prefix?: string; id?: string }> };
    mediaType?: string;
    comment?: Record<string, unknown>;
  };
  extensions?: {
    mediaType?: string;
    fileSize?: number;
    comment?: string;
  };
  _links?: ConfluenceLinks;
}

export interface ConfluencePaged<T> {
  results: T[];
  start?: number;
  limit?: number;
  size?: number;
  _links?: { next?: string; self?: string; base?: string };
}

export interface PageView {
  id: string;
  type: string;
  title: string;
  spaceKey: string;
  sourceUrl: string;
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  labels: string[];
  ancestors: Array<{ id: string; title: string }>;
  contentText: string;
  storageFormat?: string;
  truncated: boolean;
}
