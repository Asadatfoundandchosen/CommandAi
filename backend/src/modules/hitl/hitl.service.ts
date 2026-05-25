import { inject, injectable } from "inversify";

import {
  insertHitlDecisions,
  isTimescaleConnected,
} from "../../infrastructure/database/timescale.js";
import { TYPES } from "../../types.js";
import { CreditConsumptionService } from "../credits/credit-consumption.service.js";

export type RecordHitlDecisionInput = {
  orgId: string;
  accountId: string;
  decisionId: string;
  agentId: string;
  approved: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/** Human-in-the-loop decisions — bills **hitl** credits per decision. */
@injectable()
export class HitlService {
  constructor(
    @inject(TYPES.CreditConsumptionService)
    private readonly consumption: CreditConsumptionService,
  ) {}

  async recordDecision(input: RecordHitlDecisionInput): Promise<{
    consumed: number;
    remaining: number;
  }> {
    const result = await this.consumption.consumeCredits({
      orgId: input.orgId,
      accountId: input.accountId,
      type: "hitl",
      referenceId: input.decisionId,
      description: `HITL decision ${input.decisionId} (${input.approved ? "approved" : "rejected"})`,
    });

    if (isTimescaleConnected()) {
      try {
        await insertHitlDecisions([
          {
            time: new Date(),
            orgId: input.orgId,
            decisionId: input.decisionId,
            agentId: input.agentId,
            approved: input.approved,
            reason: input.reason,
            metadata: {
              account_id: input.accountId,
              credits_consumed: result.consumed,
              ...input.metadata,
            },
          },
        ]);
      } catch (err) {
        process.stderr.write(
          `[hitl] Timescale hitl_decisions insert failed: ${String(err)}\n`,
        );
      }
    }

    process.stdout.write(
      `[hitl] org=${input.orgId} account=${input.accountId} decision=${input.decisionId} credits=${result.consumed} remaining=${result.remaining}\n`,
    );
    return { consumed: result.consumed, remaining: result.remaining };
  }
}
