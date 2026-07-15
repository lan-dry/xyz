export {
  endImpersonation,
  ImpersonationError,
  startImpersonation,
} from "./impersonation.js";
export { sessionCookieOptions } from "./cookie.js";
export {
  SALANOR_SESSION_COOKIE,
  createSession,
  deleteSession,
  generateSessionToken,
  hashSessionToken,
  resolveSession,
  resolveSessionViaId,
  switchSessionOrganization,
  type ConsoleSession,
} from "./session.js";
export {
  authenticateDevUser,
  setAccountPassword,
  type DevLoginResult,
} from "./dev-login.js";
export {
  findAccountIdByOAuth,
  linkOAuthIdentity,
  resolveOAuthLogin,
  resolveOrCreateOAuthLogin,
  registerSelfServeViaOAuth,
  OAuthLoginError,
  type OAuthLoginResult,
  type OAuthProvider,
} from "./oauth-account.js";
export {
  completeOrganizationOnboarding,
  organizationNeedsOnboarding,
  slugifyOrganizationName,
  OnboardingError,
  rebindOrganizationSlug,
} from "./onboarding.js";
export {
  updateOrganizationProfile,
  OrganizationProfileError,
} from "./organization-profile.js";
export { cleanupAbandonedPendingOrganizations } from "./abandon-onboarding.js";
export {
  provisionJitSsoMember,
  resolveSsoOrganizationBySlug,
  type SsoOrgContext,
} from "./sso-jit.js";
export {
  recordAccountLoginEvent,
  listAccountLoginEvents,
  describeUserAgent,
  type AccountLoginEventRow,
  type LoginMethod,
} from "./login-events.js";
export { hashPassword, verifyPassword } from "./password.js";
export {
  checkRateLimit,
  getClientIp,
  ingestRateLimitKey,
  loginRateLimitKey,
  oauthRateLimitKey,
  rateLimitResponse,
  readRateLimitEnv,
  type RateLimitResult,
} from "./rate-limit.js";
export {
  auditAuthLoginDenied,
  auditAuthLoginFailed,
  auditAuthLoginSuccess,
  auditAuthLogout,
  auditConsoleEvent,
  resolveAuditContextForAccount,
  resolveLoginAuditContext,
  type ConsoleAuditActor,
} from "./console-audit.js";
export {
  acceptInvitation,
  acceptInvitationWithNewAccount,
  accountExistsForEmail,
  createOrganizationInvitation,
  getMembershipById,
  getMembershipForAccountOrg,
  InviteError,
  listMembersInOrg,
  listOrganizationsForAccount,
  listPendingInvitations,
  previewInvitation,
  revokeInvitation,
  updateMemberRole,
  MemberRoleError,
  provisionOrganization,
  registerSelfServeOrganization,
  createOrganizationForAccount,
  RegisterError,
  writeAuditEvent,
  type MembershipRow,
  type OrganizationRow,
  type OrgRole,
} from "./identity.js";
export { generateInviteToken, hashInviteToken } from "./invite-token.js";
export {
  createPasswordResetToken,
  resetPasswordWithToken,
} from "./password-reset.js";
export {
  createEmailVerificationToken,
  isEmailVerified,
  verifyEmailWithToken,
} from "./email-verification.js";
export {
  isPlatformStaff,
  resolvePlatformStaffSession,
  getAccountPlatformRole,
  sessionHasPlatformPermission,
  setAccountPlatformRole,
  countSuperAdmins,
  writePlatformAuditEvent,
  PlatformRoleError,
  type PlatformStaffSession,
} from "./platform-staff.js";
export {
  PLATFORM_ROLES,
  PLATFORM_ROLE_DESCRIPTIONS,
  canActorAssignPlatformRole,
  isPlatformRole,
  platformRoleHasPermission,
  platformRoleLabel,
  type PlatformPermission,
  type PlatformRole,
} from "./platform-roles.js";
export {
  PlanLimitError,
  assertCanAddMember,
  assertCanCreateIngestKey,
  assertIngestWithinLimits,
  assertOrgActiveForIngest,
  getMonthlyEventCount,
  getOrgPlanContext,
  getOrgPlanUsageSummary,
  getPlanCatalog,
  platformGetAccount,
  platformListAccounts,
  platformListAccountsPaginated,
  platformListAuditLogs,
  platformListOrganizations,
  platformOverviewStats,
  platformResetAccountPassword,
  platformSetAccountActive,
  platformSetMembershipStatus,
  platformUpdateOrganization,
  recordNewIngestedEvent,
  backfillOrganizationUsageMonthly,
  updatePlanCatalogRow,
  type OrgPlanContext,
  type PlanCatalogRow,
  type PlatformAccountRow,
} from "./plans.js";
export {
  createAgentWithSigningKey,
  generateEd25519KeyPair,
  getOrganizationSlug,
  listAgentsForOrganization,
  type AgentCredentials,
  type AgentRow,
  type SigningKeySummary,
} from "./agent-provisioning.js";
