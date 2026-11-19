/**
 * Live smoke: INSERT via bank_app, consume via aegis_collector + pgoutput.
 * Exit 0 on at least one insert/update/delete observed.
 */
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
await app.query(`INSERT INTO bank_account (account_id, customer_name, currency, balance)
  VALUES ('ACCT-SMOKE', 'Smoke', 'RWF', 0) ON CONFLICT DO NOTHING`);
const txn = "txn_smoke_" + Date.now();
await app.query(
  `INSERT INTO bank_transaction (txn_id, account_id, case_id, amount, currency, direction, status)
   VALUES ($1,'ACCT-SMOKE','LN-SMOKE-1',12345,'RWF','credit','posted')`,
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

let seen = 0;
service.on("data", async (lsn, log) => {
  if (log.tag === "insert" || log.tag === "update" || log.tag === "delete") {
    console.log(
      "CDC",
      log.tag,
      `${log.relation?.schema}.${log.relation?.name}`,
      `lsn=${lsn}`,
      JSON.stringify(log.new || log.key || log.old),
    );
    seen++;
  }
  if (log.tag === "commit") {
    const ack = log.commitEndLsn ?? log.commitLsn ?? lsn;
    await service.acknowledge(ack);
    if (seen > 0) {
      console.log("PASS seen=" + seen);
      await service.stop();
      process.exit(0);
    }
  }
});
service.on("error", (e) => console.error("err", e.message));

const plugin = new PgoutputPlugin({
  protoVersion: 1,
  publicationNames: ["aegis_collector"],
});
setTimeout(async () => {
  console.log("TIMEOUT seen=" + seen);
  await service.stop().catch(() => {});
  process.exit(seen > 0 ? 0 : 2);
}, 12_000);

await service.subscribe(plugin, "aegis_collector_slot");
