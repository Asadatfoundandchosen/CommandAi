/**
 * Re-export shared API contract types for the backend.
 * Source of truth: shared/types/api.ts (map Mongoose IUser → User in controllers).
 */
export type { Agent, AgentStatus, TenantRole, User } from '@shared/types/api.js';
