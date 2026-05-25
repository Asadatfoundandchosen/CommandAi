import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import type { UserRole } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";

import {
  recordPermissionCacheHit,
  recordPermissionCacheInvalidation,
  recordPermissionCacheMiss,
} from "./permission-cache.metrics.js";
import { PermissionResolverService } from "./permission-resolver.service.js";
import type { IRole } from "./role.model.js";
import { RoleModel } from "./role.model.js";

/** Story: cache effective permissions in Redis for fast authorization checks. */
export const PERMISSION_CACHE_TTL_SEC = 300;

const KEY_PREFIX = "permissions:";

export function permissionCacheKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

@injectable()
export class PermissionCacheService {
  private readonly ttlSec = PERMISSION_CACHE_TTL_SEC;

  constructor(
    @inject(PermissionResolverService)
    private readonly resolver: PermissionResolverService,
  ) {}

  async getPermissions(userId: string): Promise<string[]> {
    const redis = getRedisClient();
    const cacheKey = permissionCacheKey(userId);

    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as unknown;
          if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
            recordPermissionCacheHit();
            return parsed;
          }
        } catch {
          /* fall through to recompute */
        }
      }
    }

    recordPermissionCacheMiss();
    const permissions = await this.resolver.computeEffectivePermissionsUncached(userId);
    await this.set(userId, permissions);
    return permissions;
  }

  async set(userId: string, permissions: string[]): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }
    await redis.set(
      permissionCacheKey(userId),
      JSON.stringify(permissions),
      "EX",
      this.ttlSec,
    );
  }

  async invalidate(userId: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }
    await redis.del(permissionCacheKey(userId));
    recordPermissionCacheInvalidation(1);
  }

  /**
   * Invalidate cached permissions for all users affected by a role document change.
   * System roles: users with matching `user.role`. Custom roles: all users in the org (until `custom_role_id` on user).
   */
  async invalidateForRole(roleId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return;
    }

    const role = await RoleModel.findOne({ _id: roleId, is_deleted: false })
      .select("name is_system org_id")
      .lean<Pick<IRole, "name" | "is_system" | "org_id"> | null>();

    if (!role) {
      return;
    }

    const userFilter = role.is_system
      ? { role: role.name as UserRole, is_deleted: false }
      : { org_id: role.org_id, is_deleted: false };

    const users = await UserModel.find(userFilter).select("_id").lean<{ _id: mongoose.Types.ObjectId }[]>();

    await Promise.all(users.map((u) => this.invalidate(String(u._id))));
  }

  /** After system role seed or bulk permission definition changes. */
  async invalidateAll(): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      recordPermissionCacheInvalidation(keys.length);
    }
  }
}
