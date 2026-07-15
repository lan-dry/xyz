export { AUTH_EXTENSION_POINTS, AUTH_MODULE_VERSION } from "./constants";
export {
  ADMIN_ALLOWLIST_DENIED_MESSAGE,
  PLATFORM_SUSPENDED_MESSAGE,
  getInternalRoleForEmail,
  hasInternalUserRow,
  isAllowedAdminEmail,
  maybeBootstrapInternalUser,
  resolveSignInEmail,
} from "./admin";
export { INTERNAL_ROLES, isInternalRole, type InternalRole } from "./internal-roles";
export {
  CONSOLE_ACCESS_DENIED_MESSAGE,
  hasConsoleMembership,
  hasConsoleMembershipByEmail,
  hasPendingConsoleInviteByEmail,
  isAllowedProductSignIn,
} from "./console";
export { salanorAuthConfig } from "./auth-config";
export { createSalanorAuth } from "./create-auth";
export { getOAuthProviderIds, salanorAuthProviders } from "./providers";
export type { SalanorSessionUser } from "./types";
