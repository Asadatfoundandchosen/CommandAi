import { inject, injectable } from "inversify";
import type { Request } from "express";
import { Types } from "mongoose";

import { buildAuditChanges } from "@common/audit/track-changes.js";
import { extractClientContext, resolveClientIp } from "@modules/auth/client-context.js";
import type { ClientContext } from "@modules/auth/auth-session.types.js";
import { TYPES } from "../../types.js";
import { AuditService } from "./audit.service.js";
import { ADMIN_EVENTS, type AdminEventType } from "./admin-events.js";
import { AdminCriticalAlertService } from "./admin-critical-alert.service.js";

export type AdminAuditActor = {
  /** Omit when `actorType` is `system` (platform automation). */
  userId?: string;
  actorType?: "user" | "system";
  client?: ClientContext;
  req?: Request;
};

export type AdminAuditResource = {
  type: string;
  id: string;
  name?: string;
};

export type AdminAuditChanges = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

@injectable()
export class AdminAuditService {
  constructor(
    @inject(TYPES.AuditService) private readonly audit: AuditService,
    @inject(AdminCriticalAlertService)
    private readonly criticalAlerts: AdminCriticalAlertService,
  ) {}

  /** Build actor context from an authenticated admin request (JWT `sub`). */
  actorFromRequest(req: Request): AdminAuditActor | null {
    const userId = req.user?.sub;
    if (!userId) {
      return null;
    }
    return {
      userId,
      actorType: "user",
      client: extractClientContext(req),
      req,
    };
  }

  /** JWT user, else legacy `x-user-id`, else null. */
  actorFromRequestOrHeader(req: Request): AdminAuditActor | null {
    const fromJwt = this.actorFromRequest(req);
    if (fromJwt) {
      return fromJwt;
    }
    const raw = req.headers["x-user-id"];
    const userId =
      typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
    const trimmed = String(userId ?? "").trim();
    if (!trimmed || !Types.ObjectId.isValid(trimmed)) {
      return null;
    }
    return {
      userId: trimmed,
      actorType: "user",
      client: extractClientContext(req),
      req,
    };
  }

  /** Platform-admin bearer routes without a user principal. */
  systemActorFromRequest(req: Request): AdminAuditActor {
    return { actorType: "system", req, client: extractClientContext(req) };
  }

  /**
   * Log an admin configuration change with optional before/after state.
   */
  async logAdminAction(
    action: AdminEventType,
    orgId: string,
    actor: AdminAuditActor,
    resource: AdminAuditResource,
    changes?: AdminAuditChanges,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const client =
      actor.client ?? (actor.req ? extractClientContext(actor.req) : undefined);

    const sanitizedChanges =
      changes !== undefined
        ? buildAuditChanges(changes.before, changes.after)
        : undefined;

    const meta: Record<string, unknown> = {
      ...(metadata ?? {}),
      ...(client ? { location: client.location, device: client.device } : {}),
    };

    const actorType = actor.actorType ?? "user";
    const actorId =
      actorType === "system"
        ? new Types.ObjectId("000000000000000000000000")
        : new Types.ObjectId(actor.userId ?? "000000000000000000000000");

    try {
      await this.audit.log({
        org_id: orgId,
        action,
        actor: {
          type: actorType,
          id: actorId,
          ip_address:
            client?.ip_address ??
            (actor.req ? resolveClientIp(actor.req) : "0.0.0.0"),
          user_agent:
            actor.req?.get("user-agent") ??
            (client ? `${client.device.browser}/${client.device.os}` : "unknown"),
        },
        resource: {
          type: resource.type,
          id: new Types.ObjectId(resource.id),
          name: resource.name,
        },
        ...(Object.keys(sanitizedChanges ?? {}).length > 0
          ? { changes: sanitizedChanges }
          : {}),
        metadata: meta,
      });
    } catch (e) {
      process.stderr.write(`[admin-audit] log failed for ${action}: ${String(e)}\n`);
      return;
    }

    await this.criticalAlerts.alertIfCritical(action, {
      org_id: orgId,
      actor_user_id: actor.userId ?? "system",
      actor_type: actorType,
      resource_type: resource.type,
      resource_id: resource.id,
      ...(metadata ?? {}),
    });
  }

  /** Log user role elevation or downgrade. */
  async logUserRoleChange(
    orgId: string,
    actor: AdminAuditActor,
    params: {
      targetUserId: string;
      beforeRole: string;
      afterRole: string;
      targetEmail?: string;
    },
  ): Promise<void> {
    const elevated = roleRank(params.afterRole) > roleRank(params.beforeRole);
    const action = elevated
      ? ADMIN_EVENTS.ROLE_ASSIGNED
      : ADMIN_EVENTS.ROLE_REVOKED;

    await this.logAdminAction(
      action,
      orgId,
      actor,
      {
        type: "user",
        id: params.targetUserId,
        name: params.targetEmail,
      },
      {
        before: { role: params.beforeRole },
        after: { role: params.afterRole },
      },
    );
  }
}

function roleRank(role: string): number {
  const ranks: Record<string, number> = {
    dept_user: 1,
    dept_manager: 2,
    account_admin: 3,
    org_admin: 4,
    platform_admin: 5,
  };
  return ranks[role] ?? 0;
}

export { ADMIN_EVENTS };
