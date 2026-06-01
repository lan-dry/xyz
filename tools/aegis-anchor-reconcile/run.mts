import "../aegis-demo/load-root-env.mts";

import { verifyOtsProof } from "@salanor/aegis-bus";
import { prisma } from "@salanor/db";
import { createBlobStore } from "@salanor/aegis-storage";

const calendarUrl = process.env.AEGIS_OTS_CALENDAR_URL?.trim();
const dryRun = process.env.AEGIS_ANCHOR_RECONCILE_DRY_RUN === "1";

async function main(): Promise<void> {
  const blobStore = createBlobStore();
  if (!blobStore) {
    console.error("Set AEGIS_BLOB_STORE=local or s3 so OTS proofs can be loaded.");
    process.exit(1);
  }

  const pending = await prisma.aegisLedgerBatch.findMany({
    where: {
      anchorStatus: "pending",
      otsBlobKey: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: Number(process.env.AEGIS_ANCHOR_RECONCILE_LIMIT ?? "50"),
  });

  if (pending.length === 0) {
    console.log("[anchor-reconcile] no pending OTS batches");
    return;
  }

  console.log(`[anchor-reconcile] checking ${pending.length} pending batch(es)\n`);

  let anchored = 0;
  let stillPending = 0;

  for (const batch of pending) {
    const key = batch.otsBlobKey!;
    const proof = await blobStore.get(key);
    if (!proof) {
      console.warn(`[skip] batch=${batch.id} missing blob key=${key}`);
      continue;
    }

    const verified = await verifyOtsProof({
      merkleRootHex: batch.merkleRoot,
      proof,
      calendarUrl,
    });

    if (verified.upgradedProof && !verified.upgradedProof.equals(proof) && !dryRun) {
      await blobStore.put(key, verified.upgradedProof);
    }

    if (verified.status === "anchored") {
      if (!dryRun) {
        await prisma.aegisLedgerBatch.update({
          where: { id: batch.id },
          data: {
            anchorStatus: "anchored",
            anchorRef: batch.anchorRef?.replace(/^ots:/, "ots-anchored:") ?? `ots-anchored:${key}`,
          },
        });
      }
      anchored += 1;
      console.log(`[anchored] batch=${batch.id} root=${batch.merkleRoot.slice(0, 12)}…`);
    } else {
      stillPending += 1;
      console.log(
        `[pending] batch=${batch.id} root=${batch.merkleRoot.slice(0, 12)}… ${verified.detail ?? ""}`,
      );
    }
  }

  console.log(`\n[anchor-reconcile] anchored=${anchored} pending=${stillPending}${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((err) => {
    console.error("[anchor-reconcile] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
