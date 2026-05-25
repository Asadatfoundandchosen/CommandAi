import { injectable } from "inversify";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import type { SessionLocation } from "./auth-session.types.js";
import { recordAuthSuspiciousActivity } from "./auth-metrics.js";

export const FAILED_LOGIN_ALERT_THRESHOLD = 5;
export const FAILED_LOGIN_ALERT_WINDOW_SEC = 15 * 60;

const FAILED_IP_KEY_PREFIX = "auth:failed:ip:" as const;
const FAILED_USER_KEY_PREFIX = "auth:failed:user:" as const;
const KNOWN_LOCATION_KEY_PREFIX = "auth:known_locations:" as const;
const KNOWN_LOCATION_TTL_SEC = 365 * 24 * 60 * 60;

export type SuspiciousActivityReason =
  | "multiple_failed_logins"
  | "login_new_location"
  | "mfa_disabled";

@injectable()
export class AuthSuspiciousActivityService {
  private redis() {
    return getRedisClient();
  }

  /**
   * Track failed login attempts by IP and user; alert when threshold exceeded in the sliding window.
   */
  async recordFailedLogin(
    ipAddress: string,
    userId?: string,
  ): Promise<void> {
    const redis = this.redis();
    if (!redis) {
      return;
    }

    const ipKey = `${FAILED_IP_KEY_PREFIX}${ipAddress}`;
    const ipCount = await this.incrWithWindow(redis, ipKey);
    if (ipCount >= FAILED_LOGIN_ALERT_THRESHOLD) {
      await this.alert({
        reason: "multiple_failed_logins",
        ip_address: ipAddress,
        attempt_count: ipCount,
        scope: "ip",
      });
    }

    if (userId) {
      const userKey = `${FAILED_USER_KEY_PREFIX}${userId}`;
      const userCount = await this.incrWithWindow(redis, userKey);
      if (userCount >= FAILED_LOGIN_ALERT_THRESHOLD) {
        await this.alert({
          reason: "multiple_failed_logins",
          user_id: userId,
          attempt_count: userCount,
          scope: "user",
        });
      }
    }
  }

  /**
   * Returns true when country/city has not been seen before for this user (then records it).
   */
  async registerLoginLocation(
    userId: string,
    location: SessionLocation,
  ): Promise<boolean> {
    const redis = this.redis();
    if (!redis) {
      return false;
    }
    if (location.country === "Unknown" && location.city === "Unknown") {
      return false;
    }

    const locKey = `${location.country}:${location.city}`;
    const key = `${KNOWN_LOCATION_KEY_PREFIX}${userId}`;
    const added = await redis.sadd(key, locKey);
    await redis.expire(key, KNOWN_LOCATION_TTL_SEC);
    return added === 1;
  }

  async alertNewLocation(
    userId: string,
    orgId: string,
    location: SessionLocation,
    ipAddress: string,
  ): Promise<void> {
    await this.alert({
      reason: "login_new_location",
      user_id: userId,
      org_id: orgId,
      ip_address: ipAddress,
      location,
    });
  }

  async alertMfaDisabled(
    userId: string,
    orgId: string,
    method: "totp" | "sms",
  ): Promise<void> {
    await this.alert({
      reason: "mfa_disabled",
      user_id: userId,
      org_id: orgId,
      mfa_method: method,
    });
  }

  private async incrWithWindow(
    redis: NonNullable<ReturnType<typeof getRedisClient>>,
    key: string,
  ): Promise<number> {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, FAILED_LOGIN_ALERT_WINDOW_SEC);
    }
    return count;
  }

  private async alert(payload: Record<string, unknown>): Promise<void> {
    recordAuthSuspiciousActivity(payload.reason as SuspiciousActivityReason);
    process.stderr.write(`[AUTH ALERT] Suspicious activity ${JSON.stringify(payload)}\n`);
  }
}
