export { DepartmentController } from "./department.controller.js";
export type { IDepartment } from "./department.model.js";
export { DepartmentModel } from "./department.model.js";
export { DepartmentRepository } from "./department.repository.js";
export { createDepartmentsRouter } from "./department.routes.js";
export {
  DepartmentService,
  AccountNotInOrganizationError,
} from "./department.service.js";
export {
  departmentScopeQuerySchema,
  departmentIdParamSchema,
  createDepartmentBodySchema,
  updateDepartmentBodySchema,
  type CreateDepartmentBody,
  type UpdateDepartmentBody,
} from "./department.validation.js";
