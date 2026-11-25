import { getConfig } from "@/lib/server/config";
import { json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export function GET() {
  return json(getConfig());
}
