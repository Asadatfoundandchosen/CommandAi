import { Router } from "express";

import {
  getScheduleOverrides,
  initScheduler,
  resyncScheduledJob,
  scheduledJobs,
  setScheduleOverride,
} from "./scheduler.js";

/**
 * GET /api/scheduler — definitions + Redis repeatable state + active overrides.
 * PUT /api/scheduler/:name — body `{ "cron"?, "timezone"? }` updates override and resyncs that job.
 * POST /api/scheduler/reload — full `initScheduler()` (re-applies all repeats).
 */
export function createSchedulerRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const overrides = Object.fromEntries(getScheduleOverrides());
      const rows = await Promise.all(
        scheduledJobs.map(async (def) => {
          const repeatables = await def.queue.getRepeatableJobs();
          const match = repeatables.find(
            (r) => r.name === def.name || r.key.includes(def.name),
          );
          return {
            name: def.name,
            queue: def.queue.name,
            baseCron: def.cron,
            baseTimezone: def.timezone,
            override: overrides[def.name] ?? null,
            repeatable: match ?? null,
          };
        }),
      );
      res.status(200).json({ schedules: rows, overrides });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.put("/:name", async (req, res) => {
    const { name } = req.params;
    const body = req.body as Partial<{ cron: string; timezone: string }>;
    if (!scheduledJobs.some((j) => j.name === name)) {
      res.status(404).json({ error: "Unknown schedule name" });
      return;
    }
    try {
      setScheduleOverride(name, {
        ...(body.cron !== undefined ? { cron: body.cron } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      });
      await resyncScheduledJob(name);
      res.status(200).json({ ok: true, name });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.post("/reload", async (_req, res) => {
    try {
      await initScheduler();
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
