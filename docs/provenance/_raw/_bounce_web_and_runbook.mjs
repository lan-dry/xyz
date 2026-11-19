import { spawnSync } from "child_process";
import { setTimeout as sleep } from "timers/promises";

function ps(command) {
  return spawnSync("powershell", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    shell: false,
  });
}

function stopPort(port) {
  ps(
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue }`,
  );
}

stopPort(3000);
await sleep(2000);

const start = spawnSync(
  "pnpm.cmd",
  ["--filter", "@salanor/web-console", "start"],
  {
    detached: true,
    stdio: "ignore",
    shell: true,
    windowsHide: true,
  },
);
if (start.error) {
  console.error(start.error);
  process.exit(1);
}
start.unref();

let ok = false;
for (let i = 0; i < 90; i++) {
  await sleep(1000);
  try {
    const r = await fetch("http://localhost:3000/login");
    if (r.status === 200) {
      ok = true;
      break;
    }
  } catch {
    /* retry */
  }
}
if (!ok) {
  console.error("web-console did not come up on :3000");
  process.exit(1);
}

const walk = spawnSync("pnpm", ["demo:runbook-walk"], {
  encoding: "utf8",
  shell: true,
  stdio: "inherit",
});
process.exit(walk.status ?? 1);
