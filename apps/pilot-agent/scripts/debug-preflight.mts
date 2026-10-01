import { loadPilotConfig } from "../src/config.js";
import { assertAegisApiReachable } from "../src/preflight.js";

console.log("cwd", process.cwd());
const pilotConfig = await loadPilotConfig();
console.log("apiBaseUrl", JSON.stringify(pilotConfig.apiBaseUrl));
console.log("HTTP_PROXY", process.env.HTTP_PROXY ?? "(none)");
await assertAegisApiReachable(pilotConfig);
console.log("ok");
