import { DEV_ORGANIZATION_ID } from "./constants";

export function resolveDevOrganizationId(): string {
  return process.env.ATTEST_DEV_ORGANIZATION_ID?.trim() || DEV_ORGANIZATION_ID;
}
