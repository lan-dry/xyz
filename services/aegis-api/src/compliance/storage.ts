import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export function complianceExportRoot(): string {
  const root =
    process.env.COMPLIANCE_EXPORT_DIR ??
    resolve(process.cwd(), ".data/compliance-exports");
  return root;
}

export function exportZipPath(
  organizationId: string,
  exportId: string,
): string {
  return join(complianceExportRoot(), organizationId, `${exportId}.zip`);
}

export function exportStorageUri(
  organizationId: string,
  exportId: string,
): string {
  const path = exportZipPath(organizationId, exportId);
  return `file://${path.replace(/\\/g, "/")}`;
}

export async function ensureExportRoot(): Promise<void> {
  await mkdir(complianceExportRoot(), { recursive: true });
}
