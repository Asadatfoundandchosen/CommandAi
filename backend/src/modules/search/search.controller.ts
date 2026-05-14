import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { isOpenSearchConnected } from "../../infrastructure/search/index.js";
import { TYPES } from "../../types.js";
import { SearchService } from "./search.service.js";
import type { SearchEntityType } from "./search.types.js";
import { SEARCH_ENTITY_TYPES } from "./search.types.js";
import { searchGetQuerySchema } from "./search.validation.js";

function resolveTenantOrgId(req: Request): string | null {
  const h = req.headers["x-org-id"] ?? req.headers["X-Org-Id"];
  if (typeof h === "string" && h.length > 0) {
    return h;
  }
  const q = req.query.org_id;
  if (typeof q === "string" && q.length > 0) {
    return q;
  }
  if (typeof req.tenantId === "string" && req.tenantId.length > 0) {
    return req.tenantId;
  }
  return null;
}

function parseEntityTypeFilter(
  query: Request["query"],
): SearchEntityType[] | undefined {
  const raw = query.entity_type;
  if (raw === undefined) {
    return undefined;
  }
  const list = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x));
  const parts = list
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  const set = new Set<SearchEntityType>();
  for (const p of parts) {
    if ((SEARCH_ENTITY_TYPES as readonly string[]).includes(p)) {
      set.add(p as SearchEntityType);
    }
  }
  return set.size > 0 ? [...set] : undefined;
}

@injectable()
export class SearchController {
  constructor(
    @inject(TYPES.SearchService) private readonly search: SearchService,
  ) {}

  get = async (req: Request, res: Response): Promise<void> => {
    if (!isOpenSearchConnected()) {
      res
        .status(503)
        .json({ error: "search_unavailable", message: "OpenSearch is not configured" });
      return;
    }

    const orgId = resolveTenantOrgId(req);
    if (orgId === null || orgId.length === 0) {
      res.status(400).json({
        error: "org_required",
        message: "Provide tenant org via x-org-id header or org_id query (JWT in production)",
      });
      return;
    }

    const parsed = searchGetQuerySchema.safeParse({ q: req.query.q });
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query", details: parsed.error.flatten() });
      return;
    }

    const entityTypes = parseEntityTypeFilter(req.query);
    if (entityTypes === undefined && req.query.entity_type !== undefined) {
      res.status(400).json({
        error: "invalid_entity_type",
        message: "entity_type must be one of: agent, signal, user",
      });
      return;
    }

    const result = await this.search.search(orgId, parsed.data.q, {
      entityTypes,
    });
    res.status(200).json({ data: result });
  };
}
