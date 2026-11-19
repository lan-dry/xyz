import pg from "pg";
import {
  LogicalReplicationService,
  PgoutputPlugin,
} from "pg-logical-replication";

const app = new pg.Client({
  connectionString:
    "postgresql://bank_app:bank_app_dev@127.0.0.1:5436/bank_core",
});
await app.connect();
const txn = "txn_smoke2_" + Date.now();
await app.query(
  `INSERT INTO bank_transaction (txn_id, account_id, case_id, amount, currency, direction, status)
   VALUES ($1,'ACCT-SMOKE','LN-SMOKE-2',99999,'RWF','credit','posted')`,
  [txn],
);
await app.end();
console.log("inserted", txn);

const service = new LogicalReplicationService(
  {
    host: "127.0.0.1",
    port: 5436,
    user: "aegis_collector",
    password: "aegis_collector_dev",
    database: "bank_core",
  },
  {
    acknowledge: { auto: false, timeoutSeconds: 5 },
    flowControl: { enabled: true },
  },
);

let hit = false;
service.on("data", async (lsn, log) => {
  if (log.tag === "insert" && log.relation?.name === "bank_transaction") {
    console.log("CDC bank_transaction", JSON.stringify(log.new));
    hit = true;
  }
  if (log.tag === "commit") {
    await service.acknowledge(log.commitEndLsn ?? lsn);
    if (hit) {
      console.log("PASS");
      await service.stop();
      process.exit(0);
    }
  }
});
setTimeout(async () => {
  console.log("TIMEOUT hit=" + hit);
  await service.stop().catch(() => {});
  process.exit(hit ? 0 : 2);
}, 10_000);

await service.subscribe(
  new PgoutputPlugin({
    protoVersion: 1,
    publicationNames: ["aegis_collector"],
  }),
  "aegis_collector_slot",
);
