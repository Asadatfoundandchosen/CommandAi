import type { ScimPatchBody } from "./scim.types.js";

function readPathSegments(path?: string): string[] {
  if (!path) {
    return [];
  }
  return path
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean);
}

/** Apply SCIM PATCH operations to a plain user patch object. */
export function applyScimUserPatch(
  current: Record<string, unknown>,
  body: ScimPatchBody,
): Record<string, unknown> {
  const next = { ...current };

  for (const op of body.Operations ?? []) {
    const operation = op.op.toLowerCase();
    const segments = readPathSegments(op.path);

    if (operation === "replace" && segments.length === 0 && typeof op.value === "object") {
      Object.assign(next, op.value as Record<string, unknown>);
      continue;
    }

    if (segments[0] === "active" && operation === "replace") {
      next.active = op.value;
      continue;
    }

    if (segments[0] === "userName" && operation === "replace") {
      next.userName = op.value;
      continue;
    }

    if (segments[0] === "name" && segments[1] === "givenName" && operation === "replace") {
      next.name = { ...(next.name as Record<string, unknown>), givenName: op.value };
      continue;
    }

    if (segments[0] === "name" && segments[1] === "familyName" && operation === "replace") {
      next.name = { ...(next.name as Record<string, unknown>), familyName: op.value };
      continue;
    }

    if (segments[0] === "emails" && operation === "replace" && Array.isArray(op.value)) {
      next.emails = op.value;
    }
  }

  return next;
}

/** Apply SCIM PATCH to group members (replace members array). */
export function applyScimGroupPatch(
  body: ScimPatchBody,
): { displayName?: string; memberIds?: string[] } {
  const result: { displayName?: string; memberIds?: string[] } = {};

  for (const op of body.Operations ?? []) {
    const operation = op.op.toLowerCase();
    const segments = readPathSegments(op.path);

    if (segments[0] === "displayName" && operation === "replace") {
      result.displayName = String(op.value ?? "");
    }

    if (segments[0] === "members" && operation === "replace" && Array.isArray(op.value)) {
      result.memberIds = (op.value as { value?: string }[])
        .map((m) => m.value)
        .filter((v): v is string => typeof v === "string" && /^[a-fA-F0-9]{24}$/.test(v));
    }

    if (segments[0] === "members" && operation === "add" && Array.isArray(op.value)) {
      const added = (op.value as { value?: string }[])
        .map((m) => m.value)
        .filter((v): v is string => typeof v === "string" && /^[a-fA-F0-9]{24}$/.test(v));
      result.memberIds = [...(result.memberIds ?? []), ...added];
    }
  }

  return result;
}
