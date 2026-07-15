export { AUTH_EXTENSION_POINTS, AUTH_MODULE_VERSION } from "./constants";
export {
  ADMIN_ALLOWLIST_DENIED_MESSAGE,
  PLATFORM_SUSPENDED_MESSAGE,
  getInternalRoleForEmail,
  isAllowedAdminEmail,
} from "./admin";
export { INTERNAL_ROLES, isInternalRole, type InternalRole } from "./internal-roles";
export type { SalanorOAuthProviderId, SalanorSessionUser } from "./types";
export { useSession } from "next-auth/react";
