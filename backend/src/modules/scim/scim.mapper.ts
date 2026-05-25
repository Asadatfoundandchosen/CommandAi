import { config } from "@config/index.js";
import type { IUser } from "@modules/user/user.model.js";
import type { IScimGroup } from "./scim-group.model.js";
import {
  SCIM_GROUP_SCHEMA,
  SCIM_USER_SCHEMA,
} from "./scim.constants.js";
import type {
  ScimGroupInput,
  ScimGroupResource,
  ScimUserInput,
  ScimUserResource,
} from "./scim.types.js";

const apiBase = (): string => config.apiPublicUrl.replace(/\/$/, "");

export function mapUserToScim(user: IUser, orgId: string): ScimUserResource {
  const id = String(user._id);
  const active = user.status === "active" && !user.is_deleted;

  return {
    schemas: [SCIM_USER_SCHEMA],
    id,
    externalId: user.scim_external_id ?? undefined,
    userName: user.email,
    name: {
      givenName: user.first_name,
      familyName: user.last_name,
      formatted: `${user.first_name} ${user.last_name}`.trim(),
    },
    emails: [{ value: user.email, primary: true, type: "work" }],
    active,
    meta: {
      resourceType: "User",
      created: user.created_at.toISOString(),
      lastModified: user.updated_at.toISOString(),
      location: `${apiBase()}/scim/v2/Users/${id}`,
    },
  };
}

export function mapScimUserInput(body: ScimUserInput): {
  email: string;
  first_name: string;
  last_name: string;
  active: boolean;
  external_id?: string;
} {
  const primaryEmail =
    body.emails?.find((e) => e.primary)?.value ??
    body.emails?.[0]?.value ??
    body.userName ??
    "";

  const email = primaryEmail.trim().toLowerCase();
  const given = body.name?.givenName?.trim() ?? body.displayName?.split(" ")[0] ?? "SCIM";
  const family =
    body.name?.familyName?.trim() ??
    body.displayName?.split(" ").slice(1).join(" ") ??
    "User";

  return {
    email,
    first_name: given || "SCIM",
    last_name: family || "User",
    active: body.active !== false,
    external_id: body.externalId?.trim(),
  };
}

export function mapGroupToScim(group: IScimGroup, orgId: string): ScimGroupResource {
  const id = String(group._id);
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id,
    externalId: group.external_id ?? undefined,
    displayName: group.display_name,
    members: group.members.map((m) => ({ value: String(m) })),
    meta: {
      resourceType: "Group",
      created: group.created_at.toISOString(),
      lastModified: group.updated_at.toISOString(),
      location: `${apiBase()}/scim/v2/Groups/${id}`,
    },
  };
}

export function mapScimGroupInput(body: ScimGroupInput): {
  display_name: string;
  external_id?: string;
  member_ids: string[];
} {
  return {
    display_name: (body.displayName ?? "Group").trim(),
    external_id: body.externalId?.trim(),
    member_ids: (body.members ?? [])
      .map((m) => m.value)
      .filter((v) => /^[a-fA-F0-9]{24}$/.test(v)),
  };
}
