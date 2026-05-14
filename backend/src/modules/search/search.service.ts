import { injectable } from "inversify";

import {
  APP_SEARCH_INDEX_NAME,
  getOpenSearchClient,
  requireOpenSearchClient,
} from "../../infrastructure/search/index.js";
import type {
  SearchEntityType,
  SearchFilters,
  SearchIndexDocument,
  SearchResult,
  SearchResultItem,
} from "./search.types.js";

const HIGHLIGHT_PRE = "<mark>";
const HIGHLIGHT_POST = "</mark>";

function searchDocumentId(
  orgId: string,
  entityType: SearchEntityType,
  entityId: string,
): string {
  return `${orgId}:${entityType}:${entityId}`;
}

@injectable()
export class SearchService {
  /**
   * Full-text search with **highlights**; always **filters** by `org_id` (never omitted).
   */
  async search(
    orgId: string,
    query: string,
    filters: SearchFilters = {},
  ): Promise<SearchResult> {
    const c = getOpenSearchClient();
    if (!c) {
      return { total: 0, hits: [] };
    }

    const q = query.trim();
    if (q.length === 0) {
      return { total: 0, hits: [] };
    }

    const must: object[] = [
      {
        multi_match: {
          query: q,
          type: "best_fields",
          fields: [
            "title^2",
            "content",
            "title.autocomplete^1.2",
            "content.autocomplete^0.8",
          ],
        },
      },
    ];

    const filter: object[] = [{ term: { org_id: orgId } }];

    if (filters.entityTypes !== undefined && filters.entityTypes.length > 0) {
      filter.push({ terms: { entity_type: filters.entityTypes } });
    }

    const res = await c.search({
      index: APP_SEARCH_INDEX_NAME,
      body: {
        size: 50,
        track_total_hits: true,
        query: {
          bool: {
            must,
            filter,
          },
        },
        highlight: {
          pre_tags: [HIGHLIGHT_PRE],
          post_tags: [HIGHLIGHT_POST],
          fields: {
            title: { number_of_fragments: 0, fragment_size: 200 },
            content: { fragment_size: 180, number_of_fragments: 2 },
            "title.autocomplete": { number_of_fragments: 0 },
            "content.autocomplete": { fragment_size: 120, number_of_fragments: 1 },
          },
        },
      },
    });

    const total =
      typeof res.body.hits?.total === "number"
        ? res.body.hits.total
        : (res.body.hits?.total as { value?: number } | undefined)?.value ?? 0;

    const rawHits = res.body.hits?.hits ?? [];
    const hits: SearchResultItem[] = rawHits.map(
      (h: {
        _id?: string;
        _score?: number | null;
        _source?: Record<string, unknown>;
        highlight?: Record<string, string[]>;
      }) => {
        const src = (h._source ?? {}) as Record<string, unknown>;
        const entity_type = String(src.entity_type) as SearchEntityType;
        const entity_id = String(src.entity_id);
        return {
          entity_type,
          entity_id,
          score: h._score ?? null,
          source: src,
          highlight: h.highlight,
        };
      },
    );

    return { total, hits };
  }

  private async upsertDocument(
    body: SearchIndexDocument,
  ): Promise<void> {
    const c = requireOpenSearchClient();
    const id = searchDocumentId(
      body.org_id,
      body.entity_type,
      body.entity_id,
    );
    await c.index({
      index: APP_SEARCH_INDEX_NAME,
      id,
      body,
      refresh: "wait_for",
    });
  }

  async indexAgent(input: {
    orgId: string;
    agentId: string;
    name: string;
    description?: string;
  }): Promise<void> {
    const content = [input.name, input.description].filter(Boolean).join("\n");
    await this.upsertDocument({
      org_id: input.orgId,
      entity_type: "agent",
      entity_id: input.agentId,
      title: input.name,
      content: content || input.name,
    });
  }

  async indexSignal(input: {
    orgId: string;
    signalId: string;
    name: string;
    content?: string;
  }): Promise<void> {
    const content = [input.name, input.content].filter(Boolean).join("\n");
    await this.upsertDocument({
      org_id: input.orgId,
      entity_type: "signal",
      entity_id: input.signalId,
      title: input.name,
      content: content || input.name,
    });
  }

  async indexUser(input: {
    orgId: string;
    userId: string;
    email: string;
    displayName?: string;
  }): Promise<void> {
    const title = input.displayName?.trim() || input.email;
    const content = [input.displayName, input.email].filter(Boolean).join(" ");
    await this.upsertDocument({
      org_id: input.orgId,
      entity_type: "user",
      entity_id: input.userId,
      title,
      content: content || input.email,
    });
  }
}
