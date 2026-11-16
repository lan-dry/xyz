import { proxySimulator } from "@/lib/demo-simulator-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxySimulator(request, "stories", "GET");
}
