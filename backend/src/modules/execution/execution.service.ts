import { inject, injectable } from "inversify";

import type { ExecutionJob } from "../../infrastructure/queue/queues/execution.queue.js";
import { TYPES } from "../../types.js";
import { CreditConsumptionService } from "../credits/credit-consumption.service.js";

/** Agent / workflow execution — bills **action** credits on run. */
@injectable()
export class ExecutionService {
  constructor(
    @inject(TYPES.CreditConsumptionService)
    private readonly consumption: CreditConsumptionService,
  ) {}

  /** Process execution queue job and deduct account credits. */
  async processExecutionJob(job: ExecutionJob): Promise<{
    consumed: number;
    remaining: number;
  }> {
    if (!job.accountId) {
      throw new Error(`Execution job ${job.executionId} requires accountId for billing`);
    }

    const result = await this.consumption.consumeCredits({
      orgId: job.orgId,
      accountId: job.accountId,
      type: "action",
      referenceId: job.executionId,
      description: `Execution ${job.executionId} (run ${job.runId})`,
    });
    process.stdout.write(
      `[execution] org=${job.orgId} account=${job.accountId} execution=${job.executionId} credits=${result.consumed} remaining=${result.remaining}\n`,
    );
    return { consumed: result.consumed, remaining: result.remaining };
  }
}
