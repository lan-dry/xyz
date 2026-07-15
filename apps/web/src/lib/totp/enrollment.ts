import { decryptTotpSecret, encryptTotpSecret } from "./crypto";
import { createTotpSetupBundle, verifyTotpCode } from "./totp";

export type UserTotpProjection = {
  id: string;
  email: string | null;
  totpSecretEnc: string | null;
  totpEnabledAt: Date | null;
};

export type TotpEnrollmentState = "disabled" | "pending" | "enabled";

export function deriveTotpEnrollmentState(user: Pick<UserTotpProjection, "totpSecretEnc" | "totpEnabledAt">): TotpEnrollmentState {
  if (!user.totpSecretEnc) return "disabled";
  return user.totpEnabledAt ? "enabled" : "pending";
}

export async function createEnrollmentSecret(email: string | null): Promise<{
  encryptedSecret: string;
  manualKey: string;
  otpauthUrl: string;
  qrDataUrl: string;
}> {
  const setup = await createTotpSetupBundle({ email, issuer: "Salanor" });
  return {
    encryptedSecret: encryptTotpSecret(setup.secretBase32),
    manualKey: setup.manualKey,
    otpauthUrl: setup.otpauthUrl,
    qrDataUrl: setup.qrDataUrl,
  };
}

export function verifyEnrollmentCode(encryptedSecret: string, code: string): boolean {
  const secret = decryptTotpSecret(encryptedSecret);
  return verifyTotpCode(secret, code);
}

type TotpPrismaLike = {
  user: {
    findUnique(args: unknown): Promise<UserTotpProjection | null>;
    update(args: unknown): Promise<unknown>;
  };
};

export async function startEnrollmentForUser(prisma: TotpPrismaLike, userId: string): Promise<{
  manualKey: string;
  otpauthUrl: string;
  qrDataUrl: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, totpSecretEnc: true, totpEnabledAt: true },
  });
  if (!user) throw new Error("UserNotFound");
  if (deriveTotpEnrollmentState(user) === "enabled") throw new Error("AlreadyEnabled");

  const secret = await createEnrollmentSecret(user.email);
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecretEnc: secret.encryptedSecret,
      totpEnabledAt: null,
    },
  });
  return { manualKey: secret.manualKey, otpauthUrl: secret.otpauthUrl, qrDataUrl: secret.qrDataUrl };
}

export async function confirmEnrollmentForUser(prisma: TotpPrismaLike, userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, totpSecretEnc: true, totpEnabledAt: true },
  });
  if (!user?.totpSecretEnc || user.totpEnabledAt) return false;
  if (!verifyEnrollmentCode(user.totpSecretEnc, code)) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabledAt: new Date() },
  });
  return true;
}
