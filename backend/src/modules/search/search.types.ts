export const SEARCH_ENTITY_TYPES = ["agent", "signal", "user"] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export type SearchIndexDocument = {
  org_id: string;
  entity_type: SearchEntityType;
  entity_id: string;
  title: string;
  content: string;
};

export type SearchFilters = {
  /** If set, only these entity types are included. */
  entityTypes?: SearchEntityType[];
};

export type SearchHitHighlight = Record<string, string[]>;

export type SearchResultItem = {
  entity_type: SearchEntityType;
  entity_id: string;
  score: number | null;
  source: Record<string, unknown>;
  highlight?: SearchHitHighlight;
};

export type SearchResult = {
  total: number;
  hits: SearchResultItem[];
};
