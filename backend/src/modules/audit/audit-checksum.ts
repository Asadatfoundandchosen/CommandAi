import { createHash } from "node:crypto";

import { Types } from "mongoose";

import type { AuditActor, AuditResource, IAuditLog } from "./audit.model.js";
import type { AuditEventDocument } from "./audit.types.js";

export type AuditChecksumInput = Pick<
  IAuditLog,
  "timestamp" | "action" | "actor" | "resource"
>;

function normalizeTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function normalizeActor(actor: AuditActor): Record<string, unknown> {
  return {
    type: actor.type,
    id: String(actor.id),
    ...(actor.email !== undefined ? { email: actor.email } : {}),
    ip_address: actor.ip_address,
    user_agent: actor.user_agent,
  };
}

function normalizeResource(resource: AuditResource): Record<string, unknown> {
  return {
    type: resource.type,
    id: String(resource.id),
    ...(resource.name !== undefined ? { name: resource.name } : {}),
  };
}

/** Canonical JSON payload for SHA-256 audit integrity checksums. */
export function canonicalAuditChecksumPayload(
  input: AuditChecksumInput,
): string {
  return JSON.stringify({
    timestamp: normalizeTimestamp(input.timestamp),
    action: input.action,
    actor: normalizeActor(input.actor),
    resource: normalizeResource(input.resource),
  });
}

/** SHA-256 checksum over core audit fields (tamper detection). */
export function createAuditChecksum(input: AuditChecksumInput): string {
  return createHash("sha256")
    .update(canonicalAuditChecksumPayload(input))
    .digest("hex");
}

export function verifyAuditChecksum(
  input: AuditChecksumInput,
  checksum: string | undefined,
): boolean {
  if (checksum === undefined || checksum.length === 0) {
    return true;
  }
  return createAuditChecksum(input) === checksum;
}

function actorFromSearchDocument(doc: AuditEventDocument): AuditActor | null {
  if (doc.actor) {
    return doc.actor;
  }
  if (!doc.actor_type || !doc.actor_id) {
    return null;
  }
  return {
    type: doc.actor_type as AuditActor["type"],
    id: new Types.ObjectId(doc.actor_id),
    ...(doc.actor_email !== undefined ? { email: doc.actor_email } : {}),
    ip_address: doc.ip_address ?? "0.0.0.0",
    user_agent: doc.user_agent ?? "unknown",
  };
}

function resourceFromSearchDocument(doc: AuditEventDocument): AuditResource | null {
  if (doc.resource_obj) {
    return doc.resource_obj;
  }
  const type = doc.resource_type ?? doc.resource;
  if (!type || !doc.resource_id) {
    return null;
  }
  return {
    type,
    id: new Types.ObjectId(doc.resource_id),
    ...(doc.resource_name !== undefined ? { name: doc.resource_name } : {}),
  };
}

export function auditChecksumInputFromSearchDocument(
  doc: AuditEventDocument,
): AuditChecksumInput | null {
  if (!doc.timestamp || !doc.action) {
    return null;
  }
  const actor = actorFromSearchDocument(doc);
  const resource = resourceFromSearchDocument(doc);
  if (!actor || !resource) {
    return null;
  }
  return {
    timestamp: new Date(doc.timestamp),
    action: doc.action,
    actor,
    resource,
  };
}

export function verifyAuditChecksumFromSearchDocument(
  doc: AuditEventDocument & { checksum?: string },
): boolean {
  const input = auditChecksumInputFromSearchDocument(doc);
  if (!input) {
    return true;
  }
  return verifyAuditChecksum(input, doc.checksum);
}
