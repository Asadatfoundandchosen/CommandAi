import { injectable } from "inversify";
import mongoose from "mongoose";

import { AuditLogModel } from "./audit.model.js";
import { ADMIN_WEEKLY_REPORT_JOB } from "./admin-weekly-report.constants.js";

export type AdminWeeklyOrgSummary = {
  org_id: string;
  total_events: number;
  by_action: Record<string, number>;
  by_actor: Record<string, number>;
};

export type AdminWeeklyReport = {
  period_start: string;
  period_end: string;
  org_count: number;
  total_events: number;
  organizations: AdminWeeklyOrgSummary[];
};

@injectable()
export class AdminWeeklyReportService {
  /** Aggregate `admin.*` audit events for the last 7 days per organization. */
  async buildWeeklyReport(referenceDate = new Date()): Promise<AdminWeeklyReport> {
    const periodEnd = referenceDate;
    const periodStart = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rows = await AuditLogModel.aggregate<{
      _id: { org_id: mongoose.Types.ObjectId; action: string; actor_id: mongoose.Types.ObjectId };
      count: number;
    }>([
      {
        $match: {
          timestamp: { $gte: periodStart, $lte: periodEnd },
          action: { $regex: "^admin\\." },
        },
      },
      {
        $group: {
          _id: {
            org_id: "$org_id",
            action: "$action",
            actor_id: "$actor.id",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const orgMap = new Map<string, AdminWeeklyOrgSummary>();

    for (const row of rows) {
      const orgId = String(row._id.org_id);
      const action = row._id.action;
      const actorId = String(row._id.actor_id);
      let entry = orgMap.get(orgId);
      if (!entry) {
        entry = {
          org_id: orgId,
          total_events: 0,
          by_action: {},
          by_actor: {},
        };
        orgMap.set(orgId, entry);
      }
      entry.total_events += row.count;
      entry.by_action[action] = (entry.by_action[action] ?? 0) + row.count;
      entry.by_actor[actorId] = (entry.by_actor[actorId] ?? 0) + row.count;
    }

    const organizations = [...orgMap.values()].sort(
      (a, b) => b.total_events - a.total_events,
    );

    return {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      org_count: organizations.length,
      total_events: organizations.reduce((sum, o) => sum + o.total_events, 0),
      organizations,
    };
  }

  /** BullMQ notification worker entry — writes summary to stderr (wire to email in production). */
  async processWeeklyReportJob(): Promise<void> {
    const report = await this.buildWeeklyReport();
    process.stderr.write(
      `[ADMIN REPORT] ${ADMIN_WEEKLY_REPORT_JOB} ${JSON.stringify({
        period_start: report.period_start,
        period_end: report.period_end,
        org_count: report.org_count,
        total_events: report.total_events,
        top_orgs: report.organizations.slice(0, 10).map((o) => ({
          org_id: o.org_id,
          total_events: o.total_events,
          top_actions: Object.entries(o.by_action)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
        })),
      })}\n`,
    );
  }
}
