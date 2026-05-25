export type ScimName = {
  givenName?: string;
  familyName?: string;
  formatted?: string;
};

export type ScimEmail = {
  value: string;
  primary?: boolean;
  type?: string;
};

export type ScimUserResource = {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name: ScimName;
  emails: ScimEmail[];
  active: boolean;
  meta: {
    resourceType: "User";
    created: string;
    lastModified: string;
    location: string;
  };
};

export type ScimGroupResource = {
  schemas: string[];
  id: string;
  externalId?: string;
  displayName: string;
  members: { value: string; display?: string }[];
  meta: {
    resourceType: "Group";
    created: string;
    lastModified: string;
    location: string;
  };
};

export type ScimListResponse<T> = {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
};

export type ScimPatchOperation = {
  op: "add" | "remove" | "replace";
  path?: string;
  value?: unknown;
};

export type ScimPatchBody = {
  schemas: string[];
  Operations: ScimPatchOperation[];
};

export type ScimUserInput = {
  userName?: string;
  externalId?: string;
  name?: ScimName;
  emails?: ScimEmail[];
  active?: boolean;
  displayName?: string;
};

export type ScimGroupInput = {
  displayName?: string;
  externalId?: string;
  members?: { value: string }[];
};
