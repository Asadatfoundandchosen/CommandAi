import { inject, injectable } from "inversify";

import type { SignalJob } from "../../infrastructure/queue/queues/signal.queue.js";
import { TYPES } from "../../types.js";
import { CreditConsumptionService } from "../credits/credit-consumption.service.js";
import { SearchService } from "../search/search.service.js";

/** Signals domain — consumption billing + OpenSearch indexing. */
@injectable()
export class SignalService {
  constructor(
    @inject(TYPES.SearchService) private readonly search: SearchService,
    @inject(TYPES.CreditConsumptionService)
    private readonly consumption: CreditConsumptionService,
  ) {}

  /** Process signal queue job: deduct credits, optional search index. */
  async processSignalJob(job: SignalJob): Promise<{
    consumed: number;
    remaining: number;
  }> {
    if (!job.accountId || job.orgId === "system") {
      process.stdout.write(
        `[signals] skipped consumption signal=${job.signalId} (no account scope)\n`,
      );
      return { consumed: 0, remaining: 0 };
    }

    const result = await this.consumption.consumeCredits({
      orgId: job.orgId,
      accountId: job.accountId,
      type: "signal",
      referenceId: job.signalId,
      description: `Signal ${job.signalId} (agent ${job.agentId})`,
    });

    const name =
      typeof job.payload.name === "string" ? job.payload.name : `Signal ${job.signalId}`;
    const content =
      typeof job.payload.content === "string" ? job.payload.content : undefined;
    try {
      await this.indexSignalForSearch({
        orgId: job.orgId,
        signalId: job.signalId,
        name,
        content,
      });
    } catch (err) {
      process.stderr.write(
        `[signals] search index failed signal=${job.signalId}: ${String(err)}\n`,
      );
    }

    process.stdout.write(
      `[signals] org=${job.orgId} account=${job.accountId} signal=${job.signalId} credits=${result.consumed} remaining=${result.remaining}\n`,
    );
    return { consumed: result.consumed, remaining: result.remaining };
  }

  indexSignalForSearch(input: {
    orgId: string;
    signalId: string;
    name: string;
    content?: string;
  }): Promise<void> {
    return this.search.indexSignal(input);
  }
}
