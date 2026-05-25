import { inject, injectable } from "inversify";
import type { Request } from "express";
import { Types } from "mongoose";

import { TYPES } from "../../types.js";
import { AuditService } from "../audit/audit.service.js";
import {
  extractClientContext,
  resolveClientIp,
} from "./client-context.js";
import type { ClientContext } from "./auth-session.types.js";
import { AUTH_EVENTS, type AuthEventType } from "./auth-events.js";
import { AuthSuspiciousActivityService } from "./auth-suspicious-activity.service.js";

const AUTH_RESOURCE_TYPE = "auth";
const UNKNOWN_USER_ID = new Types.ObjectId("000000000000000000000000");

export type AuthAuditDetails = {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  email?: string;
  method?: string;
  reason?: string;
  mfaMethod?: "totp" | "sms";
  [key: string]: unknown;
};

@injectable()
export class AuthAuditService {
  constructor(
    @inject(TYPES.AuditService) private readonly audit: AuditService,
    @inject(AuthSuspiciousActivityService)
    private readonly suspicious: AuthSuspiciousActivityService,
  ) {}

  /**
   * Log an authentication event to the audit trail (MongoDB + OpenSearch).
   * Includes IP, user agent, and location in metadata.
   */
  async logAuthEvent(
    event: AuthEventType,
    options: {
      req?: Request;
      client?: ClientContext;
      orgId?: string;
      userId?: string;
      sessionId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const client = options.client ?? (options.req ? extractClientContext(options.req) : undefined);
    const orgId = options.orgId;
    if (!orgId) {
      process.stderr.write(`[auth-audit] skipped ${event}: missing orgId\n`);
      return;
    }

    const actorUserId = options.userId
      ? new Types.ObjectId(options.userId)
      : UNKNOWN_USER_ID;

    const resourceId = actorUserId;

    const metadata: Record<string, unknown> = {
      ...(options.metadata ?? {}),
      ...(options.sessionId ? { session_id: options.sessionId } : {}),
      ...(client
        ? {
            location: client.location,
            device: client.device,
          }
        : {}),
    };

    try {
      await this.audit.log({
        org_id: orgId,
        action: event,
        actor: {
          type: options.userId ? "user" : "system",
          id: actorUserId,
          ip_address: client?.ip_address ?? (options.req ? resolveClientIp(options.req) : "0.0.0.0"),
          user_agent:
            options.req?.get("user-agent") ??
            (client ? `${client.device.browser}/${client.device.os}` : "unknown"),
        },
        resource: {
          type: AUTH_RESOURCE_TYPE,
          id: resourceId,
        },
        metadata,
        ...(options.req ? {} : {}),
      });
    } catch (e) {
      process.stderr.write(`[auth-audit] log failed for ${event}: ${String(e)}\n`);
    }
  }

  async logLoginSuccess(
    client: ClientContext | undefined,
    params: {
      userId: string;
      orgId: string;
      sessionId: string;
      email: string;
      method: string;
    },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.LOGIN_SUCCESS, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      sessionId: params.sessionId,
      metadata: {
        email: params.email,
        method: params.method,
      },
    });

    if (!client) {
      return;
    }

    const isNewLocation = await this.suspicious.registerLoginLocation(
      params.userId,
      client.location,
    );
    if (isNewLocation) {
      await this.suspicious.alertNewLocation(
        params.userId,
        params.orgId,
        client.location,
        client.ip_address,
      );
    }
  }

  async logLoginFailed(
    client: ClientContext | undefined,
    params: {
      reason: string;
      email?: string;
      userId?: string;
      orgId?: string;
      method?: string;
    },
  ): Promise<void> {
    const ip = client?.ip_address ?? "0.0.0.0";
    await this.suspicious.recordFailedLogin(ip, params.userId);

    if (!params.orgId) {
      return;
    }

    await this.logAuthEvent(AUTH_EVENTS.LOGIN_FAILED, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      metadata: {
        reason: params.reason,
        email: params.email,
        method: params.method,
      },
    });
  }

  async logLogout(
    client: ClientContext | undefined,
    params: { userId: string; orgId: string; sessionId?: string },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.LOGOUT, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      sessionId: params.sessionId,
    });
  }

  async logMfaEnabled(
    client: ClientContext | undefined,
    params: {
      userId: string;
      orgId: string;
      method: "totp" | "sms";
    },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.MFA_ENABLED, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      metadata: { mfa_method: params.method },
    });
  }

  async logMfaVerified(
    client: ClientContext | undefined,
    params: {
      userId: string;
      orgId: string;
      method: "totp" | "sms" | "backup";
    },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.MFA_VERIFIED, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      metadata: { mfa_method: params.method },
    });
  }

  async logMfaDisabled(
    client: ClientContext | undefined,
    params: {
      userId: string;
      orgId: string;
      method: "totp" | "sms";
    },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.MFA_DISABLED, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      metadata: { mfa_method: params.method },
    });
    await this.suspicious.alertMfaDisabled(params.userId, params.orgId, params.method);
  }

  async logPasswordChanged(
    client: ClientContext | undefined,
    params: {
      userId: string;
      orgId: string;
      changedByUserId?: string;
    },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.PASSWORD_CHANGED, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      metadata: {
        changed_by: params.changedByUserId ?? params.userId,
      },
    });
  }

  async logPasswordReset(
    client: ClientContext | undefined,
    params: {
      userId: string;
      orgId: string;
      sessionId?: string;
    },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.PASSWORD_RESET, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      sessionId: params.sessionId,
      metadata: { method: "magic_link" },
    });
  }

  async logSessionRevoked(
    client: ClientContext | undefined,
    params: {
      userId: string;
      orgId: string;
      sessionId?: string;
      scope: "single" | "all" | "admin_revoke";
      targetUserId?: string;
    },
  ): Promise<void> {
    await this.logAuthEvent(AUTH_EVENTS.SESSION_REVOKED, {
      client,
      orgId: params.orgId,
      userId: params.userId,
      sessionId: params.sessionId,
      metadata: {
        scope: params.scope,
        target_user_id: params.targetUserId,
      },
    });
  }
}

export { AUTH_EVENTS };
