import { Container } from "inversify";

import { HierarchyValidator } from "./common/validators/hierarchy.validator.js";
import { DepartmentRepository } from "./modules/department/department.repository.js";
import { DepartmentService } from "./modules/department/department.service.js";
import { DepartmentController } from "./modules/department/department.controller.js";
import { AccountRepository } from "./modules/account/account.repository.js";
import { AccountService } from "./modules/account/account.service.js";
import { AccountController } from "./modules/account/account.controller.js";
import { PlanLimitsValidator } from "./common/validators/plan-limits.validator.js";
import { BillingController } from "./modules/billing/billing.controller.js";
import { PlanController } from "./modules/plans/plan.controller.js";
import { PlanService } from "./modules/plans/plan.service.js";
import { StripeService } from "./modules/billing/stripe.service.js";
import { StripeWebhookService } from "./modules/billing/stripe-webhook.service.js";
import { UsageController } from "./modules/billing/usage.controller.js";
import { UsageService } from "./modules/billing/usage.service.js";
import { AccountBudgetService } from "./modules/credits/account-budget.service.js";
import { CreditAllocationService } from "./modules/credits/credit-allocation.service.js";
import { AccountBudgetController } from "./modules/account/account-budget.controller.js";
import { CreditConsumptionService } from "./modules/credits/credit-consumption.service.js";
import { CreditAlertService } from "./modules/credits/credit-alert.service.js";
import { CreditRatesService } from "./modules/credits/credit-rates.service.js";
import { CreditPurchaseService } from "./modules/credits/credit-purchase.service.js";
import { CreditsController } from "./modules/credits/credits.controller.js";
import { CreditHistoryService } from "./modules/credits/credit-history.service.js";
import { CreditService } from "./modules/credits/credit.service.js";
import { ExecutionService } from "./modules/execution/execution.service.js";
import { HitlService } from "./modules/hitl/hitl.service.js";
import { ContractController } from "./modules/contract/contract.controller.js";
import { ContractExpiryNotificationService } from "./modules/contract/contract.expiry-notifications.js";
import { ContractRenewalService } from "./modules/contract/contract-renewal.service.js";
import { ContractRepository } from "./modules/contract/contract.repository.js";
import { ContractService } from "./modules/contract/contract.service.js";
import { OrganizationRepository } from "./modules/organization/organization.repository.js";
import { OrganizationService } from "./modules/organization/organization.service.js";
import { OrganizationController } from "./modules/organization/organization.controller.js";
import { AgentService } from "./modules/agents/agents.service.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { JwtService } from "./modules/auth/jwt.service.js";
import { PasswordService } from "./modules/auth/password.service.js";
import { RefreshTokenStore } from "./modules/auth/refresh-token.store.js";
import { TokenBlacklistService } from "./modules/auth/token-blacklist.service.js";
import { LockoutAlertService } from "./modules/auth/lockout-alert.service.js";
import { AuthSessionService } from "./modules/auth/auth-session.service.js";
import { BackupCodesService } from "./modules/auth/backup-codes.service.js";
import { MfaService } from "./modules/auth/mfa.service.js";
import { SmsMfaService } from "./modules/auth/sms-mfa.service.js";
import { LockoutService } from "./modules/auth/lockout.service.js";
import { MagicLinkService } from "./modules/auth/magic-link.service.js";
import { SamlController } from "./modules/auth/saml.controller.js";
import { OidcService } from "./modules/auth/oidc.service.js";
import { OidcController } from "./modules/auth/oidc.controller.js";
import { SamlService } from "./modules/auth/saml.service.js";
import { EmergencyAccessAlertService } from "./modules/auth/emergency-access-alert.service.js";
import { EmergencyAccessService } from "./modules/auth/emergency-access.service.js";
import { GroupMappingService } from "./modules/auth/group-mapping.service.js";
import { SsoEnforcementService } from "./modules/auth/sso-enforcement.service.js";
import { JitProvisioningService } from "./modules/auth/jit-provisioning.service.js";
import { OrganizationOidcController } from "./modules/organization/organization-oidc.controller.js";
import { OrganizationSamlController } from "./modules/organization/organization-saml.controller.js";
import { OrganizationGroupMappingController } from "./modules/organization/organization-group-mapping.controller.js";
import { OrganizationSsoEnforcementController } from "./modules/organization/organization-sso-enforcement.controller.js";
import { OrganizationSsoMappingController } from "./modules/organization/organization-sso-mapping.controller.js";
import { OrganizationScimController } from "./modules/organization/organization-scim.controller.js";
import { ScimController } from "./modules/scim/scim.controller.js";
import { ScimService } from "./modules/scim/scim.service.js";
import { ApiKeyController } from "./modules/api-keys/api-key.controller.js";
import { ApiKeyService } from "./modules/api-keys/api-key.service.js";
import { RoleController } from "./modules/rbac/role.controller.js";
import { PermissionCacheService } from "./modules/rbac/permission-cache.service.js";
import { PermissionResolverService } from "./modules/rbac/permission-resolver.service.js";
import { RoleService } from "./modules/rbac/role.service.js";
import { MfaPolicyController } from "./modules/mfa-policy/mfa-policy.controller.js";
import { MfaPolicyReminderService } from "./modules/mfa-policy/mfa-policy-reminder.service.js";
import { MfaPolicyService } from "./modules/mfa-policy/mfa-policy.service.js";
import { TokenReuseAlertService } from "./modules/auth/token-reuse-alert.service.js";
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
  .bind<PlanLimitsValidator>(TYPES.PlanLimitsValidator)
  .to(PlanLimitsValidator)
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
  .bind<ContractRepository>(TYPES.ContractRepository)
  .to(ContractRepository)
  .inSingletonScope();
container
  .bind<ContractService>(TYPES.ContractService)
  .to(ContractService)
  .inSingletonScope();
container
  .bind<ContractExpiryNotificationService>(TYPES.ContractExpiryNotificationService)
  .to(ContractExpiryNotificationService)
  .inSingletonScope();
container
  .bind<ContractRenewalService>(TYPES.ContractRenewalService)
  .to(ContractRenewalService)
  .inSingletonScope();
container.bind<ContractController>(ContractController).toSelf().inSingletonScope();
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
container.bind<JwtService>(JwtService).toSelf().inSingletonScope();
container
  .bind<PasswordService>(TYPES.PasswordService)
  .to(PasswordService)
  .inSingletonScope();
container.bind<RefreshTokenStore>(RefreshTokenStore).toSelf().inSingletonScope();
container
  .bind<TokenBlacklistService>(TokenBlacklistService)
  .toSelf()
  .inSingletonScope();
container
  .bind<TokenReuseAlertService>(TokenReuseAlertService)
  .toSelf()
  .inSingletonScope();
container.bind<AuthSessionService>(AuthSessionService).toSelf().inSingletonScope();
container.bind<MfaService>(MfaService).toSelf().inSingletonScope();
container.bind<BackupCodesService>(BackupCodesService).toSelf().inSingletonScope();
container.bind<SmsMfaService>(SmsMfaService).toSelf().inSingletonScope();
container.bind<MagicLinkService>(MagicLinkService).toSelf().inSingletonScope();
container.bind<JitProvisioningService>(JitProvisioningService).toSelf().inSingletonScope();
container.bind<GroupMappingService>(GroupMappingService).toSelf().inSingletonScope();
container.bind<SsoEnforcementService>(SsoEnforcementService).toSelf().inSingletonScope();
container.bind<EmergencyAccessService>(EmergencyAccessService).toSelf().inSingletonScope();
container
  .bind<EmergencyAccessAlertService>(EmergencyAccessAlertService)
  .toSelf()
  .inSingletonScope();
container.bind<SamlService>(SamlService).toSelf().inSingletonScope();
container.bind<SamlController>(SamlController).toSelf().inSingletonScope();
container.bind<OidcService>(OidcService).toSelf().inSingletonScope();
container.bind<OidcController>(OidcController).toSelf().inSingletonScope();
container.bind<OrganizationSamlController>(OrganizationSamlController).toSelf().inSingletonScope();
container.bind<OrganizationOidcController>(OrganizationOidcController).toSelf().inSingletonScope();
container
  .bind<OrganizationSsoMappingController>(OrganizationSsoMappingController)
  .toSelf()
  .inSingletonScope();
container
  .bind<OrganizationGroupMappingController>(OrganizationGroupMappingController)
  .toSelf()
  .inSingletonScope();
container
  .bind<OrganizationSsoEnforcementController>(OrganizationSsoEnforcementController)
  .toSelf()
  .inSingletonScope();
container.bind<ScimService>(ScimService).toSelf().inSingletonScope();
container.bind<ScimController>(ScimController).toSelf().inSingletonScope();
container.bind<PermissionResolverService>(PermissionResolverService).toSelf().inSingletonScope();
container.bind<PermissionCacheService>(PermissionCacheService).toSelf().inSingletonScope();
container.bind<RoleService>(RoleService).toSelf().inSingletonScope();
container.bind<RoleController>(RoleController).toSelf().inSingletonScope();
container.bind<ApiKeyService>(ApiKeyService).toSelf().inSingletonScope();
container.bind<ApiKeyController>(ApiKeyController).toSelf().inSingletonScope();
container.bind<OrganizationScimController>(OrganizationScimController).toSelf().inSingletonScope();
container.bind<MfaPolicyService>(MfaPolicyService).toSelf().inSingletonScope();
container
  .bind<MfaPolicyReminderService>(TYPES.MfaPolicyReminderService)
  .to(MfaPolicyReminderService)
  .inSingletonScope();
container.bind<MfaPolicyController>(MfaPolicyController).toSelf().inSingletonScope();
container.bind<LockoutService>(LockoutService).toSelf().inSingletonScope();
container
  .bind<LockoutAlertService>(LockoutAlertService)
  .toSelf()
  .inSingletonScope();
container
  .bind<AuthService>(TYPES.AuthService)
  .to(AuthService)
  .inSingletonScope();
container.bind<AuthController>(AuthController).toSelf().inSingletonScope();
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
container
  .bind<StripeService>(TYPES.StripeService)
  .to(StripeService)
  .inSingletonScope();
container
  .bind<StripeWebhookService>(TYPES.StripeWebhookService)
  .to(StripeWebhookService)
  .inSingletonScope();
container.bind<BillingController>(BillingController).toSelf().inSingletonScope();
container
  .bind<PlanService>(TYPES.PlanService)
  .to(PlanService)
  .inSingletonScope();
container.bind<PlanController>(PlanController).toSelf().inSingletonScope();
container
  .bind<UsageService>(TYPES.UsageService)
  .to(UsageService)
  .inSingletonScope();
container.bind<UsageController>(UsageController).toSelf().inSingletonScope();
container
  .bind<CreditService>(TYPES.CreditService)
  .to(CreditService)
  .inSingletonScope();
container
  .bind<CreditHistoryService>(TYPES.CreditHistoryService)
  .to(CreditHistoryService)
  .inSingletonScope();
container
  .bind<CreditPurchaseService>(TYPES.CreditPurchaseService)
  .to(CreditPurchaseService)
  .inSingletonScope();
container
  .bind<CreditAllocationService>(TYPES.CreditAllocationService)
  .to(CreditAllocationService)
  .inSingletonScope();
container
  .bind<AccountBudgetService>(TYPES.AccountBudgetService)
  .to(AccountBudgetService)
  .inSingletonScope();
container
  .bind<AccountBudgetController>(AccountBudgetController)
  .toSelf()
  .inSingletonScope();
container
  .bind<CreditConsumptionService>(TYPES.CreditConsumptionService)
  .to(CreditConsumptionService)
  .inSingletonScope();
container
  .bind<CreditRatesService>(TYPES.CreditRatesService)
  .to(CreditRatesService)
  .inSingletonScope();
container
  .bind<CreditAlertService>(TYPES.CreditAlertService)
  .to(CreditAlertService)
  .inSingletonScope();
container
  .bind<ExecutionService>(TYPES.ExecutionService)
  .to(ExecutionService)
  .inSingletonScope();
container.bind<HitlService>(TYPES.HitlService).to(HitlService).inSingletonScope();
container.bind<CreditsController>(CreditsController).toSelf().inSingletonScope();

export { container };
