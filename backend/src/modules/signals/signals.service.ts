import { inject, injectable } from "inversify";

import { TYPES } from "../../types.js";
import { SearchService } from "../search/search.service.js";

/** Signals domain — **index to OpenSearch** when signal records are created or updated. */
@injectable()
export class SignalService {
  constructor(
    @inject(TYPES.SearchService) private readonly search: SearchService,
  ) {}

  indexSignalForSearch(input: {
    orgId: string;
    signalId: string;
    name: string;
    content?: string;
  }): Promise<void> {
    return this.search.indexSignal(input);
  }
}
