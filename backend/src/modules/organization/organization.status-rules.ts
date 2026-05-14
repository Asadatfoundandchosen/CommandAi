import type { IOrganization } from "./organization.model.js";

/** Allowed one-way transitions per current status (platform policy). */
const ALLOWED_STATUS_TRANSITIONS: Record<
  IOrganization["status"],
  readonly IOrganization["status"][]
> = {
  trial: ["active", "suspended"],
  active: ["suspended"],
  suspended: ["active"],
};

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly from: IOrganization["status"],
    public readonly to: IOrganization["status"],
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = "InvalidStatusTransitionError";
  }
}

export function assertValidStatusTransition(
  from: IOrganization["status"],
  to: IOrganization["status"],
): void {
  if (from === to) {
    return;
  }
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}
