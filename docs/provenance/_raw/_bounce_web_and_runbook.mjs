import { spawn, spawnSync } from "child_process";
import { setTimeout as sleep } from "timers/promises";

function stopPort(port) {
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue }`,
    ],
    { encoding: "utf8" },
  );
}

stopPort(3000);
await sleep(2000);

// Must use spawn (not spawnSync) — next start never exits.
const start = spawn("pnpm.cmd", ["--filter", "@salanor/web-console", "start"], {
  detached: true,
  stdio: "ignore",
  shell: true,
  windowsHide: true,
});
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
  maxBuffer: 64 * 1024 * 1024,
});
process.stdout.write(walk.stdout || "");
process.stderr.write(walk.stderr || "");
process.exit(walk.status ?? 1);
