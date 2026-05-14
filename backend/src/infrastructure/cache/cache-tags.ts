import { sanitizeKeyPart } from "../../common/middleware/rate-limit-sliding.js";

const SUBRESOURCE_SEGMENTS = new Set(["deliveries", "dispatch"]);

function looksLikeRecordId(s: string): boolean {
  if (SUBRESOURCE_SEGMENTS.has(s)) {
    return false;
  }
  if (/^[a-f\d]{24}$/i.test(s)) {
    return true;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * After `/api` and optional `/v1`, derive **resource** and optional **id** for response-cache tags.
 * Used on **GET** `SET` to register `cache:resp:…` keys; must align with
 * `requestCacheInvalidation({ resource, id? })` from mutations.
 */
export function getCacheTagDescriptorsForPath(
  fullPath: string,
): { resource: string; id?: string }[] {
  const p = fullPath.split("?")[0] ?? fullPath;
  const segs = p.split("/").filter(Boolean);
  if (segs[0] !== "api" || segs.length < 2) {
    return [];
  }
  let i = 1;
  if (segs[i] === "v1") {
    i += 1;
  }
  const resource = segs[i];
  if (!resource) {
    return [];
  }
  const r = sanitizeKeyPart(resource, 64);
  if (i + 1 >= segs.length) {
    return [{ resource: r }];
  }
  const next = segs[i + 1]!;
  if (SUBRESOURCE_SEGMENTS.has(next)) {
    return [{ resource: r }];
  }
  if (looksLikeRecordId(next)) {
    const id = sanitizeKeyPart(next, 128);
    return [{ resource: r }, { resource: r, id }];
  }
  return [{ resource: r }];
}
