import { Container } from "inversify";

import { HierarchyValidator } from "./common/validators/hierarchy.validator.js";
import { DepartmentRepository } from "./modules/department/department.repository.js";
import { DepartmentService } from "./modules/department/department.service.js";
import { DepartmentController } from "./modules/department/department.controller.js";
import { AccountRepository } from "./modules/account/account.repository.js";
import { AccountService } from "./modules/account/account.service.js";
import { AccountController } from "./modules/account/account.controller.js";
import { OrganizationRepository } from "./modules/organization/organization.repository.js";
import { OrganizationService } from "./modules/organization/organization.service.js";
import { OrganizationController } from "./modules/organization/organization.controller.js";
import { AgentService } from "./modules/agents/agents.service.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { WebhookRepository } from "./modules/webhooks/webhook.repository.js";
import { WebhookService } from "./modules/webhooks/webhook.service.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { FileService } from "./modules/files/file.service.js";
import { FilesController } from "./modules/files/file.controller.js";
import { SearchService } from "./modules/search/search.service.js";
import { SearchController } from "./modules/search/search.controller.js";
import { SignalService } from "./modules/signals/signals.service.js";
import { WebhooksController } from "./modules/webhooks/webhook.controller.js";
import { UserRepository } from "./modules/user/user.repository.js";
import { UserService } from "./modules/user/user.service.js";
import { UserController } from "./modules/user/user.controller.js";
import { TYPES } from "./types.js";

const container = new Container();

container
  .bind<HierarchyValidator>(TYPES.HierarchyValidator)
  .to(HierarchyValidator)
  .inSingletonScope();
container
  .bind<DepartmentRepository>(TYPES.DepartmentRepository)
  .to(DepartmentRepository)
  .inSingletonScope();
container
  .bind<DepartmentService>(TYPES.DepartmentService)
  .to(DepartmentService)
  .inSingletonScope();
container
  .bind<AccountRepository>(TYPES.AccountRepository)
  .to(AccountRepository)
  .inSingletonScope();
container
  .bind<AccountService>(TYPES.AccountService)
  .to(AccountService)
  .inSingletonScope();
container
  .bind<OrganizationRepository>(TYPES.OrganizationRepository)
  .to(OrganizationRepository)
  .inSingletonScope();
container
  .bind<OrganizationService>(TYPES.OrganizationService)
  .to(OrganizationService)
  .inSingletonScope();
container
  .bind<UserRepository>(TYPES.UserRepository)
  .to(UserRepository)
  .inSingletonScope();
container
  .bind<UserService>(TYPES.UserService)
  .to(UserService)
  .inSingletonScope();
container
  .bind<AgentService>(TYPES.AgentService)
  .to(AgentService)
  .inSingletonScope();
container
  .bind<AuthService>(TYPES.AuthService)
  .to(AuthService)
  .inSingletonScope();
container
  .bind<WebhookRepository>(TYPES.WebhookRepository)
  .to(WebhookRepository)
  .inSingletonScope();
container
  .bind<WebhookService>(TYPES.WebhookService)
  .to(WebhookService)
  .inSingletonScope();
container
  .bind<AuditService>(TYPES.AuditService)
  .to(AuditService)
  .inSingletonScope();
container
  .bind<SearchService>(TYPES.SearchService)
  .to(SearchService)
  .inSingletonScope();
container
  .bind<SignalService>(TYPES.SignalService)
  .to(SignalService)
  .inSingletonScope();
container
  .bind<FileService>(TYPES.FileService)
  .to(FileService)
  .inSingletonScope();
container.bind<UserController>(UserController).toSelf().inSingletonScope();
container
  .bind<OrganizationController>(OrganizationController)
  .toSelf()
  .inSingletonScope();
container.bind<AccountController>(AccountController).toSelf().inSingletonScope();
container
  .bind<DepartmentController>(DepartmentController)
  .toSelf()
  .inSingletonScope();
container.bind<FilesController>(FilesController).toSelf().inSingletonScope();
container.bind<SearchController>(SearchController).toSelf().inSingletonScope();
container.bind<WebhooksController>(WebhooksController).toSelf().inSingletonScope();

export { container };
