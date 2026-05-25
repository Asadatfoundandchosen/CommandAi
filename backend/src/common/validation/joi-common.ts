import Joi from "joi";

/** MongoDB ObjectId (24 hex chars). */
export const objectId24 = Joi.string().hex().length(24);

export const userRole = Joi.string().valid(
  "org_admin",
  "account_admin",
  "dept_manager",
  "dept_user",
);

export const userStatus = Joi.string().valid("active", "inactive", "pending");
