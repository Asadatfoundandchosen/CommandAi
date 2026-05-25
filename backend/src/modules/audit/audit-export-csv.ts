import { escapeCsvField } from "../credits/credit-history.logic.js";
import type { AuditEventSearchHit } from "./audit.types.js";

const CSV_HEADERS = [
  "timestamp",
  "actor_email",
  "action",
  "resource_type",
  "resource_id",
  "actor_id",
  "ip_address",
  "request_id",
  "integrity_valid",
] as const;

function readSourceField(
  source: Record<string, unknown>,
  key: string,
): string {
  const v = source[key];
  if (v === undefined || v === null) {
    return "";
  }
  return String(v);
}

function readActorEmail(source: Record<string, unknown>): string {
  const direct = readSourceField(source, "actor_email");
  if (direct.length > 0) {
    return direct;
  }
  const actor = source.actor;
  if (actor !== null && typeof actor === "object" && "email" in actor) {
    const email = (actor as { email?: unknown }).email;
    if (typeof email === "string") {
      return email;
    }
  }
  return "";
}

function readResourceType(source: Record<string, unknown>): string {
  const direct = readSourceField(source, "resource_type");
  if (direct.length > 0) {
    return direct;
  }
  const legacy = readSourceField(source, "resource");
  if (legacy.length > 0) {
    return legacy;
  }
  const obj = source.resource_obj;
  if (obj !== null && typeof obj === "object" && "type" in obj) {
    return String((obj as { type: unknown }).type);
  }
  return "";
}

function readResourceId(source: Record<string, unknown>): string {
  const direct = readSourceField(source, "resource_id");
  if (direct.length > 0) {
    return direct;
  }
  const obj = source.resource_obj;
  if (obj !== null && typeof obj === "object" && "id" in obj) {
    return String((obj as { id: unknown }).id);
  }
  return "";
}

export function auditHitToCsvRow(hit: AuditEventSearchHit): string[] {
  const source = hit._source;
  return [
    readSourceField(source, "timestamp"),
    readActorEmail(source),
    readSourceField(source, "action"),
    readResourceType(source),
    readResourceId(source),
    readSourceField(source, "actor_id") || readSourceField(source, "user_id"),
    readSourceField(source, "ip_address"),
    readSourceField(source, "request_id"),
    hit.integrity_valid === false ? "false" : "true",
  ];
}

export function auditHitsToCsv(hits: AuditEventSearchHit[]): string {
  const header = CSV_HEADERS.join(",");
  const lines = hits.map((hit) =>
    auditHitToCsvRow(hit)
      .map((v) => escapeCsvField(v))
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function auditHitsToJson(hits: AuditEventSearchHit[]): {
  exported_at: string;
  total: number;
  events: Array<{
    id: string;
    score: number | null;
    integrity_valid?: boolean;
    source: Record<string, unknown>;
  }>;
} {
  return {
    exported_at: new Date().toISOString(),
    total: hits.length,
    events: hits.map((h) => ({
      id: h._id,
      score: h._score,
      ...(h.integrity_valid !== undefined ? { integrity_valid: h.integrity_valid } : {}),
      source: h._source,
    })),
  };
}
