import { inject, injectable } from "inversify";

import { TYPES } from "../../types.js";
import { SearchService } from "../search/search.service.js";

/** Agents domain service — extend when agent APIs are implemented. */
@injectable()
export class AgentService {
  constructor(
    @inject(TYPES.SearchService) private readonly search: SearchService,
  ) {}

  /** **Index** this agent in tenant-scoped full-text **search** when agents are created or updated. */
  indexAgentForSearch(input: {
    orgId: string;
    agentId: string;
    name: string;
    description?: string;
  }): Promise<void> {
    return this.search.indexAgent(input);
  }
}
