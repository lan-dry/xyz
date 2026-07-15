import { DEV_ORGANIZATION_ID } from "./constants";

export function resolveDevOrganizationId(): string {
  return process.env.AEGIS_DEV_ORGANIZATION_ID?.trim() || DEV_ORGANIZATION_ID;
}
